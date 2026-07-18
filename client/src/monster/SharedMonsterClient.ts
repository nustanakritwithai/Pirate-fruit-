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
import type { WorldMonsterSnapshot, WorldMonsterDelta, WorldMonsterState } from '@pirate-fruit/shared';

const LERP_PER_SECOND = 8;

interface SharedMonster {
  group: THREE.Group;
  target: THREE.Vector3;
  targetHeading: number;
  hp: number;
  maxHp: number;
  state: WorldMonsterState;
  monsterId: string;
  attackReadyAt: number;
}

function makeBody(monsterId: string): THREE.Group {
  const group = new THREE.Group();
  const type = MONSTER_TYPES[monsterId];
  const color = type?.color ?? 0xcf5a38;
  const scale = type?.scale ?? 1;
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.75, emissive: 0x120a05, emissiveIntensity: 0.25 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.5 * scale, 0.9 * scale, 4, 10), material);
  body.position.y = 0.9 * scale;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.34 * scale, 12, 10), material);
  head.position.y = 1.7 * scale;
  group.add(body, head);
  group.userData.material = material;
  return group;
}

export class SharedMonsterClient implements Updatable {
  private readonly monsters = new Map<string, SharedMonster>();
  private currentIslandId: string;

  constructor(
    private readonly scene: THREE.Scene,
    islandId: string,
    private readonly now: () => number = () => Date.now(),
  ) {
    this.currentIslandId = islandId;
  }

  get count(): number {
    return this.monsters.size;
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
      if (update.state === 'dead') {
        monster.group.visible = false;
      } else if (!monster.group.visible) {
        monster.group.visible = true;
      }
      monster.target.set(update.x, monster.target.y, update.z);
      monster.targetHeading = update.heading;
      monster.hp = update.hp;
      monster.state = update.state;
    }
  }

  markDead(spawnId: string): void {
    const monster = this.monsters.get(spawnId);
    if (!monster) return;
    monster.state = 'dead';
    monster.hp = 0;
    monster.group.visible = false;
  }

  applyRespawn(snapshot: WorldMonsterSnapshot): void {
    if (snapshot.islandId !== this.currentIslandId) return;
    this.upsert(snapshot);
    const monster = this.monsters.get(snapshot.spawnId);
    if (monster) monster.group.visible = true;
  }

  private upsert(snapshot: WorldMonsterSnapshot): void {
    let monster = this.monsters.get(snapshot.spawnId);
    if (!monster) {
      const group = makeBody(snapshot.monsterId);
      group.position.set(snapshot.x, 0, snapshot.z);
      group.rotation.y = snapshot.heading;
      group.visible = snapshot.state !== 'dead';
      this.scene.add(group);
      monster = {
        group,
        target: new THREE.Vector3(snapshot.x, 0, snapshot.z),
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
    monster.target.set(snapshot.x, monster.target.y, snapshot.z);
    monster.targetHeading = snapshot.heading;
    monster.hp = snapshot.hp;
    monster.maxHp = snapshot.maxHp;
    monster.state = snapshot.state;
    monster.group.visible = snapshot.state !== 'dead';
  }

  private remove(spawnId: string): void {
    const monster = this.monsters.get(spawnId);
    if (!monster) return;
    this.scene.remove(monster.group);
    monster.group.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        (object.material as THREE.Material).dispose();
      }
    });
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
    }
  }

  dispose(): void {
    for (const spawnId of [...this.monsters.keys()]) this.remove(spawnId);
  }
}
