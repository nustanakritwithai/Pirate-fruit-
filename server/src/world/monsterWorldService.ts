import {
  MONSTER_PROTOCOL_SCHEMA_VERSION,
  SHARED_WORLD_SPAWNS,
  WORLD_MONSTER_SNAPSHOT_INTERVAL_MS,
  WORLD_MONSTER_TICK_MS,
  WORLD_MONSTER_SKILL_RANGE,
  type RealtimeServerMessage,
} from '@pirate-fruit/shared';
import { MonsterSimulation, type PlayerView } from './monsterSimulation.js';
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

export interface MonsterWorldStateSnapshot {
  schemaVersion: 1;
  monsters: ReturnType<MonsterSimulation['serialize']>;
  pendingRewards: Omit<PendingDeathReward, 'inFlight'>[];
}

export interface ExternalMonsterHit {
  characterId: string;
  creditCharacterId?: string;
  islandId: string;
  x: number;
  z: number;
  spawnId: string;
  kind?: AttackKind;
  damage: number;
  expectedHp?: number;
  range?: number;
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
  private snapshotAccumMs = 0;
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
    damageMultiplier = 1,
  ): void {
    this.commitHit(this.sim.applyHit(
      this.now(),
      spawnId,
      characterId,
      x,
      z,
      kind,
      damageMultiplier,
    ), characterId);
  }

  islandForSpawn(spawnId: string): string | null {
    return this.spawnMeta.get(spawnId)?.islandId ?? null;
  }

  isPlayerInCombat(characterId: string): boolean { return this.sim.isPlayerInCombat(characterId); }

  exportWorldState(): MonsterWorldStateSnapshot {
    return {
      schemaVersion: 1,
      monsters: this.sim.serialize(),
      pendingRewards: [...this.pendingRewards.values()].map(({ inFlight: _inFlight, ...pending }) => pending),
    };
  }

  restoreWorldState(snapshot: MonsterWorldStateSnapshot): void {
    if (snapshot.schemaVersion !== 1 || !Array.isArray(snapshot.monsters) || !Array.isArray(snapshot.pendingRewards)) {
      throw new Error('invalid-world-state');
    }
    this.sim.restore(snapshot.monsters);
    this.pendingRewards.clear();
    for (const pending of snapshot.pendingRewards) {
      if (!pending.idempotencyKey || !pending.characterId || !pending.spawnId || !pending.monsterId) continue;
      this.pendingRewards.set(pending.idempotencyKey, { ...pending, inFlight: false, retryAt: Math.min(pending.retryAt, this.now()) });
    }
  }

  applyExternalHit(input: ExternalMonsterHit): ReturnType<MonsterSimulation['applyHit']> {
    const current = this.sim.snapshotForIsland(input.islandId).find((monster) => monster.spawnId === input.spawnId);
    if (!current || current.hp <= 0 || current.state === 'dead') return null;
    if (input.expectedHp !== undefined && current.hp !== input.expectedHp) return null;
    const allowedRange = input.range ?? WORLD_MONSTER_SKILL_RANGE;
    if (!Number.isFinite(allowedRange) || Math.hypot(current.x - input.x, current.z - input.z) > allowedRange) return null;
    if (input.damage === 0) return {
      spawnId: current.spawnId, monsterId: current.monsterId, islandId: current.islandId,
      hp: current.hp, maxHp: current.maxHp, damage: 0, dead: false, delta: {
        ...current, damage: 0,
      },
    };
    const result = this.sim.applyHit(
      this.now(), input.spawnId, input.characterId, input.x, input.z,
      input.kind ?? 'skill', 1, input.damage,
    );
    this.commitHit(result, input.creditCharacterId ?? input.characterId);
    return result;
  }

  private commitHit(result: ReturnType<MonsterSimulation['applyHit']>, rewardCharacterId?: string): void {
    if (!result) return;
    this.hub.broadcastWorldMonster(result.islandId, {
      type: 'world-monster-delta',
      seq: 0,
      islandId: result.islandId,
      updates: [result.delta],
    });
    if (result.dead) {
      const idempotencyKey = `world-kill:${result.spawnId}:${this.now()}`;
      if (!this.options.rewards) {
        this.hub.broadcastWorldMonster(result.islandId, {
          type: 'world-monster-dead',
          seq: 0,
          spawnId: result.spawnId,
          byId: rewardCharacterId ?? 'unknown',
        });
        return;
      }
      // Keep the death pending until the idempotent reward transaction commits.
      // A transient database outage can no longer turn a confirmed kill into a
      // permanently reward-less death while this process remains alive.
      this.pendingRewards.set(idempotencyKey, {
        characterId: rewardCharacterId ?? 'unknown',
        islandId: result.islandId,
        spawnId: result.spawnId,
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

  step(now = this.now(), additionalTargets: readonly PlayerView[] = []): void {
    const dtMs = Math.max(0, now - this.lastTickAt);
    this.lastTickAt = now;
    const players = [...this.hub.worldPlayerViews(), ...additionalTargets];
    const { dirtyByIsland, respawns, attacks } = this.sim.tick(now, dtMs, players);
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
    // A transition snapshot can race ahead of the Client's island detector, and
    // WebSocket reconnects can miss a one-shot seed. Periodic full snapshots for
    // occupied islands make the authoritative renderer self-healing without
    // broadcasting every island or changing combat authority.
    this.snapshotAccumMs += dtMs;
    if (this.snapshotAccumMs >= WORLD_MONSTER_SNAPSHOT_INTERVAL_MS) {
      this.snapshotAccumMs %= WORLD_MONSTER_SNAPSHOT_INTERVAL_MS;
      const occupiedIslands = new Set(players.map((player) => player.islandId));
      for (const islandId of occupiedIslands) {
        this.hub.broadcastWorldMonster(islandId, this.snapshotMessageForIsland(islandId));
      }
    }
    this.persistAccumMs += dtMs;
    if (this.persistAccumMs >= this.persistIntervalMs) {
      this.persistAccumMs = 0;
      void this.persist();
    }
  }

  private tick(): void { this.step(this.now()); }

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
