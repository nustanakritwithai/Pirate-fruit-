import { describe, expect, it, vi } from 'vitest';
import type { EconomyEngine, EconomyEngineFactory } from './economyEngine.js';
import { EconomyRuntime } from './economyRuntime.js';
import type {
  EconomyLeaderLease,
  EconomyWorldRepository,
  EconomyWorldWrite,
  StoredEconomyWorld,
} from './economyWorldRepository.js';

function documentAt(tick: number): Record<string, unknown> {
  return { version: 8, world: { tick, cells: [] } };
}

const engineFactory: EconomyEngineFactory = async (initial): Promise<EconomyEngine> => {
  const parsed = initial as { world?: { tick?: number } } | undefined;
  let tick = parsed?.world?.tick ?? 0;
  return {
    get tick() { return tick; },
    advance() { tick += 1; },
    snapshot: () => ({ tick, documentVersion: 8, document: documentAt(tick) }),
  };
};

class MemoryEconomyRepository implements EconomyWorldRepository {
  stored: StoredEconomyWorld | null;
  leaderHeld = false;
  saves: EconomyWorldWrite[] = [];
  releases = 0;

  constructor(stored: StoredEconomyWorld | null = null) {
    this.stored = stored;
  }

  async load(): Promise<StoredEconomyWorld | null> {
    return this.stored;
  }

  async tryAcquireLeadership(): Promise<EconomyLeaderLease | null> {
    if (this.leaderHeld) return null;
    this.leaderHeld = true;
    return {
      load: async () => this.stored,
      save: async (write) => {
        this.saves.push(write);
        this.stored = {
          worldId: write.worldId,
          schemaVersion: write.schemaVersion,
          tick: write.tick,
          document: write.document,
          lastTickAt: write.tickedAt,
          updatedAt: write.tickedAt,
        };
      },
      release: async () => {
        this.leaderHeld = false;
        this.releases += 1;
      },
    };
  }
}

describe('S7 economy runtime', () => {
  it('elects one writer and advances on an exact five-second schedule', async () => {
    const repository = new MemoryEconomyRepository();
    let scheduledMs = 0;
    const runtime = new EconomyRuntime({
      repository,
      engineFactory,
      now: () => new Date('2026-01-01T00:00:00.000Z'),
      setInterval: ((callback: () => void, milliseconds: number) => {
        scheduledMs = milliseconds;
        return { callback } as unknown as ReturnType<typeof setInterval>;
      }) as typeof setInterval,
      clearInterval: vi.fn() as unknown as typeof clearInterval,
    });

    await runtime.start();
    expect(runtime.isLeader).toBe(true);
    expect(scheduledMs).toBe(5_000);
    expect(repository.saves.map((write) => write.tick)).toEqual([0]);

    await runtime.pulseNow();
    await runtime.pulseNow();
    expect(repository.saves.map((write) => write.tick)).toEqual([0, 1, 2]);
    expect(repository.saves.map((write) => write.createSnapshot)).toEqual([true, false, false]);
    for (let index = 0; index < 10; index++) await runtime.pulseNow();
    expect(repository.saves.at(-1)).toMatchObject({ tick: 12, createSnapshot: true });
    await runtime.stop();
    expect(repository.releases).toBe(1);
  });

  it('caps missed-time crash recovery and persists the recovered snapshot atomically', async () => {
    const now = new Date('2026-01-01T00:10:00.000Z');
    const repository = new MemoryEconomyRepository({
      worldId: 'main',
      schemaVersion: 1,
      tick: 7,
      document: documentAt(7),
      lastTickAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    const runtime = new EconomyRuntime({
      repository,
      engineFactory,
      now: () => now,
      maxCatchUpTicks: 12,
      setInterval: (() => 1) as unknown as typeof setInterval,
      clearInterval: (() => undefined) as typeof clearInterval,
    });

    await runtime.start();
    expect(repository.saves).toHaveLength(1);
    expect(repository.saves[0]?.tick).toBe(19);
    expect(repository.saves[0]?.tickedAt).toEqual(now);
    await runtime.stop();
  });

  it('serves the same canonical stock/tick snapshot from leader and follower instances', async () => {
    const repository = new MemoryEconomyRepository();
    const timer = (() => 1) as unknown as typeof setInterval;
    const clear = (() => undefined) as typeof clearInterval;
    const leader = new EconomyRuntime({ repository, engineFactory, setInterval: timer, clearInterval: clear });
    const follower = new EconomyRuntime({ repository, engineFactory, setInterval: timer, clearInterval: clear });

    await leader.start();
    await leader.pulseNow();
    await follower.start();

    const [leaderSnapshot, followerSnapshot] = await Promise.all([
      leader.getSnapshot(),
      follower.getSnapshot(),
    ]);
    expect(follower.isLeader).toBe(false);
    expect(followerSnapshot.tick).toBe(leaderSnapshot.tick);
    expect(followerSnapshot.document).toEqual(leaderSnapshot.document);
    await follower.stop();
    await leader.stop();
  });
});
