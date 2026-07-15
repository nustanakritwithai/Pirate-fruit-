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
import { getWaveHeight, SEA_BOUNDARY, WATER_LEVEL } from '../ocean/Ocean';
import type { WorldTextures } from '../world/textures';
import type { CollisionSystem, DynamicGroundProvider } from '../world/Collision';
import type { CharacterController } from '../player/CharacterController';
import type { Monster } from '../monster/Monster';
import type { MonsterManager } from '../monster/MonsterManager';
import type { ItemInventory } from '../shop/ItemInventory';
import { InteractionPrompt } from '../ui/InteractionPrompt';
import { worldHeightAt } from '../island/IslandRegistry';
import { upgradeBoatVisualWhenReady } from './BoatAssetLibrary';
import type { BoatDefinition } from './BoatData';
import type { BoatManager } from './BoatManager';
import { createBoatModel } from './BoatModel';
import { deckBoundsFor, deckHeightAt } from './DeckSpace';
import {
  aimCannonball,
  CANNONBALL_LIFETIME,
  decideShipState,
  PIRATE_CUTTER,
  PIRATE_SHIP_TIERS,
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

const PLAYER_FIRE_RANGE = 34;

interface NavalRewardSink {
  addCoins(amount: number, source?: string): void;
  addPlayerExp(amount: number, source?: string): unknown;
}

interface EnemyShip {
  instanceId: string;
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
  /** ถูก Boarding อยู่ — เรือหยุดนิ่ง สู้กันบนดาดฟ้า */
  boarded: boolean;
}

/** เฟสของการ Boarding: สู้ลูกเรือ → ปล้นสมบัติ → ยึดเรือ */
type BoardingPhase = 'fight' | 'loot' | 'capture';

interface BoardingState {
  ship: EnemyShip;
  phase: BoardingPhase;
  crew: Monster[];
  provider: DynamicGroundProvider;
}

/** ระยะจากผู้เล่นถึงเรือศัตรูที่ขึ้น Boarding ได้ */
const BOARDING_RANGE = 10;
/** เดินหนีไกลเกินนี้ = ยกเลิก Boarding */
const BOARDING_ABORT_RANGE = 26;
/** รางวัลปล้นสมบัติ + โบนัสยึดเรือ (ขายซาก) */
const BOARDING_LOOT = { coins: 180, exp: 120, potionId: 'potion-hp' };
const CAPTURE_BONUS_COINS = 200;

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
    cannonsPerSide: defn.cannonsPerSide,
    modelId: defn.modelId,
    deckTopLocalY: defn.deckTopLocalY,
  };
}

export class NavalCombat {
  private readonly ships: EnemyShip[] = [];
  private readonly balls: Cannonball[] = [];
  private readonly ballGeometry = new THREE.SphereGeometry(0.17, 8, 6);
  private readonly ballMaterial = new THREE.MeshStandardMaterial({ color: 0x22242a, roughness: 0.5 });
  private readonly tempVector = new THREE.Vector3();
  private readonly prompt = new InteractionPrompt();
  private boarding: BoardingState | null = null;
  private elapsed = 0;
  private playerFireCooldown = 0;
  private armedSide: 0 | 1 | -1 = 0;
  private readonly aimArc: THREE.Group;
  private readonly aimFill: THREE.MeshBasicMaterial;
  private readonly aimRim: THREE.MeshBasicMaterial;
  private nextShipInstanceId = 1;
  onCannonArmed?: (side: 0 | 1 | 2) => void;

  constructor(
    private scene: THREE.Scene,
    private input: Input,
    private controller: CharacterController,
    private collision: CollisionSystem,
    private boats: BoatManager,
    private monsters: MonsterManager,
    private inventory: ItemInventory,
    private effects: Effects,
    private rewards: NavalRewardSink,
    textures: WorldTextures,
    graphics: GraphicsProfile,
    private notify?: (message: string) => void,
  ) {
    const definitions = new Map(PIRATE_SHIP_TIERS.map((definition) => [definition.tier, definition]));
    for (const spawn of PIRATE_SPAWNS) {
      const definition = definitions.get(spawn.tier) ?? PIRATE_CUTTER;
      this.ships.push(this.spawnShip(definition, spawn, textures, graphics));
    }

    const makeArc = (inner: number, outer: number, material: THREE.MeshBasicMaterial) => {
      const geometry = new THREE.RingGeometry(inner, outer, 42, 1, -0.95, 1.9);
      geometry.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.renderOrder = 2;
      return mesh;
    };
    this.aimFill = new THREE.MeshBasicMaterial({ color: 0xffb35c, transparent: true, opacity: 0.24, side: THREE.DoubleSide, depthWrite: false });
    this.aimRim = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false });
    this.aimArc = new THREE.Group();
    this.aimArc.add(makeArc(2.4, PLAYER_FIRE_RANGE - 0.8, this.aimFill));
    this.aimArc.add(makeArc(PLAYER_FIRE_RANGE - 0.8, PLAYER_FIRE_RANGE, this.aimRim));
    this.aimArc.visible = false;
    scene.add(this.aimArc);
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

  /** สกิลจากดาดฟ้าเรือผู้เล่นโจมตีเรือศัตรูได้ โดยใช้รัศมีชนของเรือร่วมด้วย */
  damageNearestEnemyShipFromSkill(
    position: THREE.Vector3,
    radius: number,
    damage: number,
    hitShips?: Set<string>,
  ): boolean {
    if (this.boats.riderState !== 'deck') return false;
    let target: EnemyShip | null = null;
    let best = Number.POSITIVE_INFINITY;
    for (const ship of this.ships) {
      if (!ship.alive || ship.boarded || hitShips?.has(ship.instanceId)) continue;
      const distance = Math.hypot(ship.group.position.x - position.x, ship.group.position.z - position.z);
      if (distance > radius + ship.defn.hitRadius || distance >= best) continue;
      best = distance;
      target = ship;
    }
    if (!target) return false;
    hitShips?.add(target.instanceId);
    const appliedDamage = Math.max(1, damage * 0.65);
    target.hp = Math.max(0, target.hp - appliedDamage);
    this.drawBar(target);
    this.effects.spawnBoatImpact(target.group.position, target.hp <= 0);
    this.notify?.(`💥 Skill กระแทกเรือ ${target.defn.name} -${Math.round(appliedDamage)}`);
    if (target.hp <= 0) {
      target.alive = false;
      target.sinkTimer = 2.4;
      target.speed = 0;
      this.rewards.addCoins(target.defn.reward.coins, 'naval:skill-sink');
      this.rewards.addPlayerExp(target.defn.reward.exp, 'naval:skill-sink');
    }
    return true;
  }

  private spawnShip(
    defn: EnemyShipDefinition,
    spawn: { x: number; z: number },
    textures: WorldTextures,
    graphics: GraphicsProfile,
  ): EnemyShip {
    const modelDefinition = toModelDefinition(defn);
    const model = createBoatModel(modelDefinition, textures, graphics);
    upgradeBoatVisualWhenReady(model.root, model.visualRoot, modelDefinition, graphics);
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
    bar.scale.set(Math.max(3.8, defn.length * 0.48), 0.99, 1);
    bar.position.y = Math.max(3.8, defn.length * 0.43);
    model.root.add(bar);

    const ship: EnemyShip = {
      instanceId: `${defn.id}-${this.nextShipInstanceId++}`,
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
      boarded: false,
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

    if (this.boarding) this.updateBoarding();
    else this.updateBoardingPrompt();
  }

  // ------------------------------------------------------------------
  // Boarding: เทียบเรือ → สู้บนดาดฟ้า → ปล้น → ยึดเรือ
  // ------------------------------------------------------------------

  private updateBoardingPrompt(): void {
    // เริ่ม Boarding ได้จากดาดฟ้าเรือตัวเอง (เทียบเรือแล้วเดินมาที่กราบ)
    if (this.boats.riderState !== 'deck') {
      this.prompt.hide();
      return;
    }
    const player = this.controller.position;
    let target: EnemyShip | null = null;
    let best = BOARDING_RANGE;
    for (const ship of this.ships) {
      if (!ship.alive) continue;
      const d = Math.hypot(ship.group.position.x - player.x, ship.group.position.z - player.z);
      if (d < best) {
        best = d;
        target = ship;
      }
    }
    if (!target) {
      this.prompt.hide();
      return;
    }
    // ไม่ชนกับพรอมป์พวงมาลัยของเรือตัวเอง
    const own = this.boats.activeBoat;
    if (own) {
      this.tempVector.set(0, 1.02, -own.definition.length * 0.21);
      own.group.localToWorld(this.tempVector);
      if (player.distanceTo(this.tempVector) <= 2.6) return;
    }
    this.prompt.showAction('ขึ้นเรือศัตรู', target.defn.name, '🏴‍☠️');
    if (this.input.consumeInteract() || this.prompt.consumeRequested()) this.startBoarding(target);
  }

  private startBoarding(ship: EnemyShip): void {
    // เรือทั้งสองหยุดนิ่ง (เทียบเรือ)
    const own = this.boats.activeBoat;
    if (own) {
      own.anchor = true;
      own.sailLevel = 0;
    }
    ship.boarded = true;
    ship.speed = 0;
    ship.group.updateMatrixWorld();

    // พื้นดาดฟ้าเรือศัตรูเดินได้ (เรือหยุดนิ่ง — ไม่ต้อง carry)
    const bounds = deckBoundsFor({ ...ship.defn, deckTopLocalY: ship.defn.deckTopLocalY });
    const provider: DynamicGroundProvider = (x, z) =>
      ship.boarded ? deckHeightAt(ship.group.matrixWorld, bounds, ship.group.position.y, x, z) : null;
    this.collision.addDynamicGround(provider);

    // กระโดดขึ้นดาดฟ้าท้ายเรือ
    this.tempVector.set(0, bounds.deckTopLocalY + 0.05, -ship.defn.length * 0.2);
    ship.group.localToWorld(this.tempVector);
    this.controller.teleport(this.tempVector.x, this.tempVector.y, this.tempVector.z);
    this.controller.heading = ship.heading;

    // ลูกเรือ 2 + กัปตัน 1 บนดาดฟ้า
    const crewSpots: { typeId: string; localX: number; localZ: number }[] = [
      { typeId: 'pirate-deckhand', localX: 0.55, localZ: 0.7 },
      { typeId: 'pirate-deckhand', localX: -0.55, localZ: 0.1 },
      { typeId: 'pirate-captain', localX: 0, localZ: 1.4 },
    ];
    const entries = crewSpots.map((spot) => {
      this.tempVector.set(spot.localX, bounds.deckTopLocalY, spot.localZ);
      ship.group.localToWorld(this.tempVector);
      return { typeId: spot.typeId, x: this.tempVector.x, z: this.tempVector.z };
    });
    const crew = this.monsters.spawnBoardingCrew(entries);

    this.boarding = { ship, phase: 'fight', crew, provider };
    this.prompt.hide();
    this.notify?.('🏴‍☠️ Boarding! กำจัดลูกเรือกับกัปตันให้หมด');
  }

  private updateBoarding(): void {
    const boarding = this.boarding!;
    const ship = boarding.ship;
    const player = this.controller.position;
    const distance = Math.hypot(
      ship.group.position.x - player.x,
      ship.group.position.z - player.z,
    );

    // หนี/ตกน้ำไกลเกิน → ยกเลิก (ลูกเรือที่เหลือหายไปพร้อมเรือกลับสู่ทะเล)
    if (distance > BOARDING_ABORT_RANGE) {
      this.endBoarding(false);
      this.notify?.('ยกเลิก Boarding — เรือศัตรูถอนตัว');
      return;
    }

    if (boarding.phase === 'fight') {
      this.prompt.hide();
      if (boarding.crew.every((monster) => !monster.alive)) {
        boarding.phase = 'loot';
        this.notify?.('⚔️ ลูกเรือหมดแล้ว! เดินไปกลางเรือแล้วกด E ปล้นสมบัติ');
      }
      return;
    }

    if (boarding.phase === 'loot') {
      if (distance <= 4.5) {
        this.prompt.showAction('ปล้นสมบัติ', ship.defn.name, '💰');
        if (this.input.consumeInteract() || this.prompt.consumeRequested()) {
          this.rewards.addCoins(BOARDING_LOOT.coins, 'naval:loot');
          this.rewards.addPlayerExp(BOARDING_LOOT.exp, 'naval:loot');
          this.inventory.addConsumable(BOARDING_LOOT.potionId, 1);
          this.effects.spawnShockwave(ship.group.position, 3, 0xffd76b);
          this.notify?.(`💰 ปล้นสำเร็จ! +${BOARDING_LOOT.coins} 🪙 +${BOARDING_LOOT.exp} EXP +ยาฟื้น HP`);
          boarding.phase = 'capture';
        }
      } else {
        this.prompt.hide();
      }
      return;
    }

    // phase 'capture'
    if (distance <= 4.5) {
      this.prompt.showAction('ยึดเรือ (ขายซาก)', `+${CAPTURE_BONUS_COINS} 🪙`, '🏴‍☠️');
      if (this.input.consumeInteract() || this.prompt.consumeRequested()) {
        this.rewards.addCoins(CAPTURE_BONUS_COINS, 'naval:capture');
        this.notify?.(`🏴‍☠️ ยึดเรือสำเร็จ! ขายซากได้ +${CAPTURE_BONUS_COINS} 🪙`);
        // กลับเรือตัวเองก่อนซากหาย (ไม่มีเรือ → ตกน้ำว่ายกลับ)
        this.boats.returnRiderToDeck();
        this.endBoarding(true);
      }
    } else {
      this.prompt.hide();
    }
  }

  /** จบ Boarding — captured = ยึดสำเร็จ (เรือหาย + ตั้งเวลาเกิดใหม่), false = ยกเลิก */
  private endBoarding(captured: boolean): void {
    const boarding = this.boarding;
    if (!boarding) return;
    this.monsters.despawnCrew(boarding.crew);
    this.collision.removeDynamicGround(boarding.provider);
    boarding.ship.boarded = false;
    if (captured) {
      boarding.ship.alive = false;
      boarding.ship.group.visible = false;
      boarding.ship.respawnTimer = SHIP_RESPAWN_SECONDS;
      this.effects.spawnBoatImpact(boarding.ship.group.position, true);
    }
    this.prompt.hide();
    this.boarding = null;
  }

  // ------------------------------------------------------------------
  // AI เรือศัตรู
  // ------------------------------------------------------------------

  private updateShip(ship: EnemyShip, dt: number, playerOnBoat: boolean): void {
    // ถูก Boarding — เรือหยุดนิ่งสนิท (สู้กันบนดาดฟ้า) ไม่ขยับ/ไม่ยิง/ไม่โยกคลื่น
    if (ship.boarded) return;
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
    if (Math.hypot(sx, sz) > SEA_BOUNDARY - 45) targetHeading = Math.atan2(-sx, -sz);

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
    const count = Math.max(1, Math.min(5, ship.defn.cannonsPerSide));
    for (let i = 0; i < count; i++) {
      const lateral = count === 1 ? 0 : (i - (count - 1) / 2) * Math.min(1.25, ship.defn.width * 0.3);
      const from = new THREE.Vector3(lateral, 0.9, 0);
      ship.group.localToWorld(from);
      const spread = count === 1 ? 0 : (Math.random() - 0.5) * 1.4;
      const velocity = aimCannonball(from.x, from.y, from.z, targetX + spread, targetZ + spread);
      this.spawnBall(from, velocity, false, ship.defn.cannonDamage);
    }
  }

  /** สัดส่วนคูลดาวน์ปืนใหญ่ที่เหลือ 0..1 (ให้วงแหวนปุ่มยิงบนมือถือ) */
  get playerFireCooldownFraction(): number {
    return this.playerFireCooldown / PLAYER_FIRE_COOLDOWN;
  }

  get armedCannonSide(): 0 | 1 | 2 {
    return this.armedSide === 0 ? 0 : this.armedSide === 1 ? 1 : 2;
  }

  get playerBallPositions(): { x: number; y: number; z: number }[] {
    return this.balls.filter((b) => b.fromPlayer).map((b) => ({ x: b.x, y: b.y, z: b.z }));
  }

  private disarmCannons(): void {
    if (this.armedSide === 0) return;
    this.armedSide = 0;
    this.aimArc.visible = false;
    this.onCannonArmed?.(0);
  }

  private updateAimArc(): void {
    const boat = this.boats.activeBoat;
    if (this.armedSide === 0 || !boat) return;
    this.aimArc.position.set(boat.group.position.x, boat.group.position.y + 0.42, boat.group.position.z);
    this.aimArc.rotation.y = boat.heading + (this.armedSide === 1 ? 0 : Math.PI);
    const cooling = this.playerFireCooldown > 0;
    this.aimFill.opacity = cooling ? 0.1 : 0.22 + Math.sin(this.elapsed * 5) * 0.06;
    this.aimRim.opacity = cooling ? 0.25 : 0.55 + Math.sin(this.elapsed * 5) * 0.15;
  }

  private updatePlayerFire(playerOnBoat: boolean): void {
    const boat = this.boats.activeBoat;
    if (!playerOnBoat || !boat || this.boats.riderState !== 'helm') {
      this.disarmCannons();
      return;
    }
    this.updateAimArc();
    const sideCommand = this.input.consumeCannon();
    const autoCommand = this.input.consumeAttack();
    if (sideCommand === 0 && !autoCommand) return;
    const bx = boat.group.position.x;
    const bz = boat.group.position.z;
    const leftX = Math.cos(boat.heading);
    const leftZ = -Math.sin(boat.heading);
    let desired: 1 | -1;
    if (sideCommand !== 0) desired = sideCommand === 1 ? 1 : -1;
    else if (this.armedSide !== 0) desired = this.armedSide;
    else {
      const nearest = this.nearestShipTo(bx, bz, 0, leftX, leftZ);
      desired = nearest && (nearest.group.position.x - bx) * leftX + (nearest.group.position.z - bz) * leftZ >= 0 ? 1 : -1;
    }
    if (this.armedSide !== desired) {
      this.armedSide = desired;
      this.aimArc.visible = true;
      this.updateAimArc();
      this.onCannonArmed?.(desired === 1 ? 1 : 2);
      this.notify?.(desired === 1 ? '💣 เปิดกราบซ้าย — กดซ้ำเพื่อยิง' : '💣 เปิดกราบขวา — กดซ้ำเพื่อยิง');
      return;
    }
    if (this.playerFireCooldown > 0) return;
    this.playerFireCooldown = PLAYER_FIRE_COOLDOWN;
    const side = this.armedSide;
    const target = this.nearestShipTo(bx, bz, side, leftX, leftZ);

    const count = Math.max(1, boat.definition.cannonsPerSide ?? 1);
    for (let i = 0; i < count; i++) {
      const zSpread = count > 1 ? (i - (count - 1) / 2) * 1.5 : 0.4;
      const from = this.tempVector.set(side * boat.definition.width * 0.5, 0.9, zSpread);
      boat.group.localToWorld(from);
      let velocity: { vx: number; vy: number; vz: number };
      if (target) {
        const spread = (Math.random() - 0.5) * 2.4;
        velocity = aimCannonball(
          from.x,
          from.y,
          from.z,
          target.group.position.x + spread,
          target.group.position.z + spread,
        );
      } else {
        // ไม่มีเป้าฝั่งนั้น → ยิงตรงออกกราบที่เลือก (ซ้อมยิง/เอฟเฟกต์)
        velocity = aimCannonball(
          from.x,
          from.y,
          from.z,
          from.x + side * leftX * 18,
          from.z + side * leftZ * 18,
        );
      }
      this.spawnBall(from.clone(), velocity, true, PLAYER_CANNON_DAMAGE);
    }
    if (!target) this.notify?.('💣 ยิงปืนใหญ่! (ไม่มีเป้าในระยะ)');
  }

  private nearestShipTo(bx: number, bz: number, side: 0 | 1 | -1, leftX: number, leftZ: number): EnemyShip | null {
    let target: EnemyShip | null = null;
    let best = PLAYER_FIRE_RANGE;
    for (const ship of this.ships) {
      if (!ship.alive) continue;
      const toX = ship.group.position.x - bx;
      const toZ = ship.group.position.z - bz;
      const distance = Math.hypot(toX, toZ);
      if (distance >= best) continue;
      if (side !== 0 && (toX * leftX + toZ * leftZ) * side < 0) continue;
      best = distance;
      target = ship;
    }
    return target;
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
