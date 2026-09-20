import {
  MONSTER_REWARD_TABLE, MONSTER_PROTOCOL_SCHEMA_VERSION, MONSTER_KILLS_MAX_COUNT,
  MONSTER_KILLS_MAX_ENTRIES, STAT_POINTS_PER_LEVEL, computeEnemyReward, applyExpToProgress,
  QUESTS_BY_ID, applyMasteryExp as applySharedMasteryExp,
  type MonsterKillEntry, type MonsterKillsResponse,
} from '@pirate-fruit/shared';
import type { CanonicalMasteryEntry, CanonicalPlayerState } from './playerState.js';
import { applyQuestProgress } from '../quest/newquestRules.js';

type RewardReceipt = { key: string; kills: string; outcome: MonsterKillsResponse };
export type CentralCanonicalState = CanonicalPlayerState & { rewardReceipts?: RewardReceipt[] };

/** สูตรเดียวกับ client MasterySystem และ persisted player-state projection */
export function applyCanonicalMasteryExp(state: CanonicalPlayerState, amount: number): void {
  const loadout = state.inventory.loadout;
  const itemId = loadout.activeSet === 'fruit'
    ? loadout.equippedFruitId
    : loadout.equippedWeaponKind === 'sword'
      ? loadout.equippedSwordId
      : loadout.equippedWeaponKind === 'gun'
        ? loadout.equippedGunId
        : loadout.equippedFightingStyleId;
  if (!itemId || !Number.isFinite(amount) || amount <= 0) return;
  const category: CanonicalMasteryEntry['category'] = loadout.activeSet === 'fruit'
    ? 'fruit'
    : loadout.equippedWeaponKind === 'sword'
      ? 'sword'
      : loadout.equippedWeaponKind === 'gun'
        ? 'gun'
        : 'style';
  const entry: CanonicalMasteryEntry = state.progression.mastery[itemId] ?? { itemId, category, level: 1, exp: 0 };
  applySharedMasteryExp(entry, amount);
  state.progression.mastery[itemId] = entry;
}

/** เตรียม transaction เท่านั้น: C# ต้อง CAS commit state ก่อนตอบ reward-ack ให้โลกเดิม */
export function prepareCanonicalReward(
  current: CentralCanonicalState, rewardKey: string, kills: readonly MonsterKillEntry[],
): { state: CentralCanonicalState; outcome: MonsterKillsResponse } {
  if (!rewardKey || rewardKey.length > 128 || !Array.isArray(kills)
    || kills.length < 1 || kills.length > MONSTER_KILLS_MAX_ENTRIES) throw new Error('INVALID_REWARD');
  for (const kill of kills) {
    if (!MONSTER_REWARD_TABLE[kill.monsterId] || !Number.isInteger(kill.count)
      || kill.count < 1 || kill.count > MONSTER_KILLS_MAX_COUNT) throw new Error('INVALID_KILL');
  }
  const identity = JSON.stringify(kills.map(kill => [kill.monsterId, kill.count]));
  const receipt = current.rewardReceipts?.find(item => item.key === rewardKey);
  if (receipt) {
    if (receipt.kills !== identity) throw new Error('IDEMPOTENCY_KEY_REUSED');
    return { state: structuredClone(current), outcome: { ...structuredClone(receipt.outcome), idempotentReplay: true } };
  }
  const state = structuredClone(current);
  // ใช้ databook และสูตรเดียวกับ PostgresMonsterRepository/accrueServerExp เดิม
  const rewards = kills.map(kill => {
    const reward = computeEnemyReward(state.progression.level, MONSTER_REWARD_TABLE[kill.monsterId]!);
    return { monsterId: kill.monsterId, count: kill.count,
      playerExp: reward.playerExp * kill.count, coins: reward.coins * kill.count,
      masteryExp: reward.masteryExp * kill.count };
  });
  const totals = rewards.reduce((sum, reward) => ({ playerExp: sum.playerExp + reward.playerExp,
    coins: sum.coins + reward.coins, masteryExp: sum.masteryExp + reward.masteryExp }),
  { playerExp: 0, coins: 0, masteryExp: 0 });
  const progress = applyExpToProgress(state.progression, totals.playerExp);
  state.progression.level = progress.level;
  state.progression.exp = progress.exp;
  state.progression.statPoints += progress.levelsGained * STAT_POINTS_PER_LEVEL;
  state.progression.coins += totals.coins;
  applyCanonicalMasteryExp(state, totals.masteryExp);
  const activeQuestId = state.progression.activeQuestId;
  const activeQuest = activeQuestId ? QUESTS_BY_ID.get(activeQuestId) : undefined;
  if (activeQuest) {
    const questEvents = kills.map(kill => ({
      kind: 'kill' as const,
      targetId: kill.monsterId,
      amount: kill.count,
      isBoss: MONSTER_REWARD_TABLE[kill.monsterId]!.isBoss,
    }));
    const questProgress = applyQuestProgress(activeQuest, state.progression.activeQuestProgress, questEvents);
    state.progression.activeQuestProgress = questProgress.progress;
  }
  const outcome: MonsterKillsResponse = { ok: true, schemaVersion: MONSTER_PROTOCOL_SCHEMA_VERSION,
    rewards, totals, coinsTotal: state.progression.coins, idempotentReplay: false };
  // Receipt อยู่ใน transaction เดียวกับเงิน/EXP เพื่อส่ง ack ซ้ำได้โดยไม่แจกซ้ำ
  state.rewardReceipts = [...(state.rewardReceipts ?? []), { key: rewardKey, kills: identity, outcome }].slice(-256);
  return { state, outcome };
}
