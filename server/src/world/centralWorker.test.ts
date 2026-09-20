import { describe, expect, it } from 'vitest';
import { CentralWorldWorker } from './centralWorker.js';
import type { MonsterWorldStateSnapshot } from './monsterWorldService.js';
import { defaultPlayerState } from '../player/playerState.js';
import type { PendingPlayerHit } from './centralPlayerHits.js';

const profile = {
  level: 1,
  stats: { combat: 1, vitality: 1, blade: 1, ranged: 1, fruitPower: 1, mana: 1 },
  maxHp: 100, maxEnergy: 100, maxMp: 100,
  weaponCategory: 'style', activeSkillCategory: 'style', allowedSkillCategories: ['style'],
} as const;

describe('CentralWorldWorker pure adapter', () => {
  it('routes canonical vitals tick, snapshot and idempotent potion operation', async () => {
    const worker = new CentralWorldWorker(() => 100_000);
    const state = defaultPlayerState();
    state.checkpoint.hp = 40;
    state.checkpoint.energy = 50;
    state.inventory.consumables['potion-hp'] = 1;
    state.pveVitals = { lastDamageAtMs: 93_000, potionCooldownUntil: 0, buffCooldowns: {}, buffMultiplier: 1, buffUntil: 0 };
    const tick = await worker.handle({ id: 'vitals-tick', op: 'vitals-tick', now: 100_000, dtMs: 1_000,
      state, flags: { playerVitalsReady: true, blocking: false } });
    expect(tick).toMatchObject({ ok: true, changed: true, state: { checkpoint: { hp: 43.5, energy: 66 } } });
    const snapshot = await worker.handle({ id: 'vitals-snapshot', op: 'vitals-snapshot', now: 100_000, state: tick.state });
    expect(snapshot).toMatchObject({ ok: true, snapshot: { contract: 'pirate-vitals/1', hp: 43.5, maxHp: 100 } });
    const operation = await worker.handle({ id: 'vitals-op', op: 'state-operation', now: 100_000, revision: 2,
      state: tick.state, characterId: 'player-1', commandId: 'vitals-command-0001',
      operation: { type: 'vitalsPotion', potionId: 'potion-hp', idempotencyKey: 'vitals:potion:1' } });
    expect(operation).toMatchObject({ ok: true, state: { checkpoint: { hp: 100 }, inventory: { consumables: { 'potion-hp': 0 } } } });
    const replay = await worker.handle({ id: 'vitals-replay', op: 'state-operation', now: 100_000, revision: 2,
      state: operation.state, characterId: 'player-1', commandId: 'vitals-command-0001',
      operation: { type: 'vitalsPotion', potionId: 'potion-hp', idempotencyKey: 'vitals:potion:1' } });
    expect(replay).toMatchObject({ ok: true, state: { checkpoint: { hp: 100 }, inventory: { consumables: { 'potion-hp': 0 } } } });
  });

  it('previews a restored trusted hit without committing it until ack and rejects client-invented keys', async () => {
    const worker = new CentralWorldWorker(() => 1000);
    const exported = await worker.handle({ id: 1, op: 'export-world', now: 1000 });
    const hit: PendingPlayerHit = { key: 'pve:fixture:starter-crab-1:1', characterId: 'player-1', dueAt: 1180,
      attack: { attackId: 'starter-crab-1:1', spawnId: 'starter-crab-1', monsterId: 'crab',
        islandId: 'starter-island', targetId: 'player-1', action: 'melee', damage: 7, hitDelayMs: 180 },
      resolved: { damage: 7, blocking: false, sourceX: 22, sourceZ: -4, at: 1180 } };
    await worker.handle({ id: 2, op: 'restore-world', now: 1180,
      worldState: { ...(exported.worldState as MonsterWorldStateSnapshot), pendingPlayerHits: [hit] } });
    const state = defaultPlayerState();
    const preview = await worker.handle({ id: 3, op: 'player-hit-preview', now: 1180,
      hitKey: hit.key, characterId: hit.characterId, state });
    expect(preview).toMatchObject({ ok: true, state: { checkpoint: { hp: state.checkpoint.hp - 7 } } });
    const again = await worker.handle({ id: 4, op: 'player-hit-preview', now: 1190,
      hitKey: hit.key, characterId: hit.characterId, state: JSON.parse(JSON.stringify(preview.state)) });
    expect(again).toMatchObject({ ok: true, replay: true, state: { checkpoint: { hp: state.checkpoint.hp - 7 } } });
    expect(await worker.handle({ id: 5, op: 'player-hit-preview', now: 1190,
      hitKey: 'pve:invented', characterId: hit.characterId, state })).toMatchObject({ ok: false });
    await worker.handle({ id: 6, op: 'player-hit-ack', now: 1190, hitKey: hit.key, characterId: hit.characterId });
    expect(await worker.handle({ id: 7, op: 'player-hit-preview', now: 1190,
      hitKey: hit.key, characterId: hit.characterId, state })).toMatchObject({ ok: false });
  });

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
