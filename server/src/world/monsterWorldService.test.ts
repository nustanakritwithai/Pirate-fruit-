import { describe, expect, it } from 'vitest';
import {
  MONSTER_PROTOCOL_SCHEMA_VERSION,
  SHARED_MONSTER_TYPES,
  SHARED_WORLD_SPAWNS,
  WORLD_MONSTER_SKILL_DAMAGE,
  type MonsterKillsResponse,
  type RealtimeServerMessage,
} from '@pirate-fruit/shared';
import type { RealtimeHub } from '../realtime/realtimeHub.js';
import { MonsterWorldService } from './monsterWorldService.js';

describe('MonsterWorldService rewards', () => {
  it('commits one idempotent reward before broadcasting the credited death', async () => {
    const broadcasts: RealtimeServerMessage[] = [];
    const hub = {
      broadcastWorldMonster: (_islandId: string, message: RealtimeServerMessage) => {
        broadcasts.push(message);
      },
    } as unknown as RealtimeHub;
    const calls: Array<{ characterId: string; body: unknown }> = [];
    const spawn = SHARED_WORLD_SPAWNS[0]!;
    const type = SHARED_MONSTER_TYPES[spawn.monsterId]!;
    const rewards = {
      async grantKills(characterId: string, body: unknown): Promise<MonsterKillsResponse> {
        calls.push({ characterId, body });
        return {
          ok: true,
          schemaVersion: MONSTER_PROTOCOL_SCHEMA_VERSION,
          rewards: [{
            monsterId: spawn.monsterId,
            count: 1,
            playerExp: 25,
            coins: 9,
            masteryExp: 4,
          }],
          totals: { playerExp: 25, coins: 9, masteryExp: 4 },
          coinsTotal: 109,
          idempotentReplay: false,
        };
      },
    };
    const service = new MonsterWorldService(hub, { now: () => 1_000, rewards });
    const hitCount = Math.ceil(type.maxHp / WORLD_MONSTER_SKILL_DAMAGE);

    for (let index = 0; index < hitCount; index += 1) {
      service.handleHit(
        'character-a',
        spawn.islandId,
        spawn.homeX,
        spawn.homeZ,
        spawn.spawnId,
        'skill',
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      characterId: 'character-a',
      body: {
        schemaVersion: MONSTER_PROTOCOL_SCHEMA_VERSION,
        kills: [{ monsterId: spawn.monsterId, count: 1 }],
      },
    });
    const request = calls[0].body as { idempotencyKey: string };
    expect(request.idempotencyKey).toMatch(/^world-kill:/);
    const death = broadcasts.find((message) => message.type === 'world-monster-dead');
    expect(death).toMatchObject({
      type: 'world-monster-dead',
      spawnId: spawn.spawnId,
      byId: 'character-a',
      reward: {
        monsterId: spawn.monsterId,
        playerExp: 25,
        coins: 9,
        masteryExp: 4,
        coinsTotal: 109,
      },
    });
  });

  it('retries a transient reward failure without broadcasting an uncredited death', async () => {
    const broadcasts: RealtimeServerMessage[] = [];
    const hub = {
      broadcastWorldMonster: (_islandId: string, message: RealtimeServerMessage) => broadcasts.push(message),
      worldPlayerViews: () => [],
    } as unknown as RealtimeHub;
    const spawn = SHARED_WORLD_SPAWNS[0]!;
    const type = SHARED_MONSTER_TYPES[spawn.monsterId]!;
    let now = 2_000;
    let attempts = 0;
    const rewards = {
      async grantKills(): Promise<MonsterKillsResponse> {
        attempts += 1;
        if (attempts === 1) throw new Error('temporary database outage');
        return {
          ok: true,
          schemaVersion: MONSTER_PROTOCOL_SCHEMA_VERSION,
          rewards: [{ monsterId: spawn.monsterId, count: 1, playerExp: 25, coins: 9, masteryExp: 4 }],
          totals: { playerExp: 25, coins: 9, masteryExp: 4 },
          coinsTotal: 109,
          idempotentReplay: false,
        };
      },
    };
    const service = new MonsterWorldService(hub, { now: () => now, rewards });
    for (let index = 0; index < Math.ceil(type.maxHp / WORLD_MONSTER_SKILL_DAMAGE); index += 1) {
      service.handleHit('character-a', spawn.islandId, spawn.homeX, spawn.homeZ, spawn.spawnId, 'skill');
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(attempts).toBe(1);
    expect(broadcasts.some((message) => message.type === 'world-monster-dead')).toBe(false);

    now += 300;
    (service as unknown as { tick(): void }).tick();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(attempts).toBe(2);
    expect(broadcasts.some((message) => message.type === 'world-monster-dead')).toBe(true);
  });
});
