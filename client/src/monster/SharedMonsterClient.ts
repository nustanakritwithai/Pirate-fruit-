/**
 * S16 — Shared Monster World (ฝั่งภาพ)
 * รับ snapshot (full) + delta (ต่อ tick) ของมอนสเตอร์กลางจาก Server แล้วเรนเดอร์
 * ไถลเข้าหาตำแหน่งล่าสุด (interpolate) กลบ jitter เน็ต — Server เป็นเจ้าของ HP/state
 * - มอนสเตอร์เป็นสิ่งเดียวในโลกกลาง: ทุกคนบนเกาะเห็น HP/ตาย/เกิดใหม่ตรงกัน
 * - โดนตี = ส่ง "เจตนาตี" ให้ Server ตัดสิน (targetsInCone) ไม่ลด HP เอง
 */

import * as THREE from 'three';
import type { Updatable } from '../engine/Game';
import { MONSTER_TYPES } from './MonsterData';
import { Monster, type MonsterState } from './Monster';
import type { Effects } from '../effects/Effects';
import {
  isWorldSafeZone,
  type WorldMonsterAttack,
  type WorldMonsterSnapshot,
  type WorldMonsterDelta,
  type WorldMonsterState,
  type RealtimePlayerVisual,
} from '@pirate-fruit/shared';

const LERP_PER_SECOND = 8;
const MAX_EXTRAPOLATION_MS = 300;
const MAX_PRESENTATION_SPEED = 8;

interface SharedMonster {
  visual: Monster;
  group: THREE.Group;
  target: THREE.Vector3;
  renderTarget: THREE.Vector3;
  velocity: THREE.Vector3;
  lastTargetAt: number;
  targetHeading: number;
  hp: number;
  maxHp: number;
  state: WorldMonsterState;
  monsterId: string;
  spawnSequence: number;
  stateSequence: number;
}

interface PendingMonsterAttack {
  attack: WorldMonsterAttack;
  hitAt: number;
}

export type SharedMonsterActorLifecycle = 'spawn' | 'active' | 'despawn';
export type SharedMonsterActorLocomotion = 'idle' | 'walk' | 'run';

/** Presentation-only actor envelope. Authority fields (HP, damage, target) never enter it. */
export interface SharedMonsterActor {
  actorId: string;
  kind: 'monster' | 'summon';
  owner?: string;
  type: string;
  zone: string;
  generation: number;
  spawnSequence: number;
  stateSequence: number;
  lifecycle: SharedMonsterActorLifecycle;
  pose: { x: number; y: number; z: number; heading: number };
  locomotion: SharedMonsterActorLocomotion;
  animation: { state: WorldMonsterState; action?: string };
  visual?: RealtimePlayerVisual;
}

export const SHARED_MONSTER_ACTOR_LIMIT = 128;
export const SHARED_MONSTER_ACTOR_EVENT_LIMIT = 32;
export const SHARED_MONSTER_ACTOR_PROJECTILE_LIMIT = 64;

function renderState(state: WorldMonsterState): MonsterState {
  if (state === 'dead') return 'dead';
  if (state === 'attack') return 'attack';
  if (state === 'stunned') return 'idle';
  if (state === 'chase' || state === 'aggro') return 'chase';
  if (state === 'return' || state === 'patrol') return 'return';
  return 'idle';
}

function isMovingState(state: WorldMonsterState): boolean {
  return state === 'aggro'
    || state === 'chase'
    || state === 'return'
    || state === 'patrol';
}

export interface SharedMonsterDamageResolution {
  hp: number;
  taken: number;
  defeated: boolean;
}

export interface SharedMonsterPlayerHit {
  damage: number;
  sourceX: number;
  sourceZ: number;
  attackId: string;
}

/** Pure damage transition used by main so shared-monster death cannot miss respawn. */
export function resolveSharedMonsterPlayerDamage(
  currentHp: number,
  rawDamage: number,
  mitigate: (amount: number) => number,
): SharedMonsterDamageResolution {
  const hp = Math.max(0, Number.isFinite(currentHp) ? currentHp : 0);
  if (hp <= 0 || rawDamage <= 0 || !Number.isFinite(rawDamage)) {
    return { hp, taken: 0, defeated: false };
  }
  const mitigated = mitigate(rawDamage);
  const taken = Math.max(0, Number.isFinite(mitigated) ? mitigated : 0);
  const nextHp = Math.max(0, hp - taken);
  return { hp: nextHp, taken, defeated: hp > 0 && nextHp <= 0 };
}

export class SharedMonsterClient implements Updatable {
  private readonly monsters = new Map<string, SharedMonster>();
  private readonly pendingSnapshots = new Map<string, readonly WorldMonsterSnapshot[]>();
  private readonly pendingAttacks: PendingMonsterAttack[] = [];
  private readonly seenAttackIds = new Set<string>();
  /** Authoritative hit deltas are replay-safe presentation events. */
  private readonly seenHitDeltas = new Set<string>();
  private readonly actorStateSequences = new Map<string, number>();
  private readonly actorSpawnSequences = new Map<string, number>();
  private readonly actorGenerations = new Map<string, number>();
  private generation = 1;
  private stateSequence = 0;
  private currentIslandId: string;

  constructor(
    private readonly scene: THREE.Scene,
    islandId: string,
    private readonly heightAt: (x: number, z: number) => number = () => 0,
    private readonly now: () => number = () => Date.now(),
    private readonly effects?: Pick<Effects, 'spawnHitSpark'>,
  ) {
    this.currentIslandId = islandId;
  }

  get count(): number {
    return this.monsters.size;
  }

  /** Read-only presentation hook for spatial audio/effects; never exposes a mutable group. */
  positionOf(spawnId: string): THREE.Vector3 | undefined {
    const position = this.monsters.get(spawnId)?.group.position;
    return position?.clone();
  }

  /**
   * ผู้เล่นเราย้ายเกาะ → ล้างมอนสเตอร์เกาะเก่า แล้วใช้ snapshot ที่อาจมาถึง
   * ก่อน IslandManager ตรวจพบการขึ้นฝั่ง. คืน true เพื่อให้ caller ขอ resync สดอีกครั้ง.
   */
  setIsland(islandId: string): boolean {
    if (islandId === this.currentIslandId) return false;
    this.currentIslandId = islandId;
    this.pendingAttacks.length = 0;
    this.seenAttackIds.clear();
    this.seenHitDeltas.clear();
    for (const spawnId of [...this.monsters.keys()]) this.remove(spawnId);
    const pending = this.pendingSnapshots.get(islandId);
    this.pendingSnapshots.delete(islandId);
    if (pending) this.applySnapshot(islandId, pending);
    return true;
  }

  /** Reconnect/session boundary: discard one-shot bookkeeping before resync. */
  resetSession(): void {
    this.pendingAttacks.length = 0;
    this.seenAttackIds.clear();
    this.seenHitDeltas.clear();
    this.actorStateSequences.clear();
    this.actorSpawnSequences.clear();
    this.actorGenerations.clear();
    this.generation += 1;
    this.stateSequence = 0;
  }

  /** Immutable local actor envelope for the owner-presentation publisher. */
  getActors(): SharedMonsterActor[] {
    return [...this.monsters.entries()].slice(0, SHARED_MONSTER_ACTOR_LIMIT).map(([spawnId, monster]) => {
      const actorId = `monster:${spawnId}`;
      return {
        actorId,
        kind: 'monster' as const,
        type: monster.monsterId,
        zone: this.currentIslandId,
        generation: this.generation,
        spawnSequence: this.actorSpawnSequences.get(actorId) ?? 1,
        stateSequence: this.actorStateSequences.get(actorId) ?? 0,
        lifecycle: monster.state === 'dead' ? 'despawn' as const : 'active' as const,
        pose: {
          x: monster.group.position.x,
          y: monster.group.position.y,
          z: monster.group.position.z,
          heading: monster.group.rotation.y,
        },
        locomotion: monster.state === 'chase' || monster.state === 'aggro'
          ? 'run' as const
          : monster.state === 'patrol' || monster.state === 'return'
            ? 'walk' as const
            : 'idle' as const,
        animation: { state: monster.state },
      };
    });
  }

  /** Consume presentation-only actor snapshots; HP/damage/target fields are rejected by type. */
  applyActors(zone: string, actors: readonly SharedMonsterActor[]): void {
    if (zone !== this.currentIslandId || actors.length > SHARED_MONSTER_ACTOR_LIMIT) return;
    const seen = new Set<string>();
    for (const actor of actors) {
      if (!actor || actor.kind !== 'monster' || actor.zone !== this.currentIslandId) continue;
      const spawnId = actor.actorId.startsWith('monster:') ? actor.actorId.slice(8) : '';
      if (!spawnId || !MONSTER_TYPES[actor.type]) continue;
      seen.add(spawnId);
      if (!Number.isInteger(actor.generation) || actor.generation < 1
        || !Number.isInteger(actor.spawnSequence) || actor.spawnSequence < 1
        || !Number.isInteger(actor.stateSequence) || actor.stateSequence < 0) continue;
      if (actor.lifecycle === 'despawn') {
        this.remove(actor.actorId.replace(/^monster:/, ''));
        continue;
      }
      const priorGeneration = this.actorGenerations.get(actor.actorId) ?? -1;
      const priorSpawn = this.actorSpawnSequences.get(actor.actorId) ?? -1;
      const prior = actor.generation > priorGeneration || actor.spawnSequence > priorSpawn
        ? -1
        : this.actorStateSequences.get(actor.actorId) ?? -1;
      if (actor.generation < priorGeneration
        || (actor.generation === priorGeneration && actor.spawnSequence < priorSpawn)
        || actor.stateSequence <= prior) continue;
      this.actorGenerations.set(actor.actorId, actor.generation);
      this.actorStateSequences.set(actor.actorId, actor.stateSequence);
      this.actorSpawnSequences.set(actor.actorId, actor.spawnSequence);
      seen.add(spawnId);
      const monster = this.monsters.get(spawnId);
      if (!monster) {
        this.upsert({
          spawnId,
          monsterId: actor.type,
          islandId: this.currentIslandId,
          x: actor.pose.x,
          z: actor.pose.z,
          heading: actor.pose.heading,
          hp: MONSTER_TYPES[actor.type].maxHp,
          maxHp: MONSTER_TYPES[actor.type].maxHp,
          state: actor.animation.state,
        });
      } else {
        monster.target.set(actor.pose.x, actor.pose.y, actor.pose.z);
        monster.targetHeading = actor.pose.heading;
        monster.state = actor.animation.state;
        monster.visual.applyAuthoritativeState(monster.hp, monster.maxHp, renderState(monster.state));
      }
      this.replayActorVisual(actor);
    }
    for (const [spawnId] of this.monsters) {
      if (!seen.has(spawnId) && actors.length > 0) this.remove(spawnId);
    }
  }

  private replayActorVisual(actor: SharedMonsterActor): void {
    const visual = actor.visual;
    if (!visual) return;
    for (const event of visual.events.slice(0, SHARED_MONSTER_ACTOR_EVENT_LIMIT)) {
      if (event.ageMs > 3_000 || !event.position) continue;
      if (event.kind === 'hit-spark') this.effects?.spawnHitSpark(new THREE.Vector3(event.position.x, event.position.y, event.position.z), event.color);
      if (event.kind === 'energy-impact') this.effects?.spawnHitSpark(new THREE.Vector3(event.position.x, event.position.y, event.position.z), event.color);
    }
  }

  /** full snapshot — แทนที่ทั้งเกาะ (join/resync) */
  applySnapshot(islandId: string, monsters: readonly WorldMonsterSnapshot[]): void {
    if (islandId !== this.currentIslandId) {
      // Boat authority can cross the Server island boundary slightly before the
      // local terrain detector. Keep that one-shot seed instead of discarding it.
      this.pendingSnapshots.set(islandId, [...monsters]);
      return;
    }
    this.pendingSnapshots.delete(islandId);
    const seen = new Set<string>();
    for (const snapshot of monsters) {
      seen.add(snapshot.spawnId);
      this.upsert(snapshot);
    }
    for (const spawnId of [...this.monsters.keys()]) {
      if (!seen.has(spawnId)) this.remove(spawnId);
    }
  }

  applyDelta(islandId: string, updates: readonly WorldMonsterDelta[]): void {
    if (islandId !== this.currentIslandId) return;
    for (const update of updates) {
      if (update.cancelAttackId) this.cancelPendingAttack(update.cancelAttackId);
      const monster = this.monsters.get(update.spawnId);
      if (!monster) continue;
      if (update.state !== 'dead' && !monster.group.visible) {
        monster.group.visible = true;
      }
      const receivedAt = this.now();
      const elapsed = Math.max(0.05, (receivedAt - monster.lastTargetAt) / 1_000);
      const nextY = this.heightAt(update.x, update.z);
      if (isMovingState(update.state)) {
        monster.velocity.set(
          (update.x - monster.target.x) / elapsed,
          0,
          (update.z - monster.target.z) / elapsed,
        );
        const speed = Math.hypot(monster.velocity.x, monster.velocity.z);
        if (speed > MAX_PRESENTATION_SPEED) {
          monster.velocity.multiplyScalar(MAX_PRESENTATION_SPEED / speed);
        }
      } else {
        monster.velocity.set(0, 0, 0);
      }
      monster.target.set(update.x, nextY, update.z);
      monster.lastTargetAt = receivedAt;
      monster.targetHeading = update.heading;
      const wasHit = update.hp < monster.hp && update.state !== 'dead';
      monster.hp = update.hp;
      monster.state = update.state;
      monster.visual.applyAuthoritativeState(update.hp, monster.maxHp, renderState(update.state));
      if (update.damage !== undefined && update.damage > 0) {
        const hitKey = `${update.spawnId}:${update.hp}:${update.damage}`;
        if (!this.seenHitDeltas.has(hitKey)) {
          this.seenHitDeltas.add(hitKey);
          if (this.seenHitDeltas.size > 1024) {
            const oldest = this.seenHitDeltas.values().next().value;
            if (typeof oldest === 'string') this.seenHitDeltas.delete(oldest);
          }
          const impact = monster.group.position.clone();
          impact.y += monster.monsterId === 'crab' ? 0.65 : 1.05 * (MONSTER_TYPES[monster.monsterId]?.scale ?? 1);
          this.effects?.spawnHitSpark(impact);
        }
      }
      if (update.hitReaction) {
        monster.visual.playHitReaction();
        monster.visual.playHitReactionDirection(
          update.hitReaction.directionX,
          update.hitReaction.directionZ,
          update.hitReaction.strength,
        );
      } else if (wasHit) {
        // Backward-compatible fallback for a mixed-version Server during rollout.
        monster.visual.playHitReaction();
      }
    }
  }

  /**
   * Apply one Server-authored monster action. The persistent `attack` state is
   * presentation state only; this event is the sole source of a hit frame.
   * Every observer plays the action, while only the named target queues damage.
   */
  applyAttack(attack: WorldMonsterAttack, localCharacterId?: string): void {
    if (attack.islandId !== this.currentIslandId || this.seenAttackIds.has(attack.attackId)) return;
    const monster = this.monsters.get(attack.spawnId);
    if (
      !monster
      || monster.monsterId !== attack.monsterId
      || monster.state === 'dead'
      || monster.state === 'stunned'
    ) return;
    this.seenAttackIds.add(attack.attackId);
    if (this.seenAttackIds.size > 1024) {
      const oldest = this.seenAttackIds.values().next().value;
      if (typeof oldest === 'string') this.seenAttackIds.delete(oldest);
    }
    monster.state = 'attack';
    monster.visual.applyAuthoritativeState(monster.hp, monster.maxHp, 'attack');
    monster.visual.playAttackAnimation(attack.action !== 'melee');
    if (attack.targetId === localCharacterId) {
      this.pendingAttacks.push({
        attack,
        hitAt: this.now() + Math.max(0, attack.hitDelayMs),
      });
    }
  }

  markDead(spawnId: string): void {
    const monster = this.monsters.get(spawnId);
    if (!monster) return;
    this.cancelPendingAttacksForSpawn(spawnId);
    monster.state = 'dead';
    monster.hp = 0;
    monster.velocity.set(0, 0, 0);
    monster.visual.applyAuthoritativeState(0, monster.maxHp, 'dead');
  }

  applyRespawn(snapshot: WorldMonsterSnapshot): void {
    if (snapshot.islandId !== this.currentIslandId) return;
    this.upsert(snapshot);
    const monster = this.monsters.get(snapshot.spawnId);
    if (monster) monster.group.visible = true;
  }

  private upsert(snapshot: WorldMonsterSnapshot): void {
    let monster = this.monsters.get(snapshot.spawnId);
    if (monster && monster.monsterId !== snapshot.monsterId) {
      this.remove(snapshot.spawnId);
      monster = undefined;
    }
    if (!monster) {
      const type = MONSTER_TYPES[snapshot.monsterId];
      if (!type) return;
      const groundY = this.heightAt(snapshot.x, snapshot.z);
      const visual = new Monster(type, snapshot.x, snapshot.z, groundY, Number.MAX_SAFE_INTEGER);
      const group = visual.group;
      group.rotation.y = snapshot.heading;
      visual.applyAuthoritativeState(snapshot.hp, snapshot.maxHp, renderState(snapshot.state));
      this.scene.add(group);
      monster = {
        visual,
        group,
        target: new THREE.Vector3(snapshot.x, groundY, snapshot.z),
        renderTarget: new THREE.Vector3(snapshot.x, groundY, snapshot.z),
        velocity: new THREE.Vector3(),
        lastTargetAt: this.now(),
        targetHeading: snapshot.heading,
        hp: snapshot.hp,
        maxHp: snapshot.maxHp,
        state: snapshot.state,
        monsterId: snapshot.monsterId,
        spawnSequence: 1,
        stateSequence: ++this.stateSequence,
      };
      const actorId = `monster:${snapshot.spawnId}`;
      this.actorSpawnSequences.set(actorId, monster.spawnSequence);
      this.actorStateSequences.set(actorId, monster.stateSequence);
      this.monsters.set(snapshot.spawnId, monster);
      return;
    }
    monster.target.set(snapshot.x, this.heightAt(snapshot.x, snapshot.z), snapshot.z);
    monster.renderTarget.copy(monster.target);
    monster.velocity.set(0, 0, 0);
    monster.lastTargetAt = this.now();
    monster.targetHeading = snapshot.heading;
    monster.hp = snapshot.hp;
    monster.maxHp = snapshot.maxHp;
    monster.state = snapshot.state;
    monster.visual.applyAuthoritativeState(snapshot.hp, snapshot.maxHp, renderState(snapshot.state));
    monster.stateSequence = ++this.stateSequence;
    this.actorStateSequences.set(`monster:${snapshot.spawnId}`, monster.stateSequence);
  }

  private remove(spawnId: string): void {
    const monster = this.monsters.get(spawnId);
    if (!monster) return;
    this.scene.remove(monster.group);
    monster.visual.dispose();
    this.monsters.delete(spawnId);
    this.actorStateSequences.delete(`monster:${spawnId}`);
    this.actorSpawnSequences.delete(`monster:${spawnId}`);
    this.actorGenerations.delete(`monster:${spawnId}`);
    this.cancelPendingAttacksForSpawn(spawnId);
  }

  private cancelPendingAttack(attackId: string): void {
    for (let i = this.pendingAttacks.length - 1; i >= 0; i -= 1) {
      if (this.pendingAttacks[i]?.attack.attackId === attackId) this.pendingAttacks.splice(i, 1);
    }
  }

  private cancelPendingAttacksForSpawn(spawnId: string): void {
    for (let i = this.pendingAttacks.length - 1; i >= 0; i -= 1) {
      if (this.pendingAttacks[i]?.attack.spawnId === spawnId) this.pendingAttacks.splice(i, 1);
    }
  }

  /** spawnId ของมอนสเตอร์ (มีชีวิต) ที่อยู่ในกรวยโจมตีหน้าเรา — ส่งเจตนาตีให้ Server */
  targetsInCone(
    origin: THREE.Vector3,
    forwardX: number,
    forwardZ: number,
    range: number,
    halfAngle: number,
  ): string[] {
    if (isWorldSafeZone(this.currentIslandId, origin.x, origin.z)) return [];
    const flen = Math.hypot(forwardX, forwardZ) || 1;
    const fx = forwardX / flen;
    const fz = forwardZ / flen;
    const cosHalf = Math.cos(halfAngle);
    const hits: string[] = [];
    for (const [spawnId, monster] of this.monsters) {
      if (monster.state === 'dead' || monster.hp <= 0) continue;
      // Targeting must use the latest authoritative coordinate, not the
      // interpolated visual which can lag far behind during reconnect/jitter.
      const dx = monster.target.x - origin.x;
      const dz = monster.target.z - origin.z;
      const dist = Math.hypot(dx, dz);
      if (dist > range || dist < 1e-3) continue;
      if ((dx / dist) * fx + (dz / dist) * fz < cosHalf) continue;
      hits.push(spawnId);
    }
    return hits;
  }

  /** Alive targets in an authoritative circular area (AoE/ground/DoT). */
  targetsInRadius(origin: THREE.Vector3, radius: number): string[] {
    if (isWorldSafeZone(this.currentIslandId, origin.x, origin.z)) return [];
    const radiusSq = Math.max(0, radius) ** 2;
    const hits: string[] = [];
    for (const [spawnId, monster] of this.monsters) {
      if (monster.state === 'dead' || monster.hp <= 0) continue;
      const dx = monster.target.x - origin.x;
      const dz = monster.target.z - origin.z;
      if (dx * dx + dz * dz <= radiusSq) hits.push(spawnId);
    }
    return hits;
  }

  /** Consume due authoritative hits with their real source for block/reaction direction. */
  collectPlayerHits(playerPos: THREE.Vector3): SharedMonsterPlayerHit[] {
    const now = this.now();
    const safe = isWorldSafeZone(this.currentIslandId, playerPos.x, playerPos.z);
    const hits: SharedMonsterPlayerHit[] = [];
    for (let i = this.pendingAttacks.length - 1; i >= 0; i -= 1) {
      const pending = this.pendingAttacks[i]!;
      if (now < pending.hitAt) continue;
      this.pendingAttacks.splice(i, 1);
      if (safe) continue;
      const monster = this.monsters.get(pending.attack.spawnId);
      const type = monster ? MONSTER_TYPES[monster.monsterId] : undefined;
      if (!monster || !type || monster.state === 'dead' || !monster.group.visible) continue;
      const dist = Math.hypot(monster.target.x - playerPos.x, monster.target.z - playerPos.z);
      if (dist <= type.attackRange + 0.6) {
        hits.push({
          damage: pending.attack.damage,
          sourceX: monster.target.x,
          sourceZ: monster.target.z,
          attackId: pending.attack.attackId,
        });
      }
    }
    return hits;
  }

  /** Consume due action hit frames; a state snapshot alone never deals damage. */
  collectPlayerDamage(playerPos: THREE.Vector3): number {
    return this.collectPlayerHits(playerPos).reduce((total, hit) => total + hit.damage, 0);
  }

  update(dt: number): void {
    const factor = 1 - Math.exp(-LERP_PER_SECOND * dt);
    const now = this.now();
    for (const monster of this.monsters.values()) {
      if (!monster.group.visible) continue;
      monster.renderTarget.copy(monster.target);
      if (isMovingState(monster.state)) {
        const extrapolation = Math.min(
          MAX_EXTRAPOLATION_MS,
          Math.max(0, now - monster.lastTargetAt),
        ) / 1_000;
        monster.renderTarget.x += monster.velocity.x * extrapolation;
        monster.renderTarget.z += monster.velocity.z * extrapolation;
        monster.renderTarget.y = this.heightAt(monster.renderTarget.x, monster.renderTarget.z);
      }
      monster.group.position.lerp(monster.renderTarget, factor);
      const current = monster.group.rotation.y;
      let delta = monster.targetHeading - current;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      monster.group.rotation.y = current + delta * factor;
      monster.visual.updateVisual(dt);
    }
  }

  dispose(): void {
    for (const spawnId of [...this.monsters.keys()]) this.remove(spawnId);
    this.pendingSnapshots.clear();
    this.resetSession();
  }
}
