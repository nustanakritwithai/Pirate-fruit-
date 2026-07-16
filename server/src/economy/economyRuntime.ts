import {
  REMOTE_ECONOMY_SCHEMA_VERSION,
  REMOTE_ECONOMY_TICK_INTERVAL_MS,
  REMOTE_ECONOMY_WORLD_ID,
} from '@pirate-fruit/shared';
import {
  loadBundledEconomyEngine,
  type EconomyEngine,
  type EconomyEngineFactory,
  type EconomyEngineSnapshot,
} from './economyEngine.js';
import type {
  EconomyLeaderLease,
  EconomyWorldRepository,
  StoredEconomyWorld,
} from './economyWorldRepository.js';

const DEFAULT_MAX_CATCH_UP_TICKS = 12;
const DEFAULT_SNAPSHOT_EVERY_TICKS = 12;
const DEFAULT_SNAPSHOT_RETENTION = 120;

export interface EconomyRuntimeLogger {
  info(fields: object, message: string): void;
  warn(fields: object, message: string): void;
  error(fields: object, message: string): void;
}

export interface EconomyRuntimeSnapshot {
  worldId: typeof REMOTE_ECONOMY_WORLD_ID;
  tick: number;
  document: Record<string, unknown>;
  lastTickAt: Date | null;
}

export interface EconomyRuntimeOptions {
  repository: EconomyWorldRepository;
  logger?: EconomyRuntimeLogger;
  engineFactory?: EconomyEngineFactory;
  now?: () => Date;
  tickIntervalMs?: number;
  maxCatchUpTicks?: number;
  snapshotEveryTicks?: number;
  snapshotRetention?: number;
  setInterval?: typeof globalThis.setInterval;
  clearInterval?: typeof globalThis.clearInterval;
}

const silentLogger: EconomyRuntimeLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

export class EconomyRuntime {
  private readonly logger: EconomyRuntimeLogger;
  private readonly engineFactory: EconomyEngineFactory;
  private readonly now: () => Date;
  private readonly tickIntervalMs: number;
  private readonly maxCatchUpTicks: number;
  private readonly snapshotEveryTicks: number;
  private readonly snapshotRetention: number;
  private readonly scheduleInterval: typeof globalThis.setInterval;
  private readonly cancelInterval: typeof globalThis.clearInterval;
  private lease: EconomyLeaderLease | null = null;
  private engine: EconomyEngine | null = null;
  private cached: EconomyRuntimeSnapshot | null = null;
  private interval: ReturnType<typeof globalThis.setInterval> | null = null;
  private pulseQueue: Promise<void> = Promise.resolve();
  private running = false;

  constructor(private readonly options: EconomyRuntimeOptions) {
    this.logger = options.logger ?? silentLogger;
    this.engineFactory = options.engineFactory ?? loadBundledEconomyEngine;
    this.now = options.now ?? (() => new Date());
    this.tickIntervalMs = options.tickIntervalMs ?? REMOTE_ECONOMY_TICK_INTERVAL_MS;
    this.maxCatchUpTicks = options.maxCatchUpTicks ?? DEFAULT_MAX_CATCH_UP_TICKS;
    this.snapshotEveryTicks = options.snapshotEveryTicks ?? DEFAULT_SNAPSHOT_EVERY_TICKS;
    this.snapshotRetention = options.snapshotRetention ?? DEFAULT_SNAPSHOT_RETENTION;
    this.scheduleInterval = options.setInterval ?? globalThis.setInterval;
    this.cancelInterval = options.clearInterval ?? globalThis.clearInterval;
  }

  get isLeader(): boolean {
    return this.lease !== null;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.runPulse();
      this.interval = this.scheduleInterval(() => {
        this.enqueuePulse();
      }, this.tickIntervalMs);
    } catch (error) {
      this.running = false;
      await this.releaseLease();
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.interval !== null) this.cancelInterval(this.interval);
    this.interval = null;
    await this.pulseQueue;
    await this.releaseLease();
  }

  async getSnapshot(): Promise<EconomyRuntimeSnapshot> {
    if (this.cached) return this.cached;
    const stored = await this.options.repository.load(REMOTE_ECONOMY_WORLD_ID);
    if (!stored) throw new Error('Economy world is not initialized');
    return this.fromStored(stored);
  }

  /** Deterministic hook for unit/integration tests; production uses the 5-second timer. */
  async pulseNow(): Promise<void> {
    await this.enqueuePulse(true);
  }

  private enqueuePulse(wait = false): Promise<void> {
    this.pulseQueue = this.pulseQueue
      .then(() => this.runPulse())
      .catch(async (error: unknown) => {
        this.logger.error({ err: error }, 'economy pulse failed; leadership will be retried');
        this.engine = null;
        this.cached = null;
        await this.releaseLease();
      });
    return wait ? this.pulseQueue : Promise.resolve();
  }

  private async runPulse(): Promise<void> {
    if (!this.running) return;
    if (!this.lease) {
      this.lease = await this.options.repository.tryAcquireLeadership();
      if (!this.lease) {
        this.cached = null;
        return;
      }
      await this.initializeLeader(this.lease);
      return;
    }
    if (!this.engine) throw new Error('Economy leader has no simulation engine');
    this.engine.advance();
    await this.persist(this.engine.snapshot(), this.now());
  }

  private async initializeLeader(lease: EconomyLeaderLease): Promise<void> {
    const stored = await lease.load(REMOTE_ECONOMY_WORLD_ID);
    this.engine = await this.engineFactory(stored?.document);
    const now = this.now();
    const missedTicks = stored?.lastTickAt
      ? Math.min(
          this.maxCatchUpTicks,
          Math.max(0, Math.floor((now.getTime() - stored.lastTickAt.getTime()) / this.tickIntervalMs)),
        )
      : 0;
    for (let index = 0; index < missedTicks; index++) this.engine.advance();
    await this.persist(this.engine.snapshot(), now);
    this.logger.info(
      { worldId: REMOTE_ECONOMY_WORLD_ID, tick: this.engine.tick, missedTicks },
      'economy leadership acquired',
    );
  }

  private async persist(snapshot: EconomyEngineSnapshot, tickedAt: Date): Promise<void> {
    if (!this.lease) throw new Error('Cannot persist economy without leadership');
    await this.lease.save({
      worldId: REMOTE_ECONOMY_WORLD_ID,
      schemaVersion: REMOTE_ECONOMY_SCHEMA_VERSION,
      tick: snapshot.tick,
      document: snapshot.document,
      tickedAt,
      createSnapshot: snapshot.tick % this.snapshotEveryTicks === 0,
      snapshotRetention: this.snapshotRetention,
    });
    this.cached = {
      worldId: REMOTE_ECONOMY_WORLD_ID,
      tick: snapshot.tick,
      document: snapshot.document,
      lastTickAt: tickedAt,
    };
  }

  private fromStored(stored: StoredEconomyWorld): EconomyRuntimeSnapshot {
    return {
      worldId: REMOTE_ECONOMY_WORLD_ID,
      tick: stored.tick,
      document: stored.document,
      lastTickAt: stored.lastTickAt,
    };
  }

  private async releaseLease(): Promise<void> {
    const lease = this.lease;
    this.lease = null;
    if (lease) await lease.release();
  }
}
