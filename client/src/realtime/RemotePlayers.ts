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
import type { RealtimeKnockback } from '@pirate-fruit/shared';
import { createPiratePlayerVisual } from '../art/PiratePlayerVisual';
import { PlayerActionAnimator } from '../animation/PlayerActionAnimator';
import type { GraphicsTier } from '../engine/GraphicsQuality';

const LERP_PER_SECOND = 9; // ความเร็วไถลเข้าหาเป้า (สูง = ตามติดขึ้น)
const STALE_MS = 20_000; // ไม่ได้ยิน presence เกินนี้ = ถือว่าหลุด เอาออก

type RemoteLod = 'full' | 'low' | 'hidden';
interface RemoteRenderOptions {
  focus?: () => THREE.Vector3;
  tier?: GraphicsTier;
}

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
  lod: RemoteLod;
  snapshot: RealtimePresenceSnapshot;
  /** Presentation-only recoil layered over interpolated Server presence. */
  hitOffset: THREE.Vector3;
  /** Last hit impulse, held until a newer presence frame confirms the movement. */
  hitOrigin: THREE.Vector3;
  hitDirection: THREE.Vector3;
  hitDistance: number;
  hitUntil: number;
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

/** Three-mesh silhouette for mid-distance players; same Pirate V1 palette, no rig cost. */
function makeLowPlayerBody(snapshot: RealtimePresenceSnapshot): { group: THREE.Group; animator: null } {
  const group = new THREE.Group();
  group.name = `remote-player-low:${snapshot.appearance?.avatarId ?? 'pirate-v1'}`;
  const cloth = new THREE.MeshStandardMaterial({ color: 0x17364b, roughness: 0.84 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xb97950, roughness: 0.6 });
  const accent = new THREE.MeshStandardMaterial({ color: 0x7d2632, roughness: 0.86 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.85, 3, 7), cloth);
  body.position.y = 1.08;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), skin);
  head.position.y = 1.95;
  const bandana = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.26, 0.12, 8), accent);
  bandana.position.y = 2.12;
  group.add(body, head, bandana);
  return { group, animator: null };
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

function buildAvatar(snapshot: RealtimePresenceSnapshot, lod: RemoteLod): { group: THREE.Group; animator: PlayerActionAnimator | null } {
  const avatar = snapshot.onBoat
    ? { group: makeBoatProxy(snapshot.boatId), animator: null }
    : lod === 'full' ? makePlayerBody(snapshot) : makeLowPlayerBody(snapshot);
  const { group } = avatar;
  if (lod !== 'hidden') group.add(makeNameSprite(snapshot.name || 'นักผจญภัย'));
  return avatar;
}

export class RemotePlayers implements Updatable {
  private readonly players = new Map<string, RemotePlayer>();
  private currentIslandId: string;
  private receivedPresence = 0;
  private acceptedPresence = 0;
  private ignoredIslandPresence = 0;
  private lastPresence: { playerId: string; islandId: string; accepted: boolean } | null = null;

  constructor(
    private readonly scene: THREE.Scene,
    islandId: string,
    private readonly now: () => number = () => Date.now(),
    private readonly renderOptions: RemoteRenderOptions = {},
  ) {
    this.currentIslandId = islandId;
  }

  get count(): number {
    return this.players.size;
  }

  /** Read-only runtime counters for production multiplayer diagnosis. */
  get diagnostics(): {
    currentIslandId: string;
    receivedPresence: number;
    acceptedPresence: number;
    ignoredIslandPresence: number;
    renderedPlayers: number;
    lod: Record<RemoteLod, number>;
    lastPresence: { playerId: string; islandId: string; accepted: boolean } | null;
  } {
    const lod: Record<RemoteLod, number> = { full: 0, low: 0, hidden: 0 };
    for (const player of this.players.values()) lod[player.lod] += 1;
    return {
      currentIslandId: this.currentIslandId,
      receivedPresence: this.receivedPresence,
      acceptedPresence: this.acceptedPresence,
      ignoredIslandPresence: this.ignoredIslandPresence,
      renderedPlayers: this.players.size,
      lod,
      lastPresence: this.lastPresence ? { ...this.lastPresence } : null,
    };
  }

  /** ผู้เล่นเราย้ายเกาะ → ล้างผีทั้งหมด (Server จะ seed ชุดใหม่ของเกาะใหม่เอง) */
  setIsland(islandId: string): void {
    if (islandId === this.currentIslandId) return;
    this.currentIslandId = islandId;
    for (const playerId of [...this.players.keys()]) this.remove(playerId);
  }

  applyPresence(snapshot: RealtimePresenceSnapshot): void {
    this.receivedPresence += 1;
    if (snapshot.islandId !== this.currentIslandId) {
      this.ignoredIslandPresence += 1;
      this.lastPresence = { playerId: snapshot.playerId, islandId: snapshot.islandId, accepted: false };
      // A delayed frame from the previous island must not delete a newer visible avatar.
      // Explicit presence-leave and setIsland remain the only removal paths.
      return;
    }
    this.acceptedPresence += 1;
    this.lastPresence = { playerId: snapshot.playerId, islandId: snapshot.islandId, accepted: true };
    const kind = avatarKindOf(snapshot);
    let player = this.players.get(snapshot.playerId);
    if (!player) {
      const lod = this.initialLod(snapshot);
      const avatar = buildAvatar(snapshot, lod);
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
        lod,
        snapshot,
        hitOffset: new THREE.Vector3(),
        hitOrigin: new THREE.Vector3(snapshot.x, snapshot.y, snapshot.z),
        hitDirection: new THREE.Vector3(),
        hitDistance: 0,
        hitUntil: 0,
      });
      return;
    }
    // S14: ผู้เล่นขึ้น/ลงเรือ หรือเปลี่ยนรุ่นเรือ → สร้าง avatar ใหม่ที่ตำแหน่งเดิม
    if (kind !== player.avatarKind) {
      const position = player.group.position.clone();
      const rotationY = player.group.rotation.y;
      this.disposeGroup(player.group);
      const nextLod = this.initialLod(snapshot);
      const avatar = buildAvatar(snapshot, nextLod);
      const { group } = avatar;
      group.position.copy(position);
      group.rotation.y = rotationY;
      this.scene.add(group);
      player.group = group;
      player.avatarKind = kind;
      player.animator = avatar.animator;
      player.lod = nextLod;
    }
    // Presence frames already in flight can describe the pre-hit position. Keep
    // the recoil visible until a later frame has actually moved in the impulse
    // direction; otherwise the ghost only twitches and immediately snaps back.
    if (player.hitDistance > 0 && this.now() < player.hitUntil) {
      const progress = (snapshot.x - player.hitOrigin.x) * player.hitDirection.x
        + (snapshot.z - player.hitOrigin.z) * player.hitDirection.z;
      if (progress >= player.hitDistance * 0.45) {
        player.hitOffset.set(0, 0, 0);
        player.hitDistance = 0;
      }
    } else if (player.hitDistance > 0) {
      player.hitOffset.set(0, 0, 0);
      player.hitDistance = 0;
    }
    player.target.set(snapshot.x, snapshot.y, snapshot.z);
    player.targetHeading = snapshot.heading;
    player.onBoat = snapshot.onBoat;
    player.locomotion = snapshot.locomotion ?? 'idle';
    player.animation = snapshot.animation ?? player.animation;
    player.snapshot = snapshot;
    player.lastSeenAt = this.now();
  }

  /** Apply a Server-confirmed hit impulse without mutating authoritative presence. */
  applyCombatHit(playerId: string, knockback?: RealtimeKnockback): void {
    const player = this.players.get(playerId);
    if (!player) return;
    const directionX = Number(knockback?.directionX ?? 0);
    const directionZ = Number(knockback?.directionZ ?? -1);
    const length = Math.hypot(directionX, directionZ) || 1;
    const speed = Math.max(0, Number(knockback?.speed ?? 4));
    const duration = Math.max(0.05, Number(knockback?.duration ?? 0.16));
    // Keep remote recoil visible for the full impulse instead of capping normal
    // melee hits to the old sub-meter presentation distance.
    const distance = THREE.MathUtils.clamp(speed * duration, 0.25, 5.5);
    const normalizedX = directionX / length;
    const normalizedZ = directionZ / length;
    player.hitOrigin.copy(player.target);
    player.hitDirection.set(normalizedX, 0, normalizedZ);
    player.hitDistance = distance;
    player.hitUntil = this.now() + 1_200;
    player.hitOffset.set(normalizedX * distance, 0, normalizedZ * distance);
    player.animation = {
      ...player.animation,
      combatState: knockback ? 'knockback' : 'stunned',
    };
  }

  private limits(): { full: number; visible: number; boat: number; maxFull: number } {
    if (this.renderOptions.tier === 'low') return { full: 24, visible: 65, boat: 120, maxFull: 2 };
    if (this.renderOptions.tier === 'medium') return { full: 38, visible: 90, boat: 170, maxFull: 4 };
    return { full: 55, visible: 130, boat: 230, maxFull: 8 };
  }

  private distanceSq(player: Pick<RemotePlayer, 'target'> | RealtimePresenceSnapshot): number {
    const focus = this.renderOptions.focus?.();
    if (!focus) return 0;
    const x = 'target' in player ? player.target.x : player.x;
    const y = 'target' in player ? player.target.y : player.y;
    const z = 'target' in player ? player.target.z : player.z;
    const dx = focus.x - x;
    const dy = focus.y - y;
    const dz = focus.z - z;
    return dx * dx + dy * dy + dz * dz;
  }

  private initialLod(snapshot: RealtimePresenceSnapshot): RemoteLod {
    const limits = this.limits();
    const distance = Math.sqrt(this.distanceSq(snapshot));
    if (snapshot.onBoat) return distance <= limits.boat ? 'low' : 'hidden';
    if (distance <= limits.full) return 'full';
    return distance <= limits.visible ? 'low' : 'hidden';
  }

  private setLod(player: RemotePlayer, lod: RemoteLod): void {
    if (lod === player.lod) {
      player.group.visible = !player.defeated && lod !== 'hidden';
      return;
    }
    const position = player.group.position.clone();
    const rotationY = player.group.rotation.y;
    this.disposeGroup(player.group);
    const avatar = buildAvatar(player.snapshot, lod);
    avatar.group.position.copy(position);
    avatar.group.rotation.y = rotationY;
    avatar.group.visible = !player.defeated && lod !== 'hidden';
    this.scene.add(avatar.group);
    player.group = avatar.group;
    player.animator = avatar.animator;
    player.lod = lod;
  }

  /** ชนิด avatar ปัจจุบันของผู้เล่น ('foot' | `boat:<id>`) — ใช้ในเทสต์ */
  avatarKindFor(playerId: string): string | null {
    return this.players.get(playerId)?.avatarKind ?? null;
  }

  /** Presentation diagnostics/tests only. */
  lodFor(playerId: string): RemoteLod | null {
    return this.players.get(playerId)?.lod ?? null;
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
    const limits = this.limits();
    const fullCandidates = [...this.players.entries()]
      .filter(([, player]) => {
        const threshold = player.lod === 'full' ? limits.full * 1.15 : limits.full;
        return !player.onBoat && Math.sqrt(this.distanceSq(player)) <= threshold;
      })
      .sort((a, b) => this.distanceSq(a[1]) - this.distanceSq(b[1]))
      .slice(0, limits.maxFull)
      .map(([playerId]) => playerId);
    const fullIds = new Set(fullCandidates);
    for (const [playerId, player] of [...this.players]) {
      if (player.lastSeenAt < cutoff) {
        this.remove(playerId);
        continue;
      }
      const distance = Math.sqrt(this.distanceSq(player));
      const visibleLimit = player.lod === 'hidden' ? limits.visible * 0.9 : limits.visible * 1.1;
      const boatLimit = player.lod === 'hidden' ? limits.boat * 0.9 : limits.boat * 1.1;
      const desiredLod: RemoteLod = player.onBoat
        ? distance <= boatLimit ? 'low' : 'hidden'
        : fullIds.has(playerId) ? 'full' : distance <= visibleLimit ? 'low' : 'hidden';
      this.setLod(player, desiredLod);
      player.group.position.lerp(player.target, factor);
      player.hitOffset.multiplyScalar(Math.exp(-2 * Math.min(dt, 0.05)));
      if (player.hitOffset.lengthSq() < 1e-5) player.hitOffset.set(0, 0, 0);
      player.group.position.add(player.hitOffset);
      // หมุนตัวเข้าหา heading เป้าหมายแบบสั้นสุด (กันหมุนรอบเกิน)
      const current = player.group.rotation.y;
      let delta = player.targetHeading - current;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      player.group.rotation.y = current + delta * factor;
      if (player.lod === 'full') player.animator?.update(dt, {
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
    player.group.visible = player.lod !== 'hidden';
    player.lastSeenAt = this.now();
  }

  dispose(): void {
    for (const playerId of [...this.players.keys()]) this.remove(playerId);
  }
}
