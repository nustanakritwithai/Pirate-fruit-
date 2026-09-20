import { describe, expect, it } from 'vitest';
import type { RealtimeServerMessage, WorldMonsterSnapshot } from '@pirate-fruit/shared';
import { CentralPlayerHits } from './centralPlayerHits.js';

const player = { characterId: 'player-1', islandId: 'starter-island', x: 22, z: -4, playerVitalsReady: true, blocking: true };
const monster = { spawnId: 'starter-crab-1', monsterId: 'crab', islandId: 'starter-island', x: 22, z: -4,
  hp: 70, maxHp: 70, state: 'attack', heading: 0 } as WorldMonsterSnapshot;
const attack: RealtimeServerMessage = { type: 'world-monster-attack', seq: 1, attack: {
  attackId: 'starter-crab-1:1', spawnId: monster.spawnId, monsterId: 'crab', islandId: 'starter-island',
  targetId: player.characterId, action: 'melee', damage: 7, hitDelayMs: 180,
} };

describe('original player hit frame queue', () => {
  it('requires capability and deduplicates observer deliveries until a durable acknowledgement', () => {
    const queue = new CentralPlayerHits();
    queue.capture([attack], [{ ...player, playerVitalsReady: false }], 1000);
    expect(queue.export()).toEqual([]);
    queue.capture([attack, attack], [player], 1000);
    queue.resolve([player], [monster], 1179);
    expect(queue.ready()).toEqual([]);
    queue.resolve([player], [monster], 1180);
    expect(queue.ready()).toHaveLength(1);
    const [pending] = queue.ready();
    expect(queue.get(pending!.key, 'other-player')).toBeUndefined();
    const restored = new CentralPlayerHits();
    restored.restore(JSON.parse(JSON.stringify(queue.export())));
    expect(restored.get(pending!.key, player.characterId)?.resolved).toMatchObject({ damage: 7, blocking: true });
    // เปลี่ยนตำแหน่งระหว่าง CAS retry ไม่เปลี่ยนผล hit ที่ตัดสินแล้ว
    restored.resolve([{ ...player, x: 200, blocking: false }], [monster], 2000);
    expect(restored.get(pending!.key, player.characterId)?.resolved?.blocking).toBe(true);
    expect(restored.acknowledge(pending!.key, 'other-player')).toBe(false);
    expect(restored.acknowledge(pending!.key, player.characterId)).toBe(true);
    expect(restored.export()).toEqual([]);
  });

  it('cancels an interrupted original swing and permits dodging before the hit frame', () => {
    const queue = new CentralPlayerHits();
    queue.capture([attack], [player], 1000);
    queue.capture([{ type: 'world-monster-delta', seq: 2, islandId: 'starter-island',
      updates: [{ ...monster, cancelAttackId: 'starter-crab-1:1' }] }], [player], 1100);
    queue.resolve([player], [monster], 1180);
    expect(queue.export()).toEqual([]);
    queue.capture([attack], [player], 1200);
    queue.resolve([{ ...player, x: 50 }], [monster], 1380);
    expect(queue.export()).toEqual([]);
  });

  it('uses a new epoch after restart so original attack sequence reuse cannot suppress a new hit', () => {
    const first = new CentralPlayerHits();
    first.capture([attack], [player], 1000);
    const second = new CentralPlayerHits();
    second.restore(first.export());
    second.capture([attack], [player], 2000);
    expect(new Set(second.export().map(hit => hit.key)).size).toBe(2);
  });
});
