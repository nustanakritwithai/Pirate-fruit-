import {
  MONSTER_PROTOCOL_SCHEMA_VERSION,
  SHARED_WORLD_SPAWNS,
  WORLD_MONSTER_TICK_MS,
  type RealtimeServerMessage,
} from '@pirate-fruit/shared';
import { MonsterSimulation } from './monsterSimulation.js';
import type { AttackKind } from '../realtime/combatAuthority.js';
import type { RealtimeHub, WorldMonsterBridge } from '../realtime/realtimeHub.js';
import type { PostgresWorldMonsterRepository, WorldMonsterRow } from './worldMonsterRepository.js';
import type { MonsterService } from '../monster/monsterService.js';

interface ServiceLogger {
  warn(fields: object, message: string): void;
}

interface PendingDeathReward {
  characterId: string;
  islandId: string;
  spawnId: string;
  monsterId: string;
  idempotencyKey: string;
  retryAt: number;
  attempts: number;
  inFlight: boolean;
}

export interface MonsterWorldServiceOptions {
  now?: () => number;
  repository?: PostgresWorldMonsterRepository;
  logger?: ServiceLogger;
  /** persist ทุกกี่ ms (นอกจากตอน shutdown) */
  persistIntervalMs?: number;
  /** Server-authoritative reward transaction for a confirmed shared-world death. */
  rewards?: Pick<MonsterService, 'grantKills'>;
}

/**
 * S16 — เจ้าของ MonsterWorld ฝั่ง Server: ขับ tick (rate-limited) + สะพานเข้า hub
 * + persist สถานะเพื่อกู้คืนหลัง restart. เป็น interest ระดับเกาะ (คุมต้นทุน broadcast)
 */
export class MonsterWorldService implements WorldMonsterBridge {
  private readonly sim: MonsterSimulation;
  private readonly now: () => number;
  private readonly persistIntervalMs: number;
  private readonly spawnMeta = new Map<string, { islandId: string; monsterId: string }>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastTickAt: number;
  private persistAccumMs = 0;
  private readonly pendingRewards = new Map<string, PendingDeathReward>();

  constructor(
    private readonly hub: RealtimeHub,
    private readonly options: MonsterWorldServiceOptions = {},
  ) {
    this.now = options.now ?? (() => Date.now());
    this.persistIntervalMs = options.persistIntervalMs ?? 10_000;
    this.sim = new MonsterSimulation(this.now);
    this.lastTickAt = this.now();
    for (const spawn of SHARED_WORLD_SPAWNS) {
      this.spawnMeta.set(spawn.spawnId, { islandId: spawn.islandId, monsterId: spawn.monsterId });
    }
  }

  /** โหลดสถานะที่ persist ไว้ (restart recovery) */
  async load(): Promise<void> {
    if (!this.options.repository) return;
    try {
      const states = await this.options.repository.loadAll();
      if (states.length > 0) this.sim.restore(states);
    } catch (error) {
      this.options.logger?.warn({ err: error }, 'world monster restore failed; starting fresh');
    }
  }

  /** เริ่มรอบจำลอง + ต่อ hub */
  start(): void {
    this.hub.attachWorldMonsters(this);
    this.lastTickAt = this.now();
    this.timer = setInterval(() => this.tick(), WORLD_MONSTER_TICK_MS);
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.persist();
  }

  // ---- WorldMonsterBridge ----
  snapshotMessageForIsland(islandId: string): RealtimeServerMessage {
    return {
      type: 'world-monster-snapshot',
      seq: 0,
      islandId,
      monsters: this.sim.snapshotForIsland(islandId),
    };
  }

  handleHit(
    characterId: string,
    _islandId: string,
    x: number,
    z: number,
    spawnId: string,
    kind: AttackKind,
  ): void {
    const result = this.sim.applyHit(this.now(), spawnId, characterId, x, z, kind);
    if (!result) return;
    this.hub.broadcastWorldMonster(result.islandId, {
      type: 'world-monster-delta',
      seq: 0,
      islandId: result.islandId,
      updates: [result.delta],
    });
    if (result.dead) {
      const idempotencyKey = `world-kill:${spawnId}:${this.now()}`;
      if (!this.options.rewards) {
        this.hub.broadcastWorldMonster(result.islandId, {
          type: 'world-monster-dead',
          seq: 0,
          spawnId,
          byId: characterId,
        });
        return;
      }
      // Keep the death pending until the idempotent reward transaction commits.
      // A transient database outage can no longer turn a confirmed kill into a
      // permanently reward-less death while this process remains alive.
      this.pendingRewards.set(idempotencyKey, {
        characterId,
        islandId: result.islandId,
        spawnId,
        monsterId: result.monsterId,
        idempotencyKey,
        retryAt: this.now(),
        attempts: 0,
        inFlight: false,
      });
      this.processPendingRewards();
    }
  }

  private async grantDeathReward(
    characterId: string,
    monsterId: string,
    idempotencyKey: string,
  ) {
    const body = {
      schemaVersion: MONSTER_PROTOCOL_SCHEMA_VERSION,
      idempotencyKey,
      kills: [{ monsterId, count: 1 }],
    };
    return this.options.rewards!.grantKills(characterId, body);
  }

  private processPendingRewards(): void {
    if (!this.options.rewards) return;
    const now = this.now();
    for (const pending of this.pendingRewards.values()) {
      if (pending.inFlight || pending.retryAt > now) continue;
      pending.inFlight = true;
      pending.attempts += 1;
      void this.grantDeathReward(
        pending.characterId,
        pending.monsterId,
        pending.idempotencyKey,
      ).then((outcome) => {
        const granted = outcome.rewards[0];
        this.pendingRewards.delete(pending.idempotencyKey);
        this.hub.broadcastWorldMonster(pending.islandId, {
          type: 'world-monster-dead',
          seq: 0,
          spawnId: pending.spawnId,
          byId: pending.characterId,
          reward: granted ? {
            monsterId: granted.monsterId,
            playerExp: granted.playerExp,
            coins: granted.coins,
            masteryExp: granted.masteryExp,
            coinsTotal: outcome.coinsTotal,
          } : undefined,
        });
      }).catch((error) => {
        pending.inFlight = false;
        const delay = Math.min(30_000, 250 * 2 ** Math.min(7, pending.attempts - 1));
        pending.retryAt = this.now() + delay;
        this.options.logger?.warn(
          { err: error, characterId: pending.characterId, spawnId: pending.spawnId, retryInMs: delay },
          'shared monster reward failed; queued for retry',
        );
      });
    }
  }

  private tick(): void {
    const now = this.now();
    const dtMs = now - this.lastTickAt;
    this.lastTickAt = now;
    const { dirtyByIsland, respawns, attacks } = this.sim.tick(now, dtMs, this.hub.worldPlayerViews());
    this.processPendingRewards();
    for (const [islandId, updates] of dirtyByIsland) {
      this.hub.broadcastWorldMonster(islandId, {
        type: 'world-monster-delta',
        seq: 0,
        islandId,
        updates,
      });
    }
    for (const monster of respawns) {
      this.hub.broadcastWorldMonster(monster.islandId, {
        type: 'world-monster-respawn',
        seq: 0,
        monster,
      });
    }
    // The attack action is a discrete authoritative event. Clients play the
    // matching animation and apply its hit frame once; they must not infer
    // damage from a persistent `state: attack` snapshot.
    for (const attack of attacks) {
      this.hub.broadcastWorldMonster(attack.islandId, {
        type: 'world-monster-attack',
        seq: 0,
        attack,
      });
    }
    this.persistAccumMs += dtMs;
    if (this.persistAccumMs >= this.persistIntervalMs) {
      this.persistAccumMs = 0;
      void this.persist();
    }
  }

  private async persist(): Promise<void> {
    if (!this.options.repository) return;
    const rows: WorldMonsterRow[] = this.sim.serialize().map((monster) => {
      const meta = this.spawnMeta.get(monster.spawnId);
      return {
        ...monster,
        islandId: meta?.islandId ?? 'starter-island',
        monsterId: meta?.monsterId ?? 'crab',
      };
    });
    try {
      await this.options.repository.saveAll(rows);
    } catch (error) {
      this.options.logger?.warn({ err: error }, 'world monster persist failed');
    }
  }
}
