import { describe, expect, it } from 'vitest';
import { CentralWorldWorker } from './centralWorker.js';

const profile = {
  level: 1,
  stats: { combat: 1, vitality: 1, blade: 1, ranged: 1, fruitPower: 1, mana: 1 },
  maxHp: 100, maxEnergy: 100, maxMp: 100,
  weaponCategory: 'style', activeSkillCategory: 'style', allowedSkillCategories: ['style'],
} as const;

describe('CentralWorldWorker pure adapter', () => {
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
