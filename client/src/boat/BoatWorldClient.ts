import * as THREE from 'three';
import type { BoatWorldSnapshot } from '@pirate-fruit/shared';
import type { GraphicsProfile } from '../engine/GraphicsQuality';
import { getWaveHeight, WATER_LEVEL } from '../ocean/Ocean';
import type { WorldTextures } from '../world/textures';
import type { Effects } from '../effects/Effects';
import { Boat } from './Boat';
import { getBoatDefinition } from './BoatData';
import type { BoatManager } from './BoatManager';

interface RenderedBoat {
  boat: Boat;
  target: BoatWorldSnapshot;
}

interface CannonShot {
  origin: THREE.Vector3;
  endpoint: THREE.Vector3;
}

export function authoritativeCannonShots(
  boat: Boat,
  side: 'port' | 'starboard',
  distance = 18,
): CannonShot[] {
  const sign = side === 'port' ? 1 : -1;
  const leftX = Math.cos(boat.heading);
  const leftZ = -Math.sin(boat.heading);
  const count = Math.max(1, boat.definition.cannonsPerSide ?? 1);
  const shots: CannonShot[] = [];
  for (let index = 0; index < count; index += 1) {
    const zSpread = count > 1 ? (index - (count - 1) / 2) * 1.5 : 0.4;
    const origin = new THREE.Vector3(
      sign * boat.definition.width * 0.5,
      0.9,
      zSpread,
    );
    boat.group.localToWorld(origin);
    shots.push({
      origin,
      endpoint: new THREE.Vector3(
        origin.x + sign * leftX * distance,
        origin.y - 0.15,
        origin.z + sign * leftZ * distance,
      ),
    });
  }
  return shots;
}

/** Rendering/interpolation only. All state applied here originated from the Server. */
export class BoatWorldClient {
  private readonly rendered = new Map<string, RenderedBoat>();
  private elapsed = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly getSelfCharacterId: () => string | null,
    private readonly localBoats: BoatManager,
    private readonly textures: WorldTextures,
    private readonly graphics: GraphicsProfile,
    private readonly effects: Effects,
  ) {}

  applySnapshot(islandId: string, boats: BoatWorldSnapshot[]): void {
    const seen = new Set(boats.map((boat) => boat.entityId));
    for (const [entityId, rendered] of this.rendered) {
      if (rendered.target.islandId === islandId && !seen.has(entityId)) this.remove(entityId);
    }
    for (const boat of boats) this.applyDelta(boat);
  }

  applyDelta(snapshot: BoatWorldSnapshot): void {
    const selfCharacterId = this.getSelfCharacterId();
    if (snapshot.ownerId === selfCharacterId) {
      // A snapshot can arrive before remote-session hydration. If the same
      // entity was provisionally rendered as remote, remove that visual before
      // handing it to BoatManager or two hulls will occupy the same transform.
      this.remove(snapshot.entityId);
      const rider = snapshot.helmId === selfCharacterId
        ? 'helm'
        : snapshot.passengerIds.includes(selfCharacterId ?? '') ? 'deck' : 'off';
      this.localBoats.applyAuthoritativeBoat(snapshot, rider);
      return;
    }
    const existing = this.rendered.get(snapshot.entityId);
    if (existing) {
      existing.target = { ...snapshot, passengerIds: [...snapshot.passengerIds] };
      existing.boat.hp = snapshot.hp;
      existing.boat.group.visible = snapshot.state !== 'sunk' && snapshot.state !== 'respawning';
      return;
    }
    const definition = getBoatDefinition(snapshot.definitionId);
    if (!definition) return;
    const boat = new Boat(definition, this.textures, this.graphics);
    boat.group.position.set(snapshot.x, WATER_LEVEL + 0.2, snapshot.z);
    boat.heading = snapshot.heading;
    boat.hp = snapshot.hp;
    boat.group.visible = snapshot.state !== 'sunk' && snapshot.state !== 'respawning';
    this.scene.add(boat.group);
    this.rendered.set(snapshot.entityId, { boat, target: { ...snapshot, passengerIds: [...snapshot.passengerIds] } });
  }

  /** Read-only presentation hook for spatial audio/effects. */
  positionOf(entityId: string): { x: number; y: number; z: number } | undefined {
    const position = this.rendered.get(entityId)?.boat.group.position;
    return position ? { x: position.x, y: position.y, z: position.z } : undefined;
  }

  markSunk(entityId: string): void {
    const rendered = this.rendered.get(entityId);
    if (!rendered) return;
    rendered.boat.group.visible = false;
    this.effects.spawnBoatImpact(rendered.boat.group.position, true);
  }

  applyRespawn(snapshot: BoatWorldSnapshot): void {
    this.applyDelta(snapshot);
  }

  applyCannon(event: {
    attackerId: string;
    targetId?: string;
    side: 'port' | 'starboard';
    damage: number;
    x: number;
    z: number;
  }): void {
    const localBoat = this.localBoats.activeAuthorityEntityId === event.attackerId
      ? this.localBoats.activeBoat
      : null;
    const attacker = localBoat ?? this.rendered.get(event.attackerId)?.boat;
    if (attacker) {
      for (const shot of authoritativeCannonShots(attacker, event.side)) {
        this.effects.spawnGunShot(shot.origin, shot.endpoint, 0xffb45b, false);
      }
    }
    if (event.damage <= 0 || !event.targetId) return;
    const localTarget = this.localBoats.activeAuthorityEntityId === event.targetId
      ? this.localBoats.activeBoat
      : null;
    const target = localTarget ?? this.rendered.get(event.targetId)?.boat;
    const point = target?.group.position ?? new THREE.Vector3(event.x, WATER_LEVEL, event.z);
    this.effects.spawnBoatImpact(point, true);
  }

  update(dt: number): void {
    this.elapsed += dt;
    for (const { boat, target } of this.rendered.values()) {
      boat.group.position.x = THREE.MathUtils.damp(boat.group.position.x, target.x, 12, dt);
      boat.group.position.z = THREE.MathUtils.damp(boat.group.position.z, target.z, 12, dt);
      let angle = target.heading - boat.heading;
      angle = Math.atan2(Math.sin(angle), Math.cos(angle));
      boat.heading += angle * Math.min(1, dt * 12);
      boat.speed = target.speed;
      boat.hp = target.hp;
      boat.group.position.y = THREE.MathUtils.damp(
        boat.group.position.y,
        WATER_LEVEL + getWaveHeight(boat.group.position.x, boat.group.position.z, this.elapsed) + 0.2,
        8,
        dt,
      );
      boat.group.rotation.y = boat.heading;
    }
  }

  private remove(entityId: string): void {
    const rendered = this.rendered.get(entityId);
    if (!rendered) return;
    this.scene.remove(rendered.boat.group);
    rendered.boat.dispose();
    this.rendered.delete(entityId);
  }
}
