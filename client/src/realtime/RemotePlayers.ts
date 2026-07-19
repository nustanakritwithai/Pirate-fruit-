/**
 * S13/S14 — Multiplayer Movement + Naval (ฝั่งภาพ)
 * รับ presence ของผู้เล่นคนอื่นจาก RealtimeClient แล้วเรนเดอร์:
 * - เดินเท้า → Pirate V1 แบบเดียวกับผู้เล่นปัจจุบัน
 * - S14 ขับเรือ → เรือ proxy ขนาด/สีตามรุ่น (BOAT_DEFINITIONS)
 * ไถลเข้าหาตำแหน่งล่าสุดแบบนุ่ม (interpolate) เพื่อกลบ jitter ของเน็ต
 * - presence เป็นข้อมูลแสดงผลล้วน: ไม่มีผล gameplay/collision (เฟสนี้ทะลุกันได้)
 * - ผู้เล่นบนเกาะอื่นถูก Server กรองออกแล้ว; ที่นี่ยังกรองซ้ำตามเกาะปัจจุบันด้วย
 */

import * as THREE from 'three';
import type { Updatable } from '../engine/Game';
import { BOAT_DEFINITIONS } from '../boat/BoatData';
import type { RealtimePresenceSnapshot } from './RealtimeClient';
import { createPiratePlayerVisual } from '../art/PiratePlayerVisual';
import { PlayerActionAnimator } from '../animation/PlayerActionAnimator';

const LERP_PER_SECOND = 9; // ความเร็วไถลเข้าหาเป้า (สูง = ตามติดขึ้น)
const STALE_MS = 20_000; // ไม่ได้ยิน presence เกินนี้ = ถือว่าหลุด เอาออก

const BOAT_BY_ID = new Map(BOAT_DEFINITIONS.map((definition) => [definition.id, definition]));

/** ชนิด avatar ปัจจุบัน — เปลี่ยนเมื่อผู้เล่นขึ้น/ลงเรือ (หรือเปลี่ยนรุ่นเรือ) */
type AvatarKind = string; // 'foot' | `boat:${boatId}`

interface RemotePlayer {
  group: THREE.Group;
  target: THREE.Vector3;
  targetHeading: number;
  islandId: string;
  onBoat: boolean;
  name: string;
  avatarKind: AvatarKind;
  lastSeenAt: number;
  /** S15: แพ้ (ถูกซ่อนจนกว่าจะเกิดใหม่) */
  defeated: boolean;
  animator: PlayerActionAnimator | null;
  locomotion: 'idle' | 'walk' | 'run' | 'swim';
  animation: NonNullable<RealtimePresenceSnapshot['animation']>;
}

function defaultAnimation(): NonNullable<RealtimePresenceSnapshot['animation']> {
  return { combatState: 'idle', category: 'style', onGround: true, dashing: false, verticalVelocity: 0 };
}

function makeNameSprite(name: string): THREE.Sprite {
  // headless (เทสต์) ไม่มี document — คืน sprite เปล่า ๆ ให้ logic ทำงานต่อได้
  if (typeof document === 'undefined') {
    return new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
  }
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = 'rgba(5,18,26,.72)';
    ctx.beginPath();
    ctx.roundRect(8, 8, 368, 80, 26);
    ctx.fill();
    ctx.strokeStyle = 'rgba(126,203,255,.7)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.font = '700 34px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#d6ecff';
    ctx.fillText(name.slice(0, 16), 192, 49);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(3.6, 0.9, 1);
  sprite.position.y = 3.4;
  return sprite;
}

/** Current canonical on-foot visual; appearance fields are ready for future variants. */
function makePlayerBody(snapshot: RealtimePresenceSnapshot): { group: THREE.Group; animator: PlayerActionAnimator } {
  const visual = createPiratePlayerVisual();
  visual.group.name = `remote-player:${snapshot.appearance?.avatarId ?? 'pirate-v1'}`;
  return { group: visual.group, animator: new PlayerActionAnimator(visual.rig) };
}

/** S14: เรือ proxy แบบเบา (ตัวเรือ + ใบเรือ) ขนาด/สีตามรุ่น — ไม่ใช้ BoatModel เต็ม */
function makeBoatProxy(boatId: string | undefined): THREE.Group {
  const group = new THREE.Group();
  const definition = boatId ? BOAT_BY_ID.get(boatId) : undefined;
  const length = definition?.length ?? 6;
  const width = definition?.width ?? 2.2;
  const color = definition?.color ?? 0x8a5a2b;
  const hullMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.05 });
  const hull = new THREE.Mesh(new THREE.BoxGeometry(width, 0.9, length), hullMaterial);
  hull.position.y = 0.45;
  group.add(hull);
  if (definition?.hasSail !== false) {
    const mastMaterial = new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.8 });
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, length * 0.7, 8), mastMaterial);
    mast.position.y = length * 0.35 + 0.9;
    group.add(mast);
    const sailMaterial = new THREE.MeshStandardMaterial({
      color: 0xf3ead2, roughness: 0.9, side: THREE.DoubleSide,
    });
    const sail = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.8, length * 0.5), sailMaterial);
    sail.position.set(0, length * 0.3 + 0.9, 0);
    group.add(sail);
  }
  return group;
}

function avatarKindOf(snapshot: RealtimePresenceSnapshot): AvatarKind {
  return snapshot.onBoat ? `boat:${snapshot.boatId ?? 'default'}` : 'foot';
}

function buildAvatar(snapshot: RealtimePresenceSnapshot): { group: THREE.Group; animator: PlayerActionAnimator | null } {
  const avatar = snapshot.onBoat
    ? { group: makeBoatProxy(snapshot.boatId), animator: null }
    : makePlayerBody(snapshot);
  const { group } = avatar;
  group.add(makeNameSprite(snapshot.name || 'นักผจญภัย'));
  return avatar;
}

export class RemotePlayers implements Updatable {
  private readonly players = new Map<string, RemotePlayer>();
  private currentIslandId: string;

  constructor(
    private readonly scene: THREE.Scene,
    islandId: string,
    private readonly now: () => number = () => Date.now(),
  ) {
    this.currentIslandId = islandId;
  }

  get count(): number {
    return this.players.size;
  }

  /** ผู้เล่นเราย้ายเกาะ → ล้างผีทั้งหมด (Server จะ seed ชุดใหม่ของเกาะใหม่เอง) */
  setIsland(islandId: string): void {
    if (islandId === this.currentIslandId) return;
    this.currentIslandId = islandId;
    for (const playerId of [...this.players.keys()]) this.remove(playerId);
  }

  applyPresence(snapshot: RealtimePresenceSnapshot): void {
    if (snapshot.islandId !== this.currentIslandId) {
      this.remove(snapshot.playerId);
      return;
    }
    const kind = avatarKindOf(snapshot);
    let player = this.players.get(snapshot.playerId);
    if (!player) {
      const avatar = buildAvatar(snapshot);
      const { group } = avatar;
      group.position.set(snapshot.x, snapshot.y, snapshot.z);
      group.rotation.y = snapshot.heading;
      this.scene.add(group);
      this.players.set(snapshot.playerId, {
        group,
        target: new THREE.Vector3(snapshot.x, snapshot.y, snapshot.z),
        targetHeading: snapshot.heading,
        islandId: snapshot.islandId,
        onBoat: snapshot.onBoat,
        name: snapshot.name,
        avatarKind: kind,
        lastSeenAt: this.now(),
        defeated: false,
        animator: avatar.animator,
        locomotion: snapshot.locomotion ?? 'idle',
        animation: snapshot.animation ?? defaultAnimation(),
      });
      return;
    }
    // S14: ผู้เล่นขึ้น/ลงเรือ หรือเปลี่ยนรุ่นเรือ → สร้าง avatar ใหม่ที่ตำแหน่งเดิม
    if (kind !== player.avatarKind) {
      const position = player.group.position.clone();
      const rotationY = player.group.rotation.y;
      this.disposeGroup(player.group);
      const avatar = buildAvatar(snapshot);
      const { group } = avatar;
      group.position.copy(position);
      group.rotation.y = rotationY;
      this.scene.add(group);
      player.group = group;
      player.avatarKind = kind;
      player.animator = avatar.animator;
    }
    player.target.set(snapshot.x, snapshot.y, snapshot.z);
    player.targetHeading = snapshot.heading;
    player.onBoat = snapshot.onBoat;
    player.locomotion = snapshot.locomotion ?? 'idle';
    player.animation = snapshot.animation ?? player.animation;
    player.lastSeenAt = this.now();
  }

  /** ชนิด avatar ปัจจุบันของผู้เล่น ('foot' | `boat:<id>`) — ใช้ในเทสต์ */
  avatarKindFor(playerId: string): string | null {
    return this.players.get(playerId)?.avatarKind ?? null;
  }

  private disposeGroup(group: THREE.Group): void {
    this.scene.remove(group);
    group.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        (object.material as THREE.Material).dispose();
      } else if (object instanceof THREE.Sprite) {
        object.material.map?.dispose();
        object.material.dispose();
      }
    });
  }

  remove(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player) return;
    this.disposeGroup(player.group);
    this.players.delete(playerId);
  }

  update(dt: number): void {
    const factor = 1 - Math.exp(-LERP_PER_SECOND * dt); // frame-rate independent lerp
    const cutoff = this.now() - STALE_MS;
    for (const [playerId, player] of [...this.players]) {
      if (player.lastSeenAt < cutoff) {
        this.remove(playerId);
        continue;
      }
      player.group.position.lerp(player.target, factor);
      // หมุนตัวเข้าหา heading เป้าหมายแบบสั้นสุด (กันหมุนรอบเกิน)
      const current = player.group.rotation.y;
      let delta = player.targetHeading - current;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      player.group.rotation.y = current + delta * factor;
      player.animator?.update(dt, {
        ...player.animation,
        locomotion: player.locomotion,
      });
    }
  }

  /** S15: ตำแหน่งปัจจุบันของผู้เล่นคนอื่น (สำหรับเด้งเลขดาเมจ) — null ถ้าไม่รู้จัก */
  positionOf(playerId: string): THREE.Vector3 | null {
    return this.players.get(playerId)?.group.position.clone() ?? null;
  }

  /**
   * S15: ผู้เล่นคนอื่นที่อยู่ในกรวยโจมตีหน้าเรา (ไว้ส่งเจตนาโจมตีให้ Server ตัดสิน)
   * forward = เวกเตอร์หน้า (x,z) ของผู้เล่นเรา; range/halfAngle = ระยะ/ครึ่งมุมกรวย (เรเดียน)
   */
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
    for (const [playerId, player] of this.players) {
      if (player.defeated) continue;
      // Target selection must use the latest server-relayed presence, not the
      // interpolated render ghost which deliberately trails a moving player.
      const dx = player.target.x - origin.x;
      const dy = player.target.y - origin.y;
      const dz = player.target.z - origin.z;
      const dist = Math.hypot(dx, dz);
      const distance3d = Math.hypot(dx, dy, dz);
      if (distance3d > range || dist < 1e-3) continue;
      if ((dx / dist) * fx + (dz / dist) * fz < cosHalf) continue; // นอกมุมกรวย
      hits.push(playerId);
    }
    return hits.sort((a, b) => {
      const pa = this.players.get(a)!.target;
      const pb = this.players.get(b)!.target;
      return pa.distanceToSquared(origin) - pb.distanceToSquared(origin);
    });
  }

  /** Mobile fallback: nearest living player in true server-side 3D range. */
  nearestTargetInRange(origin: THREE.Vector3, range: number): string | null {
    let bestId: string | null = null;
    let bestDistanceSq = range * range;
    for (const [playerId, player] of this.players) {
      if (player.defeated) continue;
      const distanceSq = player.target.distanceToSquared(origin);
      if (distanceSq > bestDistanceSq) continue;
      bestDistanceSq = distanceSq;
      bestId = playerId;
    }
    return bestId;
  }

  latestPositionOf(playerId: string): THREE.Vector3 | null {
    return this.players.get(playerId)?.target.clone() ?? null;
  }

  /** S15: เป้าแพ้ → ซ่อนผีจนกว่าจะเกิดใหม่ (Server เป็นคนบอกเวลา) */
  markDefeated(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player) return;
    player.defeated = true;
    player.group.visible = false;
  }

  markRespawn(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player) return;
    player.defeated = false;
    player.group.visible = true;
    player.lastSeenAt = this.now();
  }

  dispose(): void {
    for (const playerId of [...this.players.keys()]) this.remove(playerId);
  }
}
