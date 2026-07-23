import {
  AUTHORITATIVE_BOAT_DEFINITIONS,
  BOAT_BOARD_RANGE,
  BOAT_CANNON_COOLDOWN_MS,
  BOAT_CANNON_RANGE,
  BOAT_DOCK_SPAWNS,
  BOAT_INPUT_MIN_INTERVAL_MS,
  BOAT_RESPAWN_MS,
  BOAT_WORLD_BOUNDARY,
  type BoatWorldSnapshot,
} from '@pirate-fruit/shared';

export interface CanonicalBoat {
  entityId: string;
  ownerId: string;
  definitionId: string;
  hp: number;
  maxHp: number;
  cargoCapacity: number;
}

export interface BoatWorldRow extends BoatWorldSnapshot {}

interface BoatRuntime extends BoatWorldSnapshot {
  throttle: number;
  steer: number;
  boostTimer: number;
  boostCooldown: number;
  lastInputAt: number;
  lastCannonAt: number;
}

export interface BoatTickResult {
  dirtyByIsland: Map<string, BoatWorldSnapshot[]>;
  respawns: BoatWorldSnapshot[];
  collisionDamage: Array<{ boat: BoatWorldSnapshot; damage: number }>;
  islandTransitions: Array<{ fromIslandId: string; toIslandId: string; boat: BoatWorldSnapshot }>;
}

export interface CannonResolution {
  attacker: BoatWorldSnapshot;
  target?: BoatWorldSnapshot;
  side: 'port' | 'starboard';
  damage: number;
  sunk: boolean;
}

const snapshotOf = (boat: BoatRuntime): BoatWorldSnapshot => ({
  entityId: boat.entityId,
  ownerId: boat.ownerId,
  definitionId: boat.definitionId,
  islandId: boat.islandId,
  x: boat.x,
  z: boat.z,
  heading: boat.heading,
  speed: boat.speed,
  hp: boat.hp,
  maxHp: boat.maxHp,
  anchor: boat.anchor,
  state: boat.state,
  helmId: boat.helmId,
  passengerIds: [...boat.passengerIds],
  respawnAt: boat.respawnAt,
});

/** Pure deterministic S17 simulation. No client position, damage, or HP is accepted. */
export class BoatSimulation {
  private readonly boats = new Map<string, BoatRuntime>();

  restore(rows: readonly BoatWorldRow[]): void {
    for (const row of rows) {
      if (!AUTHORITATIVE_BOAT_DEFINITIONS[row.definitionId]) continue;
      this.boats.set(row.entityId, {
        ...row,
        passengerIds: [...row.passengerIds],
        throttle: 0,
        steer: 0,
        boostTimer: 0,
        boostCooldown: 0,
        lastInputAt: 0,
        lastCannonAt: 0,
      });
    }
  }

  serialize(): BoatWorldRow[] {
    return [...this.boats.values()].map(snapshotOf);
  }

  snapshotForIsland(islandId: string): BoatWorldSnapshot[] {
    return [...this.boats.values()]
      .filter((boat) => boat.islandId === islandId)
      .map(snapshotOf);
  }

  stateOf(entityId: string): BoatWorldSnapshot | null {
    const boat = this.boats.get(entityId);
    return boat ? snapshotOf(boat) : null;
  }

  boatOfPassenger(characterId: string): BoatWorldSnapshot | null {
    for (const boat of this.boats.values()) {
      if (boat.passengerIds.includes(characterId)) return snapshotOf(boat);
    }
    return null;
  }

  summon(canonical: CanonicalBoat, islandId: string, now = Date.now()): BoatWorldSnapshot | null {
    const definition = AUTHORITATIVE_BOAT_DEFINITIONS[canonical.definitionId];
    const dock = BOAT_DOCK_SPAWNS[islandId];
    if (!definition || !dock) return null;
    const previous = this.boats.get(canonical.entityId);
    if (previous && (previous.state === 'sunk' || previous.state === 'respawning')
      && previous.respawnAt !== undefined && now < previous.respawnAt) return null;
    const boat: BoatRuntime = {
      entityId: canonical.entityId,
      ownerId: canonical.ownerId,
      definitionId: canonical.definitionId,
      islandId,
      x: dock.x,
      z: dock.z,
      heading: dock.heading,
      speed: 0,
      hp: previous && previous.hp > 0
        ? Math.min(canonical.maxHp, previous.hp)
        : canonical.maxHp,
      maxHp: canonical.maxHp,
      anchor: true,
      state: 'docked',
      helmId: undefined,
      passengerIds: [],
      throttle: 0,
      steer: 0,
      boostTimer: 0,
      boostCooldown: 0,
      lastInputAt: 0,
      lastCannonAt: 0,
    };
    this.removePassenger(canonical.ownerId);
    this.boats.set(boat.entityId, boat);
    return snapshotOf(boat);
  }

  board(entityId: string, characterId: string, islandId: string, x: number, z: number): BoatWorldSnapshot | null {
    const boat = this.boats.get(entityId);
    if (!boat || boat.islandId !== islandId || boat.state === 'sunk' || boat.state === 'respawning') return null;
    if (Math.hypot(boat.x - x, boat.z - z) > BOAT_BOARD_RANGE) return null;
    this.removePassenger(characterId);
    if (!boat.passengerIds.includes(characterId)) boat.passengerIds.push(characterId);
    return snapshotOf(boat);
  }

  takeHelm(entityId: string, characterId: string): BoatWorldSnapshot | null {
    const boat = this.boats.get(entityId);
    if (!boat || !boat.passengerIds.includes(characterId) || boat.helmId && boat.helmId !== characterId) return null;
    if (boat.state === 'sunk' || boat.state === 'respawning') return null;
    boat.helmId = characterId;
    boat.anchor = false;
    return snapshotOf(boat);
  }

  leaveHelm(characterId: string): BoatWorldSnapshot | null {
    for (const boat of this.boats.values()) {
      if (boat.helmId !== characterId) continue;
      boat.helmId = undefined;
      boat.throttle = 0;
      boat.steer = 0;
      return snapshotOf(boat);
    }
    return null;
  }

  disembark(characterId: string): BoatWorldSnapshot | null {
    for (const boat of this.boats.values()) {
      const index = boat.passengerIds.indexOf(characterId);
      if (index < 0) continue;
      boat.passengerIds.splice(index, 1);
      if (boat.helmId === characterId) {
        boat.helmId = undefined;
        boat.throttle = 0;
        boat.steer = 0;
      }
      return snapshotOf(boat);
    }
    return null;
  }

  removePassenger(characterId: string): void {
    this.disembark(characterId);
  }

  disconnect(characterId: string): BoatWorldSnapshot | null {
    for (const boat of this.boats.values()) {
      if (!boat.passengerIds.includes(characterId)) continue;
      boat.anchor = true;
      boat.throttle = 0;
      boat.steer = 0;
      return this.disembark(characterId);
    }
    return null;
  }

  setInput(
    now: number,
    characterId: string,
    entityId: string,
    throttle: number,
    steer: number,
    anchor?: boolean,
    boost?: boolean,
  ): BoatWorldSnapshot | null {
    const boat = this.boats.get(entityId);
    if (!boat || boat.helmId !== characterId || boat.state === 'sunk' || boat.state === 'respawning') return null;
    if (now - boat.lastInputAt < BOAT_INPUT_MIN_INTERVAL_MS) return snapshotOf(boat);
    boat.lastInputAt = now;
    boat.throttle = Math.max(-1, Math.min(1, Number.isFinite(throttle) ? throttle : 0));
    boat.steer = Math.max(-1, Math.min(1, Number.isFinite(steer) ? steer : 0));
    if (typeof anchor === 'boolean') boat.anchor = anchor;
    if (boost === true && !boat.anchor && boat.boostCooldown <= 0) {
      boat.boostTimer = 1_200;
      boat.boostCooldown = 4_000;
    }
    return snapshotOf(boat);
  }

  fire(now: number, characterId: string, entityId: string, side: 'port' | 'starboard'): CannonResolution | null {
    const attacker = this.boats.get(entityId);
    if (!attacker || attacker.helmId !== characterId || attacker.state === 'sunk' || attacker.state === 'respawning') return null;
    if (now - attacker.lastCannonAt < BOAT_CANNON_COOLDOWN_MS) return null;
    attacker.lastCannonAt = now;
    const definition = AUTHORITATIVE_BOAT_DEFINITIONS[attacker.definitionId]!;
    const leftX = Math.cos(attacker.heading);
    const leftZ = -Math.sin(attacker.heading);
    const sign = side === 'port' ? 1 : -1;
    let target: BoatRuntime | undefined;
    let best = BOAT_CANNON_RANGE;
    for (const candidate of this.boats.values()) {
      if (candidate === attacker || candidate.islandId !== attacker.islandId || candidate.state === 'sunk' || candidate.state === 'respawning') continue;
      const dx = candidate.x - attacker.x;
      const dz = candidate.z - attacker.z;
      const distance = Math.hypot(dx, dz);
      if (distance >= best || (dx * leftX + dz * leftZ) * sign <= 0) continue;
      best = distance;
      target = candidate;
    }
    if (!target) return { attacker: snapshotOf(attacker), side, damage: 0, sunk: false };
    const damage = definition.cannonDamage;
    target.hp = Math.max(0, target.hp - damage);
    const sunk = target.hp === 0;
    if (sunk) {
      this.sink(target, now);
    }
    return { attacker: snapshotOf(attacker), target: snapshotOf(target), side, damage, sunk };
  }

  tick(now: number, dtMs: number): BoatTickResult {
    const dirtyByIsland = new Map<string, BoatWorldSnapshot[]>();
    const respawns: BoatWorldSnapshot[] = [];
    const collisionDamage: Array<{ boat: BoatWorldSnapshot; damage: number }> = [];
    const islandTransitions: BoatTickResult['islandTransitions'] = [];
    const previous = new Map<string, { x: number; z: number }>();
    const dt = Math.max(0, Math.min(dtMs, 250)) / 1_000;

    for (const boat of this.boats.values()) {
      previous.set(boat.entityId, { x: boat.x, z: boat.z });
      if (boat.state === 'sunk' || boat.state === 'respawning') {
        if (boat.respawnAt !== undefined && now >= boat.respawnAt) {
          const dock = BOAT_DOCK_SPAWNS[boat.islandId] ?? BOAT_DOCK_SPAWNS['starter-island']!;
          boat.x = dock.x; boat.z = dock.z; boat.heading = dock.heading;
          boat.hp = boat.maxHp; boat.state = 'docked'; boat.anchor = true;
          boat.speed = 0; boat.respawnAt = undefined;
          respawns.push(snapshotOf(boat));
        }
        continue;
      }
      const definition = AUTHORITATIVE_BOAT_DEFINITIONS[boat.definitionId]!;
      boat.boostTimer = Math.max(0, boat.boostTimer - dtMs);
      boat.boostCooldown = Math.max(0, boat.boostCooldown - dtMs);
      const boostScale = boat.boostTimer > 0 ? 1.35 : 1;
      const target = boat.anchor
        ? 0
        : boat.throttle >= 0
          ? boat.throttle * definition.maxSpeed * boostScale
          : boat.throttle * definition.reverseSpeed;
      const rate = boat.speed < target
        ? definition.acceleration * (boat.boostTimer > 0 ? 1.7 : 1)
        : definition.drag * 8;
      const step = Math.max(-rate * dt, Math.min(rate * dt, target - boat.speed));
      boat.speed += step;
      const turnFactor = Math.max(0.12, Math.min(1, Math.abs(boat.speed) / 3));
      boat.heading -= boat.steer * definition.turnSpeed * turnFactor * (boat.speed < 0 ? -1 : 1) * dt;
      boat.x += Math.sin(boat.heading) * boat.speed * dt;
      boat.z += Math.cos(boat.heading) * boat.speed * dt;
      const nextIslandId = this.nearestIslandId(boat.x, boat.z);
      if (nextIslandId !== boat.islandId) {
        const fromIslandId = boat.islandId;
        boat.islandId = nextIslandId;
        islandTransitions.push({ fromIslandId, toIslandId: nextIslandId, boat: snapshotOf(boat) });
      }
      boat.state = Math.abs(boat.speed) > 0.15 ? 'sailing' : 'docked';
      if (Math.hypot(boat.x, boat.z) > BOAT_WORLD_BOUNDARY) {
        const old = previous.get(boat.entityId)!;
        boat.x = old.x; boat.z = old.z; boat.speed *= -0.15;
        const damage = Math.min(24, Math.max(1, Math.round(Math.abs(boat.speed) * 3)));
        boat.hp = Math.max(0, boat.hp - damage);
        if (boat.hp === 0) this.sink(boat, now);
        collisionDamage.push({ boat: snapshotOf(boat), damage });
      }
    }

    const live = [...this.boats.values()].filter((boat) => boat.state !== 'sunk' && boat.state !== 'respawning');
    for (let i = 0; i < live.length; i += 1) {
      for (let j = i + 1; j < live.length; j += 1) {
        const a = live[i]!; const b = live[j]!;
        if (a.islandId !== b.islandId) continue;
        const ar = AUTHORITATIVE_BOAT_DEFINITIONS[a.definitionId]!.collisionRadius;
        const br = AUTHORITATIVE_BOAT_DEFINITIONS[b.definitionId]!.collisionRadius;
        if (Math.hypot(a.x - b.x, a.z - b.z) >= ar + br) continue;
        const ap = previous.get(a.entityId)!; const bp = previous.get(b.entityId)!;
        a.x = ap.x; a.z = ap.z; b.x = bp.x; b.z = bp.z;
        a.speed *= -0.1; b.speed *= -0.1;
      }
    }

    for (const boat of this.boats.values()) {
      const list = dirtyByIsland.get(boat.islandId) ?? [];
      list.push(snapshotOf(boat));
      dirtyByIsland.set(boat.islandId, list);
    }
    return { dirtyByIsland, respawns, collisionDamage, islandTransitions };
  }

  private nearestIslandId(x: number, z: number): string {
    let bestId = 'starter-island';
    let bestDistance = Number.POSITIVE_INFINITY;
    // Boat interest follows the nearest harbor rather than island terrain centres.
    // Several docks sit far offshore (the starter dock is already closer to the
    // mist terrain centre), which previously moved a freshly summoned boat to the
    // wrong island on its first 100 ms tick and made boarding impossible.
    for (const [islandId, harbor] of Object.entries(BOAT_DOCK_SPAWNS)) {
      const distance = (harbor.x - x) ** 2 + (harbor.z - z) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        bestId = islandId;
      }
    }
    return bestId;
  }

  private sink(boat: BoatRuntime, now: number): void {
    boat.state = 'sunk';
    boat.speed = 0;
    boat.anchor = true;
    boat.throttle = 0;
    boat.steer = 0;
    boat.respawnAt = now + BOAT_RESPAWN_MS;
    boat.helmId = undefined;
    boat.passengerIds = [];
  }
}
