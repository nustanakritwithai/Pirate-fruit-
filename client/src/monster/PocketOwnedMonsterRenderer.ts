import type * as THREE_NS from 'three';
import { createBigheadMonsterProvider } from '../../../asset-presentation/providers/procedural-bighead-monster.mjs';
import { OWNED_MONSTER_ASSETS } from '../../../asset-presentation/owned-monster-catalog.mjs';
import type { Updatable } from '../engine/Game';

type Three = typeof THREE_NS;
type Group = THREE_NS.Group;

export interface OwnedMonsterAuthority {
  authorityVersion: 'monster-authority/1';
  generation: number;
  hp: { current: number; max: number; revision: number };
  actionSequence?: number;
  actionSessionId?: string;
}

export interface OwnedMonsterActor {
  actorId: string;
  kind: 'monster';
  ownerId: string;
  monsterType: string;
  zone: string;
  generation: number;
  spawnSequence: number;
  stateSequence: number;
  lifecycle: 'spawn' | 'active' | 'despawn';
  pose: { x: number; y: number; z: number; dir: number };
  locomotion: 'idle' | 'walk' | 'run';
  actionSequence?: number;
  actionSessionId?: string;
  animation?: { combatState?: string; attackProgress?: number; actionSequence?: number; actionSessionId?: string };
  authority: OwnedMonsterAuthority;
}

const MAX_ACTORS = 32;
const MAX_COORDINATE = 10_000;
type Handle = ReturnType<ReturnType<typeof createBigheadMonsterProvider>>;
interface Entry {
  actor: OwnedMonsterActor;
  handle: Handle;
  group: Group;
  target: THREE_NS.Vector3;
  render: THREE_NS.Vector3;
  hpFill: THREE_NS.Mesh;
  lastActionKey: string;
  actionClip: 'attack' | 'skill' | 'hurt' | null;
  actionElapsed: number;
}

/** Returns a short presentation-only motion for an authoritative action. */
export function ownedMonsterActionMotion(
  clip: 'attack' | 'skill' | 'hurt' | null,
  elapsed: number,
): { forward: number; lift: number } {
  if (!clip) return { forward: 0, lift: 0 };
  const duration = clip === 'attack' ? 0.32 : clip === 'skill' ? 0.42 : 0.18;
  const progress = Math.max(0, Math.min(1, elapsed / duration));
  const pulse = Math.sin(progress * Math.PI);
  if (clip === 'attack') return { forward: pulse * 0.46, lift: pulse * 0.035 };
  if (clip === 'skill') return { forward: -pulse * 0.28, lift: pulse * 0.18 };
  return { forward: -pulse * 0.08, lift: pulse * 0.025 };
}

export function ownedMonsterActionKey(actor: Pick<OwnedMonsterActor, 'generation' | 'actionSequence' | 'actionSessionId' | 'stateSequence' | 'animation' | 'authority'>): string {
  const sequence = actor.actionSequence ?? actor.animation?.actionSequence ?? actor.authority.actionSequence;
  const session = actor.actionSessionId ?? actor.animation?.actionSessionId ?? actor.authority.actionSessionId ?? '';
  return `${actor.generation}:${session}:${sequence ?? actor.stateSequence}`;
}

/** Maps the canonical server combat vocabulary to the procedural handle clips. */
export function ownedMonsterAnimationForState(state: string | undefined): 'attack' | 'skill' | 'hurt' | null {
  if (state === 'attack' || /^attack[1-4]$/.test(state ?? '')) return 'attack';
  if (state === 'skill' || state === 'casting') return 'skill';
  if (state === 'hurt' || state === 'stunned' || state === 'knockback' || state === 'knockdown') return 'hurt';
  return null;
}

export function isValidOwnedMonsterActor(actor: unknown): actor is OwnedMonsterActor {
  if (!actor || typeof actor !== 'object') return false;
  const candidate = actor as Partial<OwnedMonsterActor>;
  const p = candidate.pose;
  const a = candidate.authority;
  const generation = candidate.generation;
  const spawnSequence = candidate.spawnSequence;
  const stateSequence = candidate.stateSequence;
  if (!p || !a || typeof generation !== 'number' || typeof spawnSequence !== 'number' || typeof stateSequence !== 'number'
    || typeof p.x !== 'number' || typeof p.y !== 'number' || typeof p.z !== 'number' || typeof p.dir !== 'number'
    || !a.hp) return false;
  return candidate.kind === 'monster' && typeof candidate.actorId === 'string' && candidate.actorId.startsWith('owned:')
    && typeof candidate.ownerId === 'string' && candidate.ownerId.length > 0
    && typeof candidate.monsterType === 'string' && OWNED_MONSTER_ASSETS.has(candidate.monsterType)
    && typeof candidate.zone === 'string' && candidate.zone.length > 0
    && (candidate.lifecycle === 'spawn' || candidate.lifecycle === 'active' || candidate.lifecycle === 'despawn')
    && (candidate.locomotion === 'idle' || candidate.locomotion === 'walk' || candidate.locomotion === 'run')
    && Number.isSafeInteger(generation) && generation > 0
    && Number.isSafeInteger(spawnSequence) && spawnSequence > 0
    && Number.isSafeInteger(stateSequence) && stateSequence >= 0
    && (candidate.actionSequence === undefined || Number.isSafeInteger(candidate.actionSequence))
    && Number.isFinite(p?.x) && Number.isFinite(p?.y) && Number.isFinite(p?.z) && Number.isFinite(p?.dir)
    && Math.abs(p.x) <= MAX_COORDINATE && Math.abs(p.y) <= MAX_COORDINATE && Math.abs(p.z) <= MAX_COORDINATE
    && a.authorityVersion === 'monster-authority/1' && a.generation === generation
    && (a.actionSequence === undefined || Number.isSafeInteger(a.actionSequence))
    && (a.actionSessionId === undefined || (typeof a.actionSessionId === 'string' && a.actionSessionId.length > 0 && a.actionSessionId.length <= 120))
    && Number.isFinite(a.hp.current) && Number.isFinite(a.hp.max) && a.hp.max > 0
    && a.hp.current >= 0 && a.hp.current <= a.hp.max && Number.isSafeInteger(a.hp.revision) && a.hp.revision >= 0;
}

export class PocketOwnedMonsterRenderer implements Updatable {
  private readonly entries = new Map<string, Entry>();
  private actors: readonly OwnedMonsterActor[] = [];
  private readonly provider: (input?: Record<string, unknown>) => Handle;

  constructor(private readonly scene: THREE_NS.Scene, private readonly THREE: Three) {
    const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
    const cone = (r: number, h: number, segments = 4) => new THREE.ConeGeometry(r, h, segments);
    const torus = (r: number, t: number) => new THREE.TorusGeometry(r, t, 6, 12);
    const material = (color: number, roughness = 0.72, metalness = 0.06) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
    this.provider = createBigheadMonsterProvider({ THREE, box, cone, torus, material, basicMaterial: (color: number) => material(color, 1, 0) });
  }

  setActors(actors: readonly OwnedMonsterActor[]): void {
    // Filter owned authority first: the transport envelope may also contain up
    // to 128 ambient actors, which must never consume the owned render budget.
    const owned = actors.filter((actor) => isValidOwnedMonsterActor(actor));
    this.actors = owned.length > MAX_ACTORS ? owned.slice(0, MAX_ACTORS) : owned;
  }

  update(dt: number): void {
    const seen = new Set<string>();
    for (const actor of this.actors) {
      if (!isValidOwnedMonsterActor(actor)) continue;
      seen.add(actor.actorId);
      let entry = this.entries.get(actor.actorId);
      if (entry && entry.actor.generation > actor.generation) continue;
      if (entry && entry.actor.generation === actor.generation
        && (actor.stateSequence < entry.actor.stateSequence || actor.spawnSequence < entry.actor.spawnSequence)) continue;
      if (actor.lifecycle === 'despawn' || actor.authority.hp.current <= 0) {
        this.remove(actor.actorId);
        continue;
      }
      if (!entry || entry.actor.generation !== actor.generation || entry.actor.monsterType !== actor.monsterType) {
        this.remove(actor.actorId);
        const definition = OWNED_MONSTER_ASSETS.get(actor.monsterType);
        if (!definition) continue;
        const handle = this.provider({ def: definition, request: { role: 'owned-monster' } });
        const group = new this.THREE.Group();
        group.name = actor.actorId;
        group.add(handle.root);
        group.position.set(actor.pose.x, actor.pose.y, actor.pose.z);
        group.rotation.y = actor.pose.dir;
        const hpFill = new this.THREE.Mesh(
          new this.THREE.BoxGeometry(1.6, 0.09, 0.04),
          new this.THREE.MeshBasicMaterial({ color: 0x46d369, transparent: true }),
        );
        hpFill.position.set(0, 2.2, 0);
        group.add(hpFill);
        this.scene.add(group);
        const target = new this.THREE.Vector3(actor.pose.x, actor.pose.y, actor.pose.z);
        entry = {
          actor, handle, group, target, render: target.clone(), hpFill,
          lastActionKey: '', actionClip: null, actionElapsed: 0,
        };
        this.entries.set(actor.actorId, entry);
      }
      entry.actor = actor;
      entry.target.set(actor.pose.x, actor.pose.y, actor.pose.z);
      entry.render.lerp(entry.target, Math.min(1, dt * 12));
      const state = actor.animation?.combatState ?? 'idle';
      const actionKey = ownedMonsterActionKey(actor);
      const animation = ownedMonsterAnimationForState(state);
      if (animation && actionKey !== entry.lastActionKey) {
        entry.actionClip = animation;
        entry.actionElapsed = 0;
        if (animation === 'attack') entry.handle.play('attack', { duration: 0.32 });
        else if (animation === 'skill') entry.handle.play('skill', { duration: 0.42 });
        else if (animation === 'hurt') entry.handle.play('hurt', { duration: 0.18 });
        entry.lastActionKey = actionKey;
      }
      entry.actionElapsed += dt;
      const motion = ownedMonsterActionMotion(entry.actionClip, entry.actionElapsed);
      entry.group.position.set(
        entry.render.x + Math.sin(actor.pose.dir) * motion.forward,
        entry.render.y + motion.lift,
        entry.render.z + Math.cos(actor.pose.dir) * motion.forward,
      );
      entry.group.rotation.y = actor.pose.dir;
      entry.hpFill.scale.x = actor.authority.hp.current / actor.authority.hp.max;
      entry.handle.update(dt, { moving: actor.locomotion !== 'idle' });
    }
    for (const id of this.entries.keys()) if (!seen.has(id)) this.remove(id);
  }

  reset(): void { for (const id of [...this.entries.keys()]) this.remove(id); this.actors = []; }

  private remove(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    this.scene.remove(entry.group);
    entry.hpFill.geometry.dispose();
    (entry.hpFill.material as THREE_NS.Material).dispose();
    entry.handle.dispose();
    this.entries.delete(id);
  }
}
