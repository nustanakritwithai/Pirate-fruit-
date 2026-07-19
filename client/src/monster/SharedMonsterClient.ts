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
import type { WorldMonsterSnapshot, WorldMonsterDelta, WorldMonsterState } from '@pirate-fruit/shared';

const LERP_PER_SECOND = 8;

interface SharedMonster {
  visual: Monster;
  group: THREE.Group;
  target: THREE.Vector3;
  targetHeading: number;
  hp: number;
  maxHp: number;
  state: WorldMonsterState;
  monsterId: string;
  attackReadyAt: number;
}

function renderState(state: WorldMonsterState): MonsterState {
  if (state === 'dead') return 'dead';
  if (state === 'attack') return 'attack';
  if (state === 'chase' || state === 'aggro') return 'chase';
  if (state === 'return' || state === 'patrol') return 'return';
  return 'idle';
}

export interface SharedMonsterDamageResolution {
  hp: number;
  taken: number;
  defeated: boolean;
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
  private currentIslandId: string;

  constructor(
    private readonly scene: THREE.Scene,
    islandId: string,
    private readonly heightAt: (x: number, z: number) => number = () => 0,
    private readonly now: () => number = () => Date.now(),
  ) {
    this.currentIslandId = islandId;
  }

  get count(): number {
    return this.monsters.size;
  }

  /** Read-only presentation hook for spatial audio/effects; never exposes a mutable group. */
  positionOf(spawnId: string): { x: number; y: number; z: number } | undefined {
    const position = this.monsters.get(spawnId)?.group.position;
    return position ? { x: position.x, y: position.y, z: position.z } : undefined;
  }

  /** ผู้เล่นเราย้ายเกาะ → ล้างมอนสเตอร์เกาะเก่า (Server จะ seed snapshot เกาะใหม่) */
  setIsland(islandId: string): void {
    if (islandId === this.currentIslandId) return;
    this.currentIslandId = islandId;
    for (const spawnId of [...this.monsters.keys()]) this.remove(spawnId);
  }

  /** full snapshot — แทนที่ทั้งเกาะ (join/resync) */
  applySnapshot(islandId: string, monsters: readonly WorldMonsterSnapshot[]): void {
    if (islandId !== this.currentIslandId) return;
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
      const monster = this.monsters.get(update.spawnId);
      if (!monster) continue;
      if (update.state !== 'dead' && !monster.group.visible) {
        monster.group.visible = true;
      }
      monster.target.set(update.x, this.heightAt(update.x, update.z), update.z);
      monster.targetHeading = update.heading;
      const wasHit = update.hp < monster.hp && update.state !== 'dead';
      monster.hp = update.hp;
      monster.state = update.state;
      monster.visual.applyAuthoritativeState(update.hp, monster.maxHp, renderState(update.state));
      if (wasHit) monster.visual.playHitReaction();
    }
  }

  markDead(spawnId: string): void {
    const monster = this.monsters.get(spawnId);
    if (!monster) return;
    monster.state = 'dead';
    monster.hp = 0;
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
        targetHeading: snapshot.heading,
        hp: snapshot.hp,
        maxHp: snapshot.maxHp,
        state: snapshot.state,
        monsterId: snapshot.monsterId,
        attackReadyAt: 0,
      };
      this.monsters.set(snapshot.spawnId, monster);
      return;
    }
    monster.target.set(snapshot.x, this.heightAt(snapshot.x, snapshot.z), snapshot.z);
    monster.targetHeading = snapshot.heading;
    monster.hp = snapshot.hp;
    monster.maxHp = snapshot.maxHp;
    monster.state = snapshot.state;
    monster.visual.applyAuthoritativeState(snapshot.hp, snapshot.maxHp, renderState(snapshot.state));
  }

  private remove(spawnId: string): void {
    const monster = this.monsters.get(spawnId);
    if (!monster) return;
    this.scene.remove(monster.group);
    monster.visual.dispose();
    this.monsters.delete(spawnId);
  }

  /** spawnId ของมอนสเตอร์ (มีชีวิต) ที่อยู่ในกรวยโจมตีหน้าเรา — ส่งเจตนาตีให้ Server */
  targetsInCone(
    origin: THREE.Vector3,
    forwardX: number,
    forwardZ: number,
    range: number,
    halfAngle: number,
  ): string[] {
    const flen = Math.hypot(forwardX, forwardZ) || 1;
    const fx = forwardX / flen;
    const fz = forwardZ / flen;
    const cosHalf = Math.cos(halfAngle);
    const hits: string[] = [];
    for (const [spawnId, monster] of this.monsters) {
      if (monster.state === 'dead' || monster.hp <= 0) continue;
      const dx = monster.group.position.x - origin.x;
      const dz = monster.group.position.z - origin.z;
      const dist = Math.hypot(dx, dz);
      if (dist > range || dist < 1e-3) continue;
      if ((dx / dist) * fx + (dz / dist) * fz < cosHalf) continue;
      hits.push(spawnId);
    }
    return hits;
  }

  /**
   * มอนสเตอร์ที่กำลัง 'attack' และอยู่ในระยะประชิดผู้เล่น → คืนดาเมจที่ควรกินผู้เล่น
   * (player HP ยังเป็น client-side ในเฟสนี้ — Server เป็นเจ้าของแค่ตัวมอนสเตอร์)
   */
  collectPlayerDamage(playerPos: THREE.Vector3): number {
    const now = this.now();
    let total = 0;
    for (const monster of this.monsters.values()) {
      if (monster.state !== 'attack' || !monster.group.visible) continue;
      const type = MONSTER_TYPES[monster.monsterId];
      if (!type) continue;
      const dist = Math.hypot(monster.group.position.x - playerPos.x, monster.group.position.z - playerPos.z);
      if (dist > type.attackRange + 0.6) continue;
      if (now < monster.attackReadyAt) continue;
      monster.attackReadyAt = now + type.attackCooldown * 1000;
      total += type.damage;
    }
    return total;
  }

  update(dt: number): void {
    const factor = 1 - Math.exp(-LERP_PER_SECOND * dt);
    for (const monster of this.monsters.values()) {
      if (!monster.group.visible) continue;
      monster.group.position.lerp(monster.target, factor);
      const current = monster.group.rotation.y;
      let delta = monster.targetHeading - current;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      monster.group.rotation.y = current + delta * factor;
      monster.visual.updateVisual(dt);
    }
  }

  dispose(): void {
    for (const spawnId of [...this.monsters.keys()]) this.remove(spawnId);
  }
}
