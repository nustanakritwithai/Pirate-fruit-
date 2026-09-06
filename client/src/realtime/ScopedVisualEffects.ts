import * as THREE from 'three';
import {
  Effects,
  type EnergyProjectileVisual,
} from '../effects/Effects';
import type { SpellFxAssetId } from '../art/SpellFxAssetLibrary';
import type {
  RealtimePlayerVisual,
  RealtimeProjectileState,
  RealtimeVisualEvent,
  RealtimeVisualVec3,
} from '@pirate-fruit/shared';

function vec3(value: THREE.Vector3): RealtimeVisualVec3 {
  return { x: value.x, y: value.y, z: value.z };
}

function direction(value: THREE.Vector3): RealtimeVisualVec3 {
  const copy = value.clone().normalize();
  return vec3(copy);
}
function normalizeHeading(value: number): number {
  return Math.atan2(Math.sin(value), Math.cos(value));
}

function id(): string {
  const candidate = globalThis.crypto?.randomUUID?.().replace(/-/g, '');
  return (candidate && /^[A-Za-z0-9_-]{8,64}$/.test(candidate))
    ? candidate
    : `visual${Math.random().toString(36).slice(2, 18)}`;
}

/** Captures only PlayerCombat-owned Effects calls while delegating rendering to the canonical Effects renderer. */
export class ScopedVisualEffects {
  private sequence = 0;
  private stateSequence = 0;
  private sessionId = id();
  private readonly events: Array<RealtimeVisualEvent & { createdAt: number }> = [];
  private readonly projectiles = new Map<string, RealtimeProjectileState>();
  private readonly previousPositions = new Map<string, THREE.Vector3>();
  private shield: { active: boolean; opacity: number } = { active: false, opacity: 0 };

  constructor(private readonly effects: Effects) {}

  resetSession(): void {
    this.sessionId = id();
    this.sequence = 0;
    this.stateSequence = 0;
    this.events.length = 0;
    this.projectiles.clear();
    this.previousPositions.clear();
    this.shield = { active: false, opacity: 0 };
  }

  private event(kind: RealtimeVisualEvent['kind'], payload: Partial<RealtimeVisualEvent>): void {
    this.events.push({ sequence: ++this.sequence, kind, ageMs: 0, createdAt: Date.now(), ...payload });
  }

  spawnSlash(position: THREE.Vector3, heading: number, color = 0x9fdcff, scale = 1, assetId?: SpellFxAssetId): void {
    this.effects.spawnSlash(position, heading, color, scale, assetId);
    this.event('slash', { position: vec3(position), heading: normalizeHeading(heading), color, scale, ...(assetId ? { assetId } : {}) });
  }

  spawnBladeTrail(bladeBase: THREE.Vector3, bladeTip: THREE.Vector3, playerPosition: THREE.Vector3, heading: number, comboIndex: number, color = 0x9fdcff, finisher = false): void {
    this.effects.spawnBladeTrail(bladeBase, bladeTip, playerPosition, heading, comboIndex, color, finisher);
    this.event('blade-trail', { bladeBase: vec3(bladeBase), bladeTip: vec3(bladeTip), position: vec3(playerPosition), heading: normalizeHeading(heading), comboIndex, color, finisher });
  }

  spawnGunShot(origin: THREE.Vector3, endpoint: THREE.Vector3, color = 0xffd477, impacted = false, power = 1): void {
    this.effects.spawnGunShot(origin, endpoint, color, impacted, power);
    this.event('gun-shot', { position: vec3(origin), endpoint: vec3(endpoint), color, impacted, power });
  }

  createEnergyProjectile(position: THREE.Vector3, projectileDirection: THREE.Vector3, color = 0x74e8ff, scale = 1, lifetimeMs = 6_000): EnergyProjectileVisual {
    const visual = this.effects.createEnergyProjectile(position, projectileDirection, color, scale);
    (visual.root.userData as { scopedLifetimeMs?: number }).scopedLifetimeMs = lifetimeMs;
    const projectileId = id();
    (visual.root.userData as { scopedProjectileId?: string }).scopedProjectileId = projectileId;
    (visual.root.userData as { scopedSessionId?: string }).scopedSessionId = this.sessionId;
    this.projectiles.set(projectileId, {
      id: projectileId,
      position: vec3(position),
      direction: direction(projectileDirection),
      velocity: { x: 0, y: 0, z: 0 },
      color,
      scale,
      elapsed: 0,
      lifeFraction: 1,
      remainingMs: Math.max(0, lifetimeMs),
    });
    this.previousPositions.set(projectileId, position.clone());
    this.event('projectile-start', { projectile: { ...this.projectiles.get(projectileId)! } });
    return visual;
  }

  updateEnergyProjectile(visual: EnergyProjectileVisual, dt: number, lifeFraction: number, metadata?: { elapsed?: number; remainingMs?: number; direction?: THREE.Vector3 }): void {
    this.effects.updateEnergyProjectile(visual, dt, lifeFraction);
    const projectileId = (visual.root.userData as { scopedProjectileId?: string }).scopedProjectileId;
    const scopedSessionId = (visual.root.userData as { scopedSessionId?: string }).scopedSessionId;
    if (!projectileId || scopedSessionId !== this.sessionId) return;
    const state = this.projectiles.get(projectileId);
    if (!state) return;
    const previous = this.previousPositions.get(projectileId) ?? visual.root.position.clone();
    const current = visual.root.position.clone();
    const velocity = dt > 0 ? current.clone().sub(previous).multiplyScalar(1 / dt) : new THREE.Vector3();
    state.position = vec3(current);
    if (metadata?.direction) state.direction = direction(metadata.direction);
    state.velocity = vec3(velocity);
    state.elapsed = metadata?.elapsed ?? (state.elapsed + Math.max(0, dt));
    state.lifeFraction = THREE.MathUtils.clamp(lifeFraction, 0, 1);
    const lifetimeMs = Number((visual.root.userData as { scopedLifetimeMs?: number }).scopedLifetimeMs ?? 6_000);
    state.remainingMs = Math.min(120_000, Math.max(0, Math.round(metadata?.remainingMs ?? state.lifeFraction * lifetimeMs)));
    this.previousPositions.set(projectileId, current);
  }

  destroyEnergyProjectile(visual: EnergyProjectileVisual, burstScale = 0.8): void {
    const projectileId = (visual.root.userData as { scopedProjectileId?: string }).scopedProjectileId;
    const scopedSessionId = (visual.root.userData as { scopedSessionId?: string }).scopedSessionId;
    if (projectileId && scopedSessionId === this.sessionId) {
      this.event('projectile-end', { projectileId, position: vec3(visual.root.position), color: visual.color, scale: visual.scale, burstScale });
      this.projectiles.delete(projectileId);
      this.previousPositions.delete(projectileId);
    }
    this.effects.destroyEnergyProjectile(visual, burstScale);
  }

  spawnEnergyLaunch(position: THREE.Vector3, projectileDirection: THREE.Vector3, color = 0x74e8ff, scale = 1): void {
    this.effects.spawnEnergyLaunch(position, projectileDirection, color, scale);
    this.event('energy-launch', { position: vec3(position), direction: direction(projectileDirection), color, scale });
  }

  spawnShockwave(position: THREE.Vector3, radius: number, color = 0xbfe8ff, assetId?: SpellFxAssetId): void {
    this.effects.spawnShockwave(position, radius, color, assetId);
    this.event('shockwave', { position: vec3(position), radius, color, ...(assetId ? { assetId } : {}) });
  }

  spawnBeam(origin: THREE.Vector3, beamDirection: THREE.Vector3, length: number, color = 0xbfe8ff): void {
    this.effects.spawnBeam(origin, beamDirection, length, color);
    this.event('beam', { position: vec3(origin), direction: direction(beamDirection), length, color });
  }

  spawnHitSpark(position: THREE.Vector3, color = 0xfff1a8): void {
    this.effects.spawnHitSpark(position, color);
    this.event('hit-spark', { position: vec3(position), color });
  }

  spawnEnergyImpact(position: THREE.Vector3, color: number, scale: number): void {
    this.effects.spawnEnergyImpact(position, color, scale);
    this.event('energy-impact', { position: vec3(position), color, scale });
  }

  current(): RealtimePlayerVisual {
    this.pruneEvents();
    return {
      schemaVersion: 1,
      sessionId: this.sessionId,
      stateSequence: ++this.stateSequence,
      events: this.events.slice(0, 32).map(({ createdAt, ...event }) => ({ ...event, ageMs: Math.min(3_000, Math.max(0, Date.now() - createdAt)) })),
      projectiles: [...this.projectiles.values()].map((projectile) => ({ ...projectile, position: { ...projectile.position }, direction: { ...projectile.direction }, velocity: { ...projectile.velocity } })),
      shield: { ...this.shield },
    };
  }

  drainEvents(limit = 32): RealtimeVisualEvent[] {
    this.pruneEvents();
    return this.events.splice(0, Math.max(0, limit)).map(({ createdAt, ...event }) => ({ ...event, ageMs: Math.min(3_000, Math.max(0, Date.now() - createdAt)) }));
  }

  acknowledgeEvents(limit = 32): void { this.events.splice(0, Math.max(0, limit)); }
  pendingEventCount(): number { return this.events.length; }
  private pruneEvents(): void {
    const now = Date.now();
    while (this.events.length && now - this.events[0].createdAt > 3_000) this.events.shift();
  }
  setShield(shield: { active: boolean; opacity: number }): void {
    this.shield = { active: Boolean(shield.active), opacity: THREE.MathUtils.clamp(shield.opacity, 0, 1) };
  }
}
