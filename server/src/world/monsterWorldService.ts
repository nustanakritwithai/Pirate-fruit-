import {
  SHARED_WORLD_SPAWNS,
  WORLD_MONSTER_TICK_MS,
  type RealtimeServerMessage,
} from '@pirate-fruit/shared';
import { MonsterSimulation } from './monsterSimulation.js';
import type { AttackKind } from '../realtime/combatAuthority.js';
import type { RealtimeHub, WorldMonsterBridge } from '../realtime/realtimeHub.js';
import type { PostgresWorldMonsterRepository, WorldMonsterRow } from './worldMonsterRepository.js';

interface ServiceLogger {
  warn(fields: object, message: string): void;
}

export interface MonsterWorldServiceOptions {
  now?: () => number;
  repository?: PostgresWorldMonsterRepository;
  logger?: ServiceLogger;
  /** persist ทุกกี่ ms (นอกจากตอน shutdown) */
  persistIntervalMs?: number;
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
      this.hub.broadcastWorldMonster(result.islandId, {
        type: 'world-monster-dead',
        seq: 0,
        spawnId,
        byId: characterId,
      });
    }
  }

  private tick(): void {
    const now = this.now();
    const dtMs = now - this.lastTickAt;
    this.lastTickAt = now;
    const { dirtyByIsland, respawns } = this.sim.tick(now, dtMs, this.hub.worldPlayerViews());
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
