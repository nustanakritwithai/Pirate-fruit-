/**
 * S13 — Multiplayer Movement (ฝั่งภาพ)
 * รับ presence ของผู้เล่นคนอื่นจาก RealtimeClient แล้วเรนเดอร์เป็น "ผี" (ghost)
 * ที่ไถลเข้าหาตำแหน่งล่าสุดแบบนุ่ม (interpolate) เพื่อกลบ jitter ของเน็ต
 * - presence เป็นข้อมูลแสดงผลล้วน: ไม่มีผล gameplay/collision (เฟสนี้เดินทะลุกันได้)
 * - ผู้เล่นบนเกาะอื่นถูก Server กรองออกแล้ว; ที่นี่ยังกรองซ้ำตามเกาะปัจจุบันด้วย
 */

import * as THREE from 'three';
import type { Updatable } from '../engine/Game';
import type { RealtimePresenceSnapshot } from './RealtimeClient';

const LERP_PER_SECOND = 9; // ความเร็วไถลเข้าหาเป้า (สูง = ตามติดขึ้น)
const STALE_MS = 20_000; // ไม่ได้ยิน presence เกินนี้ = ถือว่าหลุด เอาออก

interface RemotePlayer {
  group: THREE.Group;
  target: THREE.Vector3;
  targetHeading: number;
  islandId: string;
  onBoat: boolean;
  lastSeenAt: number;
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

/** ตัวละครผี low-poly (แยกสีจากผู้เล่นเรา — โทนฟ้าโปร่งแสง) */
function makeGhostBody(): THREE.Group {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({
    color: 0x5aa9e6,
    transparent: true,
    opacity: 0.82,
    roughness: 0.6,
    emissive: 0x14364f,
    emissiveIntensity: 0.4,
  });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.9, 4, 10), material);
  torso.position.y = 1.15;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 12), material);
  head.position.y = 2.0;
  group.add(torso, head);
  return group;
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
    let player = this.players.get(snapshot.playerId);
    if (!player) {
      const group = makeGhostBody();
      group.add(makeNameSprite(snapshot.name || 'นักผจญภัย'));
      group.position.set(snapshot.x, snapshot.y, snapshot.z);
      this.scene.add(group);
      player = {
        group,
        target: new THREE.Vector3(snapshot.x, snapshot.y, snapshot.z),
        targetHeading: snapshot.heading,
        islandId: snapshot.islandId,
        onBoat: snapshot.onBoat,
        lastSeenAt: this.now(),
      };
      this.players.set(snapshot.playerId, player);
      return;
    }
    player.target.set(snapshot.x, snapshot.y, snapshot.z);
    player.targetHeading = snapshot.heading;
    player.onBoat = snapshot.onBoat;
    player.lastSeenAt = this.now();
  }

  remove(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player) return;
    this.scene.remove(player.group);
    player.group.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        (object.material as THREE.Material).dispose();
      } else if (object instanceof THREE.Sprite) {
        object.material.map?.dispose();
        object.material.dispose();
      }
    });
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
    }
  }

  dispose(): void {
    for (const playerId of [...this.players.keys()]) this.remove(playerId);
  }
}
