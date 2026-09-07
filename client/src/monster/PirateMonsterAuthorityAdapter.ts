import type { SharedMonsterActor, SharedMonsterActorLifecycle, SharedMonsterActorLocomotion } from './SharedMonsterClient';
import { MONSTER_TYPES } from './MonsterData';

const MAX_INTENTS = 32;
const MAX_ACTORS = 128;
const MAX_SEQUENCE = Number.MAX_SAFE_INTEGER;
const MAX_COORDINATE = 10_000;
const CATEGORIES = new Set<PirateMonsterIntent['category']>(['style', 'sword', 'gun', 'fruit', 'utility']);

export interface PirateMonsterIntent {
  schemaVersion: 1;
  intentId: string;
  zone: string;
  kind: 'melee' | 'skill';
  category: 'style' | 'sword' | 'gun' | 'fruit' | 'utility';
  forwardX: number;
  forwardZ: number;
  range: number;
  skillId?: string;
  area?: number;
  sequence: number;
}

export interface PirateMonsterIntentInput {
  zone: string;
  kind: 'melee' | 'skill';
  category: PirateMonsterIntent['category'];
  forwardX: number;
  forwardZ: number;
  range: number;
  skillId?: string;
  area?: number;
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function safeText(value: unknown, max: number): string | undefined {
  return typeof value === 'string' && value.length > 0 && value.length <= max ? value : undefined;
}

function normalizeDirection(x: number, z: number): { x: number; z: number } | null {
  const length = Math.hypot(x, z);
  if (!Number.isFinite(length) || length < 0.0001) return null;
  return { x: x / length, z: z / length };
}

function validZone(zone: unknown): zone is string {
  return typeof zone === 'string' && zone.length > 0 && zone.length <= 40;
}

function validActorLifecycle(value: unknown): value is SharedMonsterActorLifecycle {
  return value === 'spawn' || value === 'active' || value === 'despawn';
}

function validLocomotion(value: unknown): value is SharedMonsterActorLocomotion {
  return value === 'idle' || value === 'walk' || value === 'run';
}

/** Presentation-only adapter: no position, velocity, HP, damage, or target authority crosses this seam. */
export class PirateMonsterAuthorityAdapter {
  private readonly intents: PirateMonsterIntent[] = [];
  private intentSequence = 0;
  private sessionGeneration = 1;
  private currentZone: string | null = null;

  queueIntent(input: PirateMonsterIntentInput): PirateMonsterIntent | null {
    if (!validZone(input.zone) || (input.kind !== 'melee' && input.kind !== 'skill') || !CATEGORIES.has(input.category)) return null;
    const direction = normalizeDirection(input.forwardX, input.forwardZ);
    if (!direction || !finite(input.range) || input.range < 0 || input.range > MAX_COORDINATE) return null;
    if (input.area !== undefined && (!finite(input.area) || input.area < 0 || input.area > MAX_COORDINATE)) return null;
    if (input.skillId !== undefined && !safeText(input.skillId, 80)) return null;
    if (this.currentZone !== input.zone) this.setZone(input.zone);
    const sequence = this.intentSequence < MAX_SEQUENCE ? ++this.intentSequence : MAX_SEQUENCE;
    const intent: PirateMonsterIntent = {
      schemaVersion: 1,
      intentId: `monster-intent:${this.sessionGeneration}:${sequence}`,
      zone: input.zone,
      kind: input.kind,
      category: input.category,
      forwardX: direction.x,
      forwardZ: direction.z,
      range: input.range,
      sequence,
      ...(input.skillId ? { skillId: input.skillId } : {}),
      ...(input.area !== undefined ? { area: input.area } : {}),
    };
    this.intents.push(Object.freeze(intent));
    while (this.intents.length > MAX_INTENTS) this.intents.shift();
    return intent;
  }

  drainIntents(): PirateMonsterIntent[] {
    const drained = this.intents.splice(0, this.intents.length);
    return drained.map((intent) => ({ ...intent }));
  }

  setZone(zone: string): void {
    if (!validZone(zone) || zone === this.currentZone) return;
    this.currentZone = zone;
    this.intents.length = 0;
    this.sessionGeneration = this.sessionGeneration < MAX_SEQUENCE ? this.sessionGeneration + 1 : MAX_SEQUENCE;
  }

  resetSession(): void {
    this.intents.length = 0;
    this.sessionGeneration = this.sessionGeneration < MAX_SEQUENCE ? this.sessionGeneration + 1 : MAX_SEQUENCE;
  }

  /** Reject forged/out-of-zone actor envelopes before SharedMonsterClient sees them. */
  sanitizeActors(zone: string, actors: readonly SharedMonsterActor[], ownerId?: string): SharedMonsterActor[] {
    if (!validZone(zone) || !Array.isArray(actors) || actors.length > MAX_ACTORS) return [];
    const seen = new Set<string>();
    return actors.flatMap((actor) => {
      if (!actor || actor.kind !== 'monster' || actor.zone !== zone || !validZone(actor.actorId)
        || !actor.actorId.startsWith('monster:') || !MONSTER_TYPES[actor.monsterType]
        || seen.has(actor.actorId) || (ownerId !== undefined && actor.ownerId !== ownerId)
        || !validActorLifecycle(actor.lifecycle) || !validLocomotion(actor.locomotion)
        || !Number.isSafeInteger(actor.generation) || actor.generation < 1
        || !Number.isSafeInteger(actor.spawnSequence) || actor.spawnSequence < 1
        || !Number.isSafeInteger(actor.stateSequence) || actor.stateSequence < 0
        || !finite(actor.pose.x) || !finite(actor.pose.y) || !finite(actor.pose.z) || !finite(actor.pose.dir)
        || Math.abs(actor.pose.x) > MAX_COORDINATE || Math.abs(actor.pose.y) > MAX_COORDINATE || Math.abs(actor.pose.z) > MAX_COORDINATE
        || !actor.animation || typeof actor.animation.combatState !== 'string' || typeof actor.animation.category !== 'string'
        || typeof actor.animation.onGround !== 'boolean' || typeof actor.animation.dashing !== 'boolean' || !finite(actor.animation.verticalVelocity)
        || (actor.presentation !== undefined && (!Array.isArray(actor.presentation.events)
          || !Array.isArray(actor.presentation.projectiles)
          || actor.presentation.events.length > 32 || actor.presentation.projectiles.length > 32))) return [];
      seen.add(actor.actorId);
      return [{ ...actor, pose: { ...actor.pose }, animation: { ...actor.animation }, ...(actor.presentation ? { presentation: { events: [...actor.presentation.events], projectiles: [...actor.presentation.projectiles] } } : {}) }];
    });
  }
}
