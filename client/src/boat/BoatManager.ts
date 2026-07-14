import * as THREE from 'three';
import type { ThirdPersonCamera } from '../camera/ThirdPersonCamera';
import type { Effects } from '../effects/Effects';
import type { GraphicsProfile } from '../engine/GraphicsQuality';
import type { Input } from '../engine/Input';
import { getWaveHeight, WATER_LEVEL } from '../ocean/Ocean';
import type { CharacterController } from '../player/CharacterController';
import { BoatHUD } from '../ui/BoatHUD';
import { BoatShopUI, type BoatShopAction } from '../ui/BoatShopUI';
import { InteractionPrompt } from '../ui/InteractionPrompt';
import type { CollisionSystem } from '../world/Collision';
import type { WorldTextures } from '../world/textures';
import { Boat } from './Boat';
import { getBoatDefinition } from './BoatData';
import { BoatProgress } from './BoatProgress';
import type { EconomyWallet } from '../progression/ProgressionTypes';
import { findDockAt, getDock, worldHeightAt } from '../island/IslandRegistry';

const BOOST_DURATION = 1.2;
const BOOST_COOLDOWN = 4;
const RESPAWN_COOLDOWN = 10;
const BOARD_RANGE = 4.8;

export class BoatManager {
  private active: Boat | null = null;
  private readonly progress: BoatProgress;
  private readonly prompt = new InteractionPrompt();
  private readonly hud = new BoatHUD();
  private readonly shop: BoatShopUI;
  private elapsed = 0;
  private collisionPoint = new THREE.Vector3();
  private tempPosition = new THREE.Vector3();
  private activeDockId = 'starter-harbor';

  constructor(
    private scene: THREE.Scene,
    private input: Input,
    private controller: CharacterController,
    private camera: ThirdPersonCamera,
    private collision: CollisionSystem,
    private textures: WorldTextures,
    private graphics: GraphicsProfile,
    private effects: Effects,
    private onBoatDestroyed: () => void,
    economy?: EconomyWallet,
  ) {
    this.progress = new BoatProgress(economy);
    this.shop = new BoatShopUI(
      this.progress,
      () => this.active,
      (action, boatId) => this.handleShopAction(action, boatId),
    );
  }

  get activeBoat(): Boat | null {
    return this.active;
  }

  get boostCooldownFraction(): number {
    return this.active?.boostCooldownFraction ?? 0;
  }

  get selectedBoatId(): string | null {
    return this.progress.selectedBoatId;
  }

  openShop(dockId = 'starter-harbor'): void {
    if (this.controller.isMounted) {
      this.hud.notify('ต้องลงจากเรือก่อนเปิดร้าน');
      return;
    }
    if (getDock(dockId)) this.activeDockId = dockId;
    this.controller.setControlsEnabled(false);
    this.shop.setStatus('เรือหนึ่งลำสามารถถูกเรียกใช้งานได้พร้อมกัน');
    this.shop.open(() => this.controller.setControlsEnabled(true));
  }

  update(dt: number): void {
    this.elapsed += dt;
    this.hud.update(this.active, dt);
    const boat = this.active;
    if (!boat) {
      this.prompt.hide();
      return;
    }

    boat.boostTimer = Math.max(0, boat.boostTimer - dt);
    boat.boostCooldown = Math.max(0, boat.boostCooldown - dt);
    boat.collisionCooldown = Math.max(0, boat.collisionCooldown - dt);
    boat.updateDamageVisual(dt);

    if (boat.state === 'destroyed') {
      this.prompt.hide();
      boat.destroyCooldown -= dt;
      if (boat.destroyCooldown <= 0) {
        this.scene.remove(boat.group);
        boat.dispose();
        this.active = null;
        this.hud.notify('เรือพร้อมให้เรียกใหม่ที่กัปตันคราม');
      }
      return;
    }

    const previousX = boat.group.position.x;
    const previousZ = boat.group.position.z;
    if (boat.state === 'piloted') {
      this.updatePiloted(boat, dt);
    } else {
      this.updateIdle(boat, dt);
      this.updateBoardPrompt(boat);
    }

    boat.group.position.x += Math.sin(boat.heading) * boat.speed * dt;
    boat.group.position.z += Math.cos(boat.heading) * boat.speed * dt;
    this.resolveCollision(boat, previousX, previousZ);
    this.updateBuoyancy(boat, dt);
    this.updateWake(boat);

    if (boat.state === 'piloted') this.syncRider(boat);
  }

  private updatePiloted(boat: Boat, dt: number): void {
    this.prompt.showAction('ลงจาก', boat.definition.name, '↩');
    if (this.input.consumeInteract() || this.prompt.consumeRequested()) {
      this.tryDisembark(boat);
      return;
    }

    if (this.input.consumeAnchor()) {
      boat.anchor = !boat.anchor;
      this.hud.notify(boat.anchor ? '⚓ ทอดสมอแล้ว' : 'ยกสมอแล้ว');
    }

    if ((this.input.consumeDash() || this.input.sprint) && boat.boostCooldown <= 0 && !boat.anchor) {
      boat.boostTimer = BOOST_DURATION;
      boat.boostCooldown = BOOST_COOLDOWN;
      this.hud.notify('⚡ Boost!');
    }

    const move = this.input.moveVector();
    const throttle = THREE.MathUtils.clamp(-move.z, -1, 1);
    const steering = THREE.MathUtils.clamp(move.x, -1, 1);
    if (boat.anchor) {
      boat.speed = THREE.MathUtils.damp(boat.speed, 0, boat.definition.brakePower, dt);
    } else if (throttle > 0) {
      const boost = boat.boostTimer > 0 ? 1.7 : 1;
      boat.speed += boat.definition.acceleration * throttle * boost * dt;
    } else if (throttle < 0) {
      if (boat.speed > 0.5) {
        boat.speed = THREE.MathUtils.damp(boat.speed, 0, boat.definition.brakePower, dt);
      } else {
        boat.speed += boat.definition.acceleration * throttle * 0.65 * dt;
      }
    } else {
      boat.speed = THREE.MathUtils.damp(boat.speed, 0, boat.definition.drag, dt);
    }

    const maxForward = boat.definition.maxSpeed * (boat.boostTimer > 0 ? 1.35 : 1);
    boat.speed = THREE.MathUtils.clamp(boat.speed, -boat.definition.reverseSpeed, maxForward);
    const turnFactor = THREE.MathUtils.clamp(Math.abs(boat.speed) / 3, 0.12, 1);
    const reverseDirection = boat.speed < 0 ? -1 : 1;
    // โยกขวา (steering > 0) = เลี้ยวขวา — heading เพิ่มขึ้นหมุนหัวเรือไปทางซ้าย จึงต้องลบ
    boat.heading -= steering * boat.definition.turnSpeed * turnFactor * reverseDirection * dt;
  }

  private updateIdle(boat: Boat, dt: number): void {
    const damping = boat.anchor ? boat.definition.brakePower : boat.definition.drag * 1.8;
    boat.speed = THREE.MathUtils.damp(boat.speed, 0, damping, dt);
    if (findDockAt(boat.group.position.x, boat.group.position.z) && Math.abs(boat.speed) < 0.25) {
      boat.state = 'docked';
    } else if (boat.state === 'docked') {
      boat.state = 'spawned';
    }
  }

  private updateBoardPrompt(boat: Boat): void {
    const distance = this.controller.position.distanceTo(boat.group.position);
    if (distance > BOARD_RANGE || this.shop.isOpen) {
      this.prompt.hide();
      return;
    }
    this.prompt.showAction('ขึ้น', boat.definition.name, '⛵');
    if (this.input.consumeInteract() || this.prompt.consumeRequested()) this.board(boat);
  }

  private board(boat: Boat): void {
    boat.state = 'piloted';
    boat.anchor = false;
    this.controller.setMounted(true);
    this.controller.setControlsEnabled(false);
    this.input.setMode('boat');
    this.camera.setBoatMode(true);
    this.hud.show(boat);
    this.prompt.hide();
    this.syncRider(boat);
  }

  private tryDisembark(boat: Boat): void {
    if (Math.abs(boat.speed) > 1.4) {
      this.hud.notify('ลดความเร็วเรือก่อนลง', true);
      return;
    }

    let exitX: number;
    let exitZ: number;
    let intoWater = false;

    const dock = findDockAt(boat.group.position.x, boat.group.position.z);
    if (dock) {
      const exit = { x: boat.group.position.x, z: boat.group.position.z };
      exit[dock.disembark.fixedAxis] = dock.disembark.fixedValue;
      exit[dock.disembark.clampAxis] = THREE.MathUtils.clamp(
        exit[dock.disembark.clampAxis],
        dock.disembark.min,
        dock.disembark.max,
      );
      exitX = exit.x;
      exitZ = exit.z;
    } else {
      // เลือกจุดลงข้างเรือ — เอาฝั่งที่เป็นพื้นดินก่อน ถ้าไม่มีก็ลงน้ำข้างเรือเลย
      const candidates = [
        [-(boat.definition.width + 1.1), 0],
        [boat.definition.width + 1.1, 0],
        [0, boat.definition.length * 0.58],
      ] as const;
      let land: { x: number; z: number } | null = null;
      for (const [localX, localZ] of candidates) {
        const x = boat.group.position.x + Math.cos(boat.heading) * localX + Math.sin(boat.heading) * localZ;
        const z = boat.group.position.z - Math.sin(boat.heading) * localX + Math.cos(boat.heading) * localZ;
        if (worldHeightAt(x, z) > 0) {
          land = { x, z };
          break;
        }
      }
      if (land) {
        exitX = land.x;
        exitZ = land.z;
      } else {
        // ลงว่ายน้ำข้างเรือ (ด้านขวาของเรือ)
        const side = boat.definition.width + 1.1;
        exitX = boat.group.position.x + Math.cos(boat.heading) * side;
        exitZ = boat.group.position.z - Math.sin(boat.heading) * side;
        intoWater = true;
      }
    }

    boat.state = dock ? 'docked' : 'spawned';
    boat.anchor = boat.state === 'docked';
    this.controller.setMounted(false);
    this.controller.setControlsEnabled(true);
    this.input.setMode('player');
    this.camera.setBoatMode(false);
    // ลงน้ำ → วางที่ผิวน้ำให้ตัวละครลอย/ว่ายได้ทันที, ลงฝั่ง → วางบนพื้น
    const exitY = intoWater ? WATER_LEVEL - 0.3 : this.collision.heightAt(exitX, exitZ) + 0.03;
    this.controller.teleport(exitX, exitY, exitZ);
    this.controller.heading = boat.heading;
    if (intoWater) this.hud.notify('กระโดดลงน้ำแล้ว — ว่ายกลับมากด E เพื่อขึ้นเรือ');
    this.hud.hide();
    this.prompt.hide();
  }

  private syncRider(boat: Boat): void {
    this.tempPosition.set(0, 1.02, -boat.definition.length * 0.2);
    boat.group.localToWorld(this.tempPosition);
    this.controller.position.copy(this.tempPosition);
    this.controller.heading = boat.heading;
  }

  private updateBuoyancy(boat: Boat, dt: number): void {
    const halfLength = boat.definition.length * 0.38;
    const halfWidth = boat.definition.width * 0.36;
    const sin = Math.sin(boat.heading);
    const cos = Math.cos(boat.heading);
    const x = boat.group.position.x;
    const z = boat.group.position.z;
    const front = getWaveHeight(x + sin * halfLength, z + cos * halfLength, this.elapsed);
    const rear = getWaveHeight(x - sin * halfLength, z - cos * halfLength, this.elapsed);
    const left = getWaveHeight(x - cos * halfWidth, z + sin * halfWidth, this.elapsed);
    const right = getWaveHeight(x + cos * halfWidth, z - sin * halfWidth, this.elapsed);
    const targetY = WATER_LEVEL + (front + rear + left + right) * 0.25 + 0.2;
    boat.group.position.y = THREE.MathUtils.damp(boat.group.position.y, targetY, 8, dt);
    const pitch = THREE.MathUtils.clamp(Math.atan2(front - rear, halfLength * 2), -0.105, 0.105);
    const roll = THREE.MathUtils.clamp(Math.atan2(left - right, halfWidth * 2), -0.07, 0.07);
    boat.group.rotation.order = 'YXZ';
    boat.group.rotation.y = boat.heading;
    boat.group.rotation.x = THREE.MathUtils.damp(boat.group.rotation.x, pitch, 6, dt);
    boat.group.rotation.z = THREE.MathUtils.damp(boat.group.rotation.z, roll, 6, dt);
  }

  private resolveCollision(boat: Boat, previousX: number, previousZ: number): void {
    const points = [
      [0, boat.definition.length * 0.5],
      [0, -boat.definition.length * 0.45],
      [-boat.definition.width * 0.46, boat.definition.length * 0.22],
      [boat.definition.width * 0.46, boat.definition.length * 0.22],
    ] as const;
    let hit = false;
    for (const [localX, localZ] of points) {
      const x = boat.group.position.x + Math.cos(boat.heading) * localX + Math.sin(boat.heading) * localZ;
      const z = boat.group.position.z - Math.sin(boat.heading) * localX + Math.cos(boat.heading) * localZ;
      if (worldHeightAt(x, z) > 0.04) {
        hit = true;
        this.collisionPoint.set(x, WATER_LEVEL, z);
        break;
      }
    }
    if (!hit && Math.hypot(boat.group.position.x, boat.group.position.z) < 390) return;
    if (!hit) this.collisionPoint.copy(boat.group.position).setY(WATER_LEVEL);

    boat.group.position.x = previousX;
    boat.group.position.z = previousZ;
    const impactSpeed = Math.abs(boat.speed);
    boat.speed *= -0.2;
    if (boat.collisionCooldown > 0) return;
    boat.collisionCooldown = 0.65;
    this.effects.spawnBoatImpact(this.collisionPoint);
    if (impactSpeed < 3) return;
    const damage = Math.min(36, Math.round((impactSpeed - 2.5) * 5.5));
    boat.damage(damage);
    this.hud.notify(`ชนเกาะ! เรือเสีย ${damage} HP`, true);
    if (boat.hp <= 0) this.destroyBoat(boat);
  }

  private updateWake(boat: Boat): void {
    const opacity = THREE.MathUtils.clamp(Math.abs(boat.speed) / boat.definition.maxSpeed, 0, 0.72);
    (boat.wakeLeft.material as THREE.MeshBasicMaterial).opacity = opacity;
    (boat.wakeRight.material as THREE.MeshBasicMaterial).opacity = opacity;
  }

  private destroyBoat(boat: Boat): void {
    boat.state = 'destroyed';
    boat.speed = 0;
    boat.destroyCooldown = RESPAWN_COOLDOWN;
    this.effects.spawnBoatImpact(boat.group.position, true);
    boat.group.visible = false;
    this.hud.hide();
    this.prompt.hide();
    if (this.controller.isMounted) {
      this.controller.setMounted(false);
      this.controller.setControlsEnabled(true);
      this.input.setMode('player');
      this.camera.setBoatMode(false);
      this.onBoatDestroyed();
    }
    this.hud.notify(`เรือแตก! เรียกใหม่ได้ใน ${RESPAWN_COOLDOWN} วินาที`, true);
  }

  private handleShopAction(action: BoatShopAction, boatId?: string): void {
    if (action === 'purchase' && boatId) {
      const result = this.progress.purchase(boatId);
      this.shop.setStatus(result.message, !result.ok);
      return;
    }
    if (action === 'select' && boatId) {
      const definition = getBoatDefinition(boatId);
      const ok = this.progress.select(boatId);
      this.shop.setStatus(ok && definition ? `เลือก ${definition.name} แล้ว` : 'ยังไม่ได้เป็นเจ้าของเรือลำนี้', !ok);
      return;
    }
    if (action === 'summon') {
      this.summonSelected();
      return;
    }
    if (action === 'store') {
      if (!this.active) return;
      if (this.active.state === 'piloted') {
        this.shop.setStatus('ลงจากเรือก่อนเก็บ', true);
        return;
      }
      this.scene.remove(this.active.group);
      this.active.dispose();
      this.active = null;
      this.shop.setStatus('เก็บเรือเข้าคลังแล้ว');
      return;
    }
    if (action === 'repair') {
      if (!this.active) return;
      this.active.hp = this.active.definition.maxHp;
      this.shop.setStatus('ซ่อมเรือเต็ม HP แล้ว');
    }
  }

  private summonSelected(): void {
    const id = this.progress.selectedBoatId;
    const definition = id ? getBoatDefinition(id) : undefined;
    if (!definition || !this.progress.owns(definition.id)) {
      this.shop.setStatus('เลือกหรือรับเรือก่อน', true);
      return;
    }
    if (this.active?.state === 'destroyed' && this.active.destroyCooldown > 0) {
      this.shop.setStatus(`รอซ่อมซากอีก ${Math.ceil(this.active.destroyCooldown)} วินาที`, true);
      return;
    }
    if (this.active) {
      this.scene.remove(this.active.group);
      this.active.dispose();
    }
    const dock = getDock(this.activeDockId) ?? getDock('starter-harbor')!;
    const spawn = dock.boatSpawn;
    const boat = new Boat(definition, this.textures, this.graphics);
    boat.heading = spawn.heading;
    boat.anchor = true;
    boat.state = 'docked';
    boat.group.position.set(
      spawn.x,
      WATER_LEVEL + getWaveHeight(spawn.x, spawn.z, this.elapsed) + 0.2,
      spawn.z,
    );
    this.scene.add(boat.group);
    this.active = boat;
    this.shop.setStatus(`เรียก ${definition.name} ที่${dock.name}แล้ว`);
    this.effects.spawnBoatImpact(boat.group.position);
  }
}
