import {
  BOAT_DOCK_SPAWNS,
  BOAT_WORLD_TICK_MS,
  type RealtimeBoatIntent,
  type RealtimeServerMessage,
} from '@pirate-fruit/shared';
import type {
  BoatIntentResolution,
  BoatWorldBridge,
  PresencePosition,
  RealtimeHub,
} from '../realtime/realtimeHub.js';
import { BoatSimulation } from './boatSimulation.js';
import type { BoatWorldRepository } from './boatWorldRepository.js';

interface ServiceLogger {
  info(fields: object, message: string): void;
  warn(fields: object, message: string): void;
}

export interface BoatWorldServiceOptions {
  now?: () => number;
  repository?: BoatWorldRepository;
  logger?: ServiceLogger;
  persistIntervalMs?: number;
}

/** S17 server authority: authorization/idempotency around the deterministic boat simulation. */
export class BoatWorldService implements BoatWorldBridge {
  private readonly sim: BoatSimulation;
  private readonly now: () => number;
  private readonly persistIntervalMs: number;
  private readonly results = new Map<string, Map<string, BoatIntentResolution>>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastTickAt: number;
  private persistAccumMs = 0;

  constructor(
    private readonly hub: RealtimeHub,
    private readonly options: BoatWorldServiceOptions = {},
  ) {
    this.now = options.now ?? (() => Date.now());
    this.persistIntervalMs = options.persistIntervalMs ?? 10_000;
    this.sim = new BoatSimulation();
    this.lastTickAt = this.now();
  }

  async load(): Promise<void> {
    if (!this.options.repository) return;
    try {
      this.sim.restore(await this.options.repository.loadAll());
    } catch (error) {
      this.options.logger?.warn({ err: error }, 'boat world restore failed; starting empty');
    }
  }

  start(): void {
    this.hub.attachBoatWorld(this);
    this.lastTickAt = this.now();
    this.timer = setInterval(() => this.tick(), BOAT_WORLD_TICK_MS);
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.persist();
  }

  snapshotMessageForIsland(islandId: string): RealtimeServerMessage {
    return { type: 'boat-snapshot', seq: 0, islandId, boats: this.sim.snapshotForIsland(islandId) };
  }

  isPassenger(characterId: string): boolean {
    return this.sim.boatOfPassenger(characterId) !== null;
  }

  passengerBoat(characterId: string) {
    return this.sim.boatOfPassenger(characterId);
  }

  removePlayer(characterId: string): void {
    // Keep passenger membership for reconnect, but stop/anchor an abandoned helm.
    const changed = this.sim.disconnect(characterId);
    if (changed) this.broadcastDelta(changed);
  }

  async handleIntent(
    characterId: string,
    presence: PresencePosition | null,
    intent: RealtimeBoatIntent,
  ): Promise<BoatIntentResolution> {
    const prior = this.results.get(characterId)?.get(intent.intentId);
    if (prior) return prior;
    let result: BoatIntentResolution;
    if (intent.action === 'summon') result = await this.summon(characterId, presence);
    else if (intent.action === 'board') result = this.board(characterId, presence, intent.entityId);
    else if (intent.action === 'take-helm') result = this.takeHelm(characterId, intent.entityId);
    else if (intent.action === 'leave-helm') result = this.leaveHelm(characterId);
    else if (intent.action === 'disembark') result = this.disembark(characterId);
    else if (intent.action === 'input') result = this.input(characterId, intent);
    else result = this.fire(characterId, intent);
    this.remember(characterId, intent.intentId, result);
    this.options.logger?.info({ characterId, intentId: intent.intentId, action: intent.action, ...result }, 'boat intent resolved');
    return result;
  }

  private async summon(characterId: string, presence: PresencePosition | null): Promise<BoatIntentResolution> {
    if (!presence) return { accepted: false, reason: 'presence-required' };
    const dock = BOAT_DOCK_SPAWNS[presence.islandId];
    if (!dock || Math.hypot(presence.x - dock.x, presence.z - dock.z) > 90) {
      return { accepted: false, reason: 'dock-range' };
    }
    const canonical = await this.options.repository?.loadActiveBoat(characterId) ?? null;
    if (!canonical || canonical.ownerId !== characterId) return { accepted: false, reason: 'active-boat-required' };
    const boat = this.sim.summon(canonical, presence.islandId, this.now());
    if (!boat) return { accepted: false, reason: 'unsupported-boat' };
    this.broadcastDelta(boat);
    return { accepted: true, entityId: boat.entityId };
  }

  private board(characterId: string, presence: PresencePosition | null, entityId?: string): BoatIntentResolution {
    if (!presence || !entityId) return { accepted: false, reason: 'boat-and-presence-required' };
    const boat = this.sim.board(entityId, characterId, presence.islandId, presence.x, presence.z);
    if (!boat) return { accepted: false, reason: 'board-range-or-state' };
    this.broadcastDelta(boat);
    // Boarding can happen while an anchored boat produces no simulation tick.
    // Publish authoritative passenger presence immediately so peers swap the
    // on-foot avatar for the boat visual instead of leaving it on the water.
    this.hub.updateBoatPassengerPresence(
      characterId, boat.islandId, boat.x, boat.z, boat.heading, boat.definitionId,
    );
    return { accepted: true, entityId };
  }

  private disembark(characterId: string): BoatIntentResolution {
    const boat = this.sim.disembark(characterId);
    if (!boat) return { accepted: false, reason: 'not-aboard' };
    this.broadcastDelta(boat);
    const sideX = Math.cos(boat.heading) * 4;
    const sideZ = -Math.sin(boat.heading) * 4;
    this.hub.updateDisembarkedPresence(characterId, boat.islandId, boat.x + sideX, boat.z + sideZ, boat.heading);
    return { accepted: true, entityId: boat.entityId };
  }

  private takeHelm(characterId: string, entityId?: string): BoatIntentResolution {
    if (!entityId) return { accepted: false, reason: 'boat-required' };
    const boat = this.sim.takeHelm(entityId, characterId);
    if (!boat) return { accepted: false, reason: 'not-passenger-or-helm-busy' };
    this.broadcastDelta(boat);
    return { accepted: true, entityId: boat.entityId };
  }

  private leaveHelm(characterId: string): BoatIntentResolution {
    const boat = this.sim.leaveHelm(characterId);
    if (!boat) return { accepted: false, reason: 'not-helm' };
    this.broadcastDelta(boat);
    return { accepted: true, entityId: boat.entityId };
  }

  private input(characterId: string, intent: RealtimeBoatIntent): BoatIntentResolution {
    if (!intent.entityId) return { accepted: false, reason: 'boat-required' };
    const boat = this.sim.setInput(
      this.now(), characterId, intent.entityId, intent.throttle ?? 0, intent.steer ?? 0,
      intent.anchor, intent.boost,
    );
    return boat ? { accepted: true, entityId: boat.entityId } : { accepted: false, reason: 'not-helm' };
  }

  private fire(characterId: string, intent: RealtimeBoatIntent): BoatIntentResolution {
    if (!intent.entityId || !intent.fireSide) return { accepted: false, reason: 'boat-and-side-required' };
    const resolution = this.sim.fire(this.now(), characterId, intent.entityId, intent.fireSide);
    if (!resolution) return { accepted: false, reason: 'cooldown-or-not-helm' };
    this.hub.broadcastBoat(resolution.attacker.islandId, {
      type: 'boat-cannon', seq: 0,
      attackerId: resolution.attacker.entityId,
      targetId: resolution.target?.entityId,
      side: resolution.side,
      damage: resolution.damage,
      targetHp: resolution.target?.hp,
      x: resolution.attacker.x,
      z: resolution.attacker.z,
    });
    if (resolution.target) this.broadcastDelta(resolution.target);
    if (resolution.sunk && resolution.target?.respawnAt !== undefined) {
      this.hub.broadcastBoat(resolution.target.islandId, {
        type: 'boat-sunk', seq: 0, entityId: resolution.target.entityId,
        byEntityId: resolution.attacker.entityId, respawnAt: resolution.target.respawnAt,
      });
      void this.persist();
    }
    return { accepted: true, entityId: resolution.attacker.entityId };
  }

  private tick(): void {
    const now = this.now();
    const dtMs = now - this.lastTickAt;
    this.lastTickAt = now;
    const result = this.sim.tick(now, dtMs);
    for (const transition of result.islandTransitions) {
      this.hub.broadcastBoat(transition.fromIslandId, this.snapshotMessageForIsland(transition.fromIslandId));
    }
    for (const boats of result.dirtyByIsland.values()) {
      for (const boat of boats) {
        this.broadcastDelta(boat);
        for (const passengerId of boat.passengerIds) {
          this.hub.updateBoatPassengerPresence(passengerId, boat.islandId, boat.x, boat.z, boat.heading, boat.definitionId);
        }
      }
    }
    for (const boat of result.respawns) {
      this.hub.broadcastBoat(boat.islandId, { type: 'boat-respawn', seq: 0, boat });
    }
    this.persistAccumMs += dtMs;
    if (this.persistAccumMs >= this.persistIntervalMs) {
      this.persistAccumMs = 0;
      void this.persist();
    }
  }

  private broadcastDelta(boat: ReturnType<BoatSimulation['stateOf']> & {}): void {
    if (!boat) return;
    this.hub.broadcastBoat(boat.islandId, { type: 'boat-delta', seq: 0, boat });
  }

  private remember(characterId: string, intentId: string, result: BoatIntentResolution): void {
    const cache = this.results.get(characterId) ?? new Map<string, BoatIntentResolution>();
    cache.set(intentId, result);
    while (cache.size > 128) cache.delete(cache.keys().next().value!);
    this.results.set(characterId, cache);
  }

  private async persist(): Promise<void> {
    if (!this.options.repository) return;
    try {
      await this.options.repository.saveAll(this.sim.serialize());
    } catch (error) {
      this.options.logger?.warn({ err: error }, 'boat world persist failed');
    }
  }
}
