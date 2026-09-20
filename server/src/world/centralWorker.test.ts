import { describe, expect, it } from 'vitest';
import { CentralWorldWorker } from './centralWorker.js';
import type { MonsterWorldStateSnapshot } from './monsterWorldService.js';

const profile = {
  level: 1,
  stats: { combat: 1, vitality: 1, blade: 1, ranged: 1, fruitPower: 1, mana: 1 },
  maxHp: 100, maxEnergy: 100, maxMp: 100,
  weaponCategory: 'style', activeSkillCategory: 'style', allowedSkillCategories: ['style'],
} as const;

describe('CentralWorldWorker pure adapter', () => {
  it('commits player and owned hits to the same enemy and waits for durable reward acknowledgement', async () => {
    const worker = new CentralWorldWorker(() => 10_000);
    const players = [{ characterId: 'player-1', islandId: 'starter-island', x: 22, y: 0, z: -4, profile }];
    const initial = await worker.handle({ id: 1, op: 'step', now: 10_000, players });
    type Snapshot = { monsters: { spawnId: string; hp: number }[] };
    const hp = (reply: Record<string, unknown>) => (reply.snapshots as Snapshot[])[0].monsters.find(monster => monster.spawnId === 'starter-crab-1')!.hp;
    const playerHit = await worker.handle({ id: 2, op: 'step', now: 10_100, players,
      intents: [{ characterId: 'player-1', intentId: 'player-hit-fixture-1', spawnIds: ['starter-crab-1'], kind: 'melee' }] });
    expect(hp(playerHit)).toBeLessThan(hp(initial));
    const ownedHit = await worker.handle({ id: 3, op: 'owned-hit', now: 10_100,
      ownerId: 'player-1', actorId: 'owned:fixture', targetSpawnId: 'starter-crab-1',
      x: 22, z: -4, expectedHp: hp(playerHit), damage: 1, range: 3 });
    expect(ownedHit).toMatchObject({ ok: true, result: { hp: hp(playerHit) - 1 } });
    const after = await worker.handle({ id: 4, op: 'step', now: 10_200, players });
    expect(hp(after)).toBe(hp(playerHit) - 1);
    const kill = await worker.handle({ id: 5, op: 'owned-hit', now: 10_200,
      ownerId: 'player-1', actorId: 'owned:fixture', targetSpawnId: 'starter-crab-1',
      x: 22, z: -4, expectedHp: hp(after), damage: hp(after), range: 3 });
    expect(kill).toMatchObject({ ok: true, result: { dead: true, hp: 0 } });
    const pending = await worker.handle({ id: 6, op: 'step', now: 10_300, players });
    const rewards = pending.pendingRewards as { key: string; characterId: string }[];
    expect(rewards).toHaveLength(1);
    expect(rewards[0].characterId).toBe('player-1');
    const messages = (value: Record<string, unknown>) => (value.deliveries as { message: { type: string; seq: number } }[]).map(delivery => delivery.message);
    expect(messages(pending).some(message => message.type === 'world-monster-dead')).toBe(false);
    // จำลอง server ดับหลังศัตรูตายแต่ก่อนบันทึก/ack รางวัล ต้องคืน receipt เดิม
    const exported = await worker.handle({ id: 61, op: 'export-world', now: 10_300 });
    const restarted = new CentralWorldWorker(() => 10_300);
    await restarted.handle({ id: 62, op: 'restore-world', now: 10_300,
      worldState: exported.worldState as MonsterWorldStateSnapshot });
    const recovered = await restarted.handle({ id: 63, op: 'step', now: 10_300, players });
    expect(hp(recovered)).toBe(0);
    expect(recovered.pendingRewards).toMatchObject([{ key: rewards[0].key, characterId: 'player-1' }]);
    expect(await restarted.handle({ id: 64, op: 'restore-world', now: 10_300,
      worldState: exported.worldState as MonsterWorldStateSnapshot })).toMatchObject({ ok: false, error: 'world-state-restore-too-late' });
    await worker.handle({ id: 7, op: 'reward-ack', now: 10_300, rewardKey: rewards[0].key,
      outcome: { rewards: [{ monsterId: 'crab', playerExp: 1, coins: 1, masteryExp: 0 }], coinsTotal: 1 } });
    const acknowledged = await worker.handle({ id: 8, op: 'step', now: 10_400, players });
    expect(messages(acknowledged).some(message => message.type === 'world-monster-dead')).toBe(true);
    expect(messages(acknowledged).every(message => message.seq > 0)).toBe(true);
  });
  it('returns authoritative snapshots and enforces owned-hit CAS without starting a timer', async () => {
    const worker = new CentralWorldWorker(() => 1_000);
    const step = await worker.handle({
      id: 'step-1', op: 'step', now: 1_000,
      players: [{ characterId: 'player-1', islandId: 'starter-island', x: 22, y: 0, z: -4, profile }],
    });
    const monster = (step.snapshots as { monsters: { spawnId: string; hp: number }[] }[])[0].monsters.find((entry) => entry.spawnId === 'starter-crab-1')!;
    const miss = await worker.handle({ id: 'hit-1', op: 'owned-hit', now: 1_000, ownerId: 'player-1', actorId: 'owned-1', targetSpawnId: monster.spawnId, x: 22, z: -4, expectedHp: monster.hp - 1, damage: 0 });
    expect(miss.ok).toBe(false);
    const accepted = await worker.handle({ id: 'hit-2', op: 'owned-hit', now: 1_000, ownerId: 'player-1', actorId: 'owned-1', targetSpawnId: monster.spawnId, x: 22, z: -4, expectedHp: monster.hp, damage: 0 });
    expect(accepted).toMatchObject({ id: 'hit-2', ok: true, result: { hp: monster.hp, damage: 0, dead: false } });
  });
});
