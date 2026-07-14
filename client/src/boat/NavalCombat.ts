/**
 * เรือ Phase 2 — Naval Combat: เรือโจรสลัด AI + ปืนใหญ่ + เอฟเฟกต์ทะเล
 * - เรือศัตรูลาดตระเวน → ไล่ล่า → วนยิง broadside เมื่อผู้เล่นออกเรือ
 * - ผู้เล่นยิงปืนใหญ่ได้ตอนถือพวงมาลัย (ปุ่มโจมตี/คลิกซ้าย)
 * - จมเรือโจรสลัด → เหรียญ + EXP แล้วเกิดใหม่ตามเวลา
 */

import * as THREE from 'three';
import type { Effects } from '../effects/Effects';
import type { GraphicsProfile } from '../engine/GraphicsQuality';
import type { Input } from '../engine/Input';
import { getWaveHeight, WATER_LEVEL } from '../ocean/Ocean';
import type { WorldTextures } from '../world/textures';
import { worldHeightAt } from '../island/IslandRegistry';
import type { BoatDefinition } from './BoatData';
import type { BoatManager } from './BoatManager';
import { createBoatModel } from './BoatModel';
import {
  aimCannonball,
  CANNONBALL_LIFETIME,
  decideShipState,
  PIRATE_CUTTER,
  PIRATE_SPAWNS,
  PLAYER_CANNON_DAMAGE,
  PLAYER_FIRE_COOLDOWN,
  SHIP_RESPAWN_SECONDS,
  steerToward,
  stepCannonball,
  type CannonballState,
  type EnemyShipDefinition,
  type ShipAIState,
} from './NavalData';

interface NavalRewardSink {
  addCoins(amount: number, source?: string): void;
  addPlayerExp(amount: number, source?: string): unknown;
}

interface EnemyShip {
  defn: EnemyShipDefinition;
  group: THREE.Group;
  hull: THREE.Mesh;
  bar: THREE.Sprite;
  barCanvas: HTMLCanvasElement;
  barTexture: THREE.CanvasTexture;
  spawn: { x: number; z: number };
  hp: number;
  state: ShipAIState;
  heading: number;
  speed: number;
  patrolAngle: number;
  fireTimer: number;
  /** > 0 = กำลังจม */
  sinkTimer: number;
  respawnTimer: number;
  alive: boolean;
}

interface Cannonball extends CannonballState {
  mesh: THREE.Mesh;
  fromPlayer: boolean;
  damage: number;
}

/** แปลงนิยามเรือศัตรู → BoatDefinition ขั้นต่ำสำหรับ createBoatModel */
function toModelDefinition(defn: EnemyShipDefinition): BoatDefinition {
  return {
    id: defn.id,
    name: defn.name,
    description: '',
    price: 0,
    maxSpeed: defn.chaseSpeed,
    acceleration: 4,
    reverseSpeed: 2,
    turnSpeed: defn.turnSpeed,
    brakePower: 6,
    drag: 0.6,
    maxHp: defn.maxHp,
    collisionRadius: defn.hitRadius,
    length: defn.length,
    width: defn.width,
    hasSail: true,
    color: defn.color,
    cannonsPerSide: 2,
  };
}

export class NavalCombat {
  private readonly ships: EnemyShip[] = [];
  private readonly balls: Cannonball[] = [];
  private readonly ballGeometry = new THREE.SphereGeometry(0.17, 8, 6);
  private readonly ballMaterial = new THREE.MeshStandardMaterial({ color: 0x22242a, roughness: 0.5 });
  private readonly tempVector = new THREE.Vector3();
  private elapsed = 0;
  private playerFireCooldown = 0;

  constructor(
    private scene: THREE.Scene,
    private input: Input,
    private boats: BoatManager,
    private effects: Effects,
    private rewards: NavalRewardSink,
    textures: WorldTextures,
    graphics: GraphicsProfile,
    private notify?: (message: string) => void,
  ) {
    for (const spawn of PIRATE_SPAWNS) {
      this.ships.push(this.spawnShip(PIRATE_CUTTER, spawn, textures, graphics));
    }
  }

  /** เรือศัตรูที่ยังลอยลำ (ให้ debug/เทสต์) */
  get aliveShips(): { x: number; z: number; hp: number; state: ShipAIState }[] {
    return this.ships
      .filter((ship) => ship.alive)
      .map((ship) => ({
        x: ship.group.position.x,
        z: ship.group.position.z,
        hp: ship.hp,
        state: ship.state,
      }));
  }

  private spawnShip(
    defn: EnemyShipDefinition,
    spawn: { x: number; z: number },
    textures: WorldTextures,
    graphics: GraphicsProfile,
  ): EnemyShip {
    const model = createBoatModel(toModelDefinition(defn), textures, graphics);
    model.root.position.set(spawn.x, WATER_LEVEL + 0.2, spawn.z);
    if (model.sail) model.sail.scale.y = 0.8;

    const barCanvas = document.createElement('canvas');
    barCanvas.width = 160;
    barCanvas.height = 36;
    const barTexture = new THREE.CanvasTexture(barCanvas);
    barTexture.colorSpace = THREE.SRGBColorSpace;
    const bar = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: barTexture, transparent: true, depthWrite: false }),
    );
    bar.scale.set(4.4, 0.99, 1);
    bar.position.y = 6.1;
    model.root.add(bar);

    const ship: EnemyShip = {
      defn,
      group: model.root,
      hull: model.hull,
      bar,
      barCanvas,
      barTexture,
      spawn,
      hp: defn.maxHp,
      state: 'patrol',
      heading: Math.random() * Math.PI * 2,
      speed: defn.cruiseSpeed,
      patrolAngle: Math.random() * Math.PI * 2,
      fireTimer: defn.fireCooldown,
      sinkTimer: 0,
      respawnTimer: 0,
      alive: true,
    };
    this.drawBar(ship);
    this.scene.add(model.root);
    return ship;
  }

  private drawBar(ship: EnemyShip): void {
    const ctx = ship.barCanvas.getContext('2d')!;
    ctx.clearRect(0, 0, 160, 36);
    ctx.font = '700 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd9d0';
    ctx.strokeStyle = 'rgba(0,0,0,.8)';
    ctx.lineWidth = 4;
    ctx.strokeText(`☠️ ${ship.defn.name} Lv.${ship.defn.level}`, 80, 14);
    ctx.fillText(`☠️ ${ship.defn.name} Lv.${ship.defn.level}`, 80, 14);
    ctx.fillStyle = 'rgba(0,0,0,.62)';
    ctx.fillRect(20, 22, 120, 9);
    ctx.fillStyle = '#ff5a45';
    ctx.fillRect(21, 23, 118 * Math.max(0, ship.hp / ship.defn.maxHp), 7);
    ship.barTexture.needsUpdate = true;
  }

  update(dt: number): void {
    this.elapsed += dt;
    this.playerFireCooldown = Math.max(0, this.playerFireCooldown - dt);

    const playerBoat = this.boats.activeBoat;
    const playerOnBoat =
      this.boats.riderState !== 'off' && !!playerBoat && playerBoat.state !== 'destroyed';

    for (const ship of this.ships) this.updateShip(ship, dt, playerOnBoat);
    this.updateCannonballs(dt, playerBoat ? playerBoat.group.position : null);
    this.updatePlayerFire(playerOnBoat);
  }

  // ------------------------------------------------------------------
  // AI เรือศัตรู
  // ------------------------------------------------------------------

  private updateShip(ship: EnemyShip, dt: number, playerOnBoat: boolean): void {
    if (!ship.alive) {
      if (ship.sinkTimer > 0) {
        // อนิเมชันจม: จุ่มลง + เอียง
        ship.sinkTimer -= dt;
        ship.group.position.y -= dt * 1.1;
        ship.group.rotation.z += dt * 0.35;
        if (ship.sinkTimer <= 0) {
          ship.group.visible = false;
          ship.respawnTimer = SHIP_RESPAWN_SECONDS;
        }
        return;
      }
      ship.respawnTimer -= dt;
      if (ship.respawnTimer <= 0) this.respawnShip(ship);
      return;
    }

    const playerBoat = this.boats.activeBoat;
    const px = playerBoat?.group.position.x ?? 0;
    const pz = playerBoat?.group.position.z ?? 0;
    const sx = ship.group.position.x;
    const sz = ship.group.position.z;
    const distance = playerOnBoat ? Math.hypot(px - sx, pz - sz) : Infinity;

    ship.state = decideShipState(ship.state, distance, playerOnBoat, ship.defn);

    let targetHeading = ship.heading;
    let targetSpeed = ship.defn.cruiseSpeed;
    if (ship.state === 'patrol') {
      ship.patrolAngle += (dt * ship.defn.cruiseSpeed) / ship.defn.patrolRadius;
      const wx = ship.spawn.x + Math.cos(ship.patrolAngle) * ship.defn.patrolRadius;
      const wz = ship.spawn.z + Math.sin(ship.patrolAngle) * ship.defn.patrolRadius;
      targetHeading = Math.atan2(wx - sx, wz - sz);
    } else if (ship.state === 'chase') {
      targetHeading = Math.atan2(px - sx, pz - sz);
      targetSpeed = ship.defn.chaseSpeed;
    } else {
      // attack: วนรอบเรือผู้เล่นเพื่อหันกราบเข้าหา (broadside)
      const toPlayer = Math.atan2(px - sx, pz - sz);
      targetHeading = toPlayer + Math.PI / 2;
      targetSpeed = ship.defn.cruiseSpeed * 1.25;
      ship.fireTimer -= dt;
      if (ship.fireTimer <= 0 && distance <= ship.defn.fireRange) {
        ship.fireTimer = ship.defn.fireCooldown;
        this.fireCannonball(ship, px, pz);
      }
    }

    // หลบเกาะ: จุดข้างหน้าตื้น → เบนหัวเรือ + ลดความเร็ว
    const aheadX = sx + Math.sin(ship.heading) * 8;
    const aheadZ = sz + Math.cos(ship.heading) * 8;
    if (worldHeightAt(aheadX, aheadZ) > -0.3) {
      targetHeading = ship.heading + 1.4;
      targetSpeed = Math.min(targetSpeed, ship.defn.cruiseSpeed * 0.7);
    }
    // กันหลุดขอบโลก
    if (Math.hypot(sx, sz) > 360) targetHeading = Math.atan2(-sx, -sz);

    ship.heading = steerToward(ship.heading, targetHeading, ship.defn.turnSpeed, dt);
    ship.speed = THREE.MathUtils.damp(ship.speed, targetSpeed, 2, dt);
    ship.group.position.x += Math.sin(ship.heading) * ship.speed * dt;
    ship.group.position.z += Math.cos(ship.heading) * ship.speed * dt;
    ship.group.position.y = THREE.MathUtils.damp(
      ship.group.position.y,
      WATER_LEVEL + getWaveHeight(sx, sz, this.elapsed) + 0.2,
      6,
      dt,
    );
    ship.group.rotation.y = ship.heading;

    // แฟลชแดงตอนโดนยิง (แบบเดียวกับเรือผู้เล่น)
    const material = ship.hull.material as THREE.MeshStandardMaterial;
    material.emissiveIntensity = Math.max(0, material.emissiveIntensity - dt * 4);
  }

  private respawnShip(ship: EnemyShip): void {
    ship.alive = true;
    ship.hp = ship.defn.maxHp;
    ship.state = 'patrol';
    ship.speed = ship.defn.cruiseSpeed;
    ship.group.position.set(ship.spawn.x, WATER_LEVEL + 0.2, ship.spawn.z);
    ship.group.rotation.set(0, ship.heading, 0);
    ship.group.visible = true;
    this.drawBar(ship);
  }

  // ------------------------------------------------------------------
  // ปืนใหญ่ (ทั้งสองฝั่ง)
  // ------------------------------------------------------------------

  private fireCannonball(ship: EnemyShip, targetX: number, targetZ: number): void {
    const from = this.tempVector.set(0, 0.9, 0);
    ship.group.localToWorld(from);
    const velocity = aimCannonball(from.x, from.y, from.z, targetX, targetZ);
    this.spawnBall(from, velocity, false, ship.defn.cannonDamage);
  }

  private updatePlayerFire(playerOnBoat: boolean): void {
    const boat = this.boats.activeBoat;
    if (!playerOnBoat || !boat || this.boats.riderState !== 'helm') return;
    if (!this.input.consumeAttack()) return;
    if (this.playerFireCooldown > 0) return;
    this.playerFireCooldown = PLAYER_FIRE_COOLDOWN;

    const bx = boat.group.position.x;
    const bz = boat.group.position.z;
    // เป้า = เรือศัตรูใกล้สุดในระยะ
    let target: EnemyShip | null = null;
    let best = 34;
    for (const ship of this.ships) {
      if (!ship.alive) continue;
      const d = Math.hypot(ship.group.position.x - bx, ship.group.position.z - bz);
      if (d < best) {
        best = d;
        target = ship;
      }
    }

    const count = Math.max(1, boat.definition.cannonsPerSide ?? 1);
    for (let i = 0; i < count; i++) {
      const zSpread = count > 1 ? (i - (count - 1) / 2) * 1.5 : 0.4;
      if (target) {
        // ยิงจากกราบฝั่งที่หันหาเป้า
        const toTargetX = target.group.position.x - bx;
        const toTargetZ = target.group.position.z - bz;
        const rightX = Math.cos(boat.heading);
        const rightZ = -Math.sin(boat.heading);
        const side = toTargetX * rightX + toTargetZ * rightZ >= 0 ? 1 : -1;
        const from = this.tempVector.set(side * boat.definition.width * 0.5, 0.9, zSpread);
        boat.group.localToWorld(from);
        const spread = (Math.random() - 0.5) * 2.4;
        const velocity = aimCannonball(
          from.x,
          from.y,
          from.z,
          target.group.position.x + spread,
          target.group.position.z + spread,
        );
        this.spawnBall(from.clone(), velocity, true, PLAYER_CANNON_DAMAGE);
      } else {
        // ไม่มีเป้า → ยิงตรงออกกราบขวา (ซ้อมยิง/เอฟเฟกต์)
        const from = this.tempVector.set(boat.definition.width * 0.5, 0.9, zSpread);
        boat.group.localToWorld(from);
        const velocity = aimCannonball(
          from.x,
          from.y,
          from.z,
          from.x + Math.cos(boat.heading) * 18,
          from.z - Math.sin(boat.heading) * 18,
        );
        this.spawnBall(from.clone(), velocity, true, PLAYER_CANNON_DAMAGE);
      }
    }
    if (!target) this.notify?.('💣 ยิงปืนใหญ่! (ไม่มีเป้าในระยะ)');
  }

  private spawnBall(
    from: THREE.Vector3,
    velocity: { vx: number; vy: number; vz: number },
    fromPlayer: boolean,
    damage: number,
  ): void {
    const mesh = new THREE.Mesh(this.ballGeometry, this.ballMaterial);
    mesh.position.copy(from);
    this.scene.add(mesh);
    this.balls.push({
      x: from.x,
      y: from.y,
      z: from.z,
      ...velocity,
      life: CANNONBALL_LIFETIME,
      mesh,
      fromPlayer,
      damage,
    });
    // ควันปากกระบอก
    const direction = this.tempVector.set(velocity.vx, 0, velocity.vz).normalize();
    this.effects.spawnEnergyLaunch(from, direction.clone(), 0xcfd6da, 0.8);
  }

  private updateCannonballs(dt: number, playerBoatPosition: THREE.Vector3 | null): void {
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const ball = this.balls[i];
      // substep กัน tunnel ตอนเฟรมตก (dt ใหญ่ กระสุนกระโดดข้ามรัศมีชน)
      const steps = Math.max(1, Math.ceil(dt / 0.05));
      const stepDt = dt / steps;
      let flying = true;
      let consumed = false;
      for (let s = 0; s < steps && flying && !consumed; s++) {
        flying = stepCannonball(ball, stepDt);
        consumed = this.checkBallHit(ball, playerBoatPosition);
      }
      ball.mesh.position.set(ball.x, ball.y, ball.z);

      if (consumed || !flying) {
        if (!consumed && ball.y <= WATER_LEVEL + 0.1) {
          // ตกน้ำ → วงกระเพื่อม
          ball.mesh.position.y = WATER_LEVEL;
          this.effects.spawnBoatImpact(ball.mesh.position);
        }
        this.scene.remove(ball.mesh);
        this.balls.splice(i, 1);
      }
    }
  }

  /** เช็คโดนเป้า 1 จุดเวลา — คืน true ถ้าชน (พร้อมลงดาเมจ/เอฟเฟกต์) */
  private checkBallHit(ball: Cannonball, playerBoatPosition: THREE.Vector3 | null): boolean {
    if (ball.fromPlayer) {
      for (const ship of this.ships) {
        if (!ship.alive) continue;
        const dx = ship.group.position.x - ball.x;
        const dz = ship.group.position.z - ball.z;
        if (Math.hypot(dx, dz) < ship.defn.hitRadius && ball.y < ship.group.position.y + 3) {
          this.damageShip(ship, ball.damage);
          return true;
        }
      }
      return false;
    }
    if (!playerBoatPosition) return false;
    const dx = playerBoatPosition.x - ball.x;
    const dz = playerBoatPosition.z - ball.z;
    if (Math.hypot(dx, dz) < 3 && ball.y < playerBoatPosition.y + 3) {
      this.boats.damageActiveBoat(ball.damage);
      this.effects.spawnBoatImpact(this.tempVector.set(ball.x, ball.y, ball.z), true);
      return true;
    }
    return false;
  }

  private damageShip(ship: EnemyShip, amount: number): void {
    ship.hp = Math.max(0, ship.hp - amount);
    this.drawBar(ship);
    const material = ship.hull.material as THREE.MeshStandardMaterial;
    material.emissive.setHex(0x7a160d);
    material.emissiveIntensity = 1.4;
    this.effects.spawnBoatImpact(ship.group.position, true);
    if (ship.hp > 0) return;

    // จมเรือ → รางวัล + ตั้งเวลาจม/เกิดใหม่
    ship.alive = false;
    ship.sinkTimer = 2.4;
    this.effects.spawnBoatImpact(ship.group.position, true);
    this.effects.spawnShockwave(ship.group.position, 5, 0xff9a5c);
    this.rewards.addCoins(ship.defn.reward.coins, 'naval:sink');
    this.rewards.addPlayerExp(ship.defn.reward.exp, 'naval:sink');
    this.notify?.(`🏴‍☠️ จม${ship.defn.name}! +${ship.defn.reward.coins} 🪙 +${ship.defn.reward.exp} EXP`);
  }
}
