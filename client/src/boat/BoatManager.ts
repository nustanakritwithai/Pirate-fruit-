import * as THREE from 'three';
import type { ThirdPersonCamera } from '../camera/ThirdPersonCamera';
import type { Effects } from '../effects/Effects';
import type { GraphicsProfile } from '../engine/GraphicsQuality';
import type { Input } from '../engine/Input';
import { getWaveHeight, SEA_BOUNDARY, WATER_LEVEL } from '../ocean/Ocean';
import type { CharacterController } from '../player/CharacterController';
import { BoatHUD } from '../ui/BoatHUD';
import { BoatShopUI, type BoatShopAction } from '../ui/BoatShopUI';
import { InteractionPrompt } from '../ui/InteractionPrompt';
import type { CollisionSystem, DynamicGroundProvider } from '../world/Collision';
import type { WorldTextures } from '../world/textures';
import { Boat } from './Boat';
import { getBoatDefinition, MAX_SAIL_LEVEL, SAIL_GEAR_RATIO } from './BoatData';
import { BoatProgress } from './BoatProgress';
import { carryRider, deckBoundsFor, deckHeightAt, withinDeck, worldToDeckLocal } from './DeckSpace';
import type { EconomyWallet } from '../progression/ProgressionTypes';
import { findDockAt, getDock, worldHeightAt } from '../island/IslandRegistry';
import { gameStorage, type GameStorage } from '../persistence/GameStorage';
import type { BoatWorldSnapshot, BoatIntentAction } from '@pirate-fruit/shared';

const BOOST_DURATION = 1.2;
const BOOST_COOLDOWN = 4;
const RESPAWN_COOLDOWN = 10;
const BOARD_RANGE = 4.8;
/** ระยะจากพวงมาลัยที่กด E ถือได้ */
const HELM_RANGE = 2.1;

/** สถานะผู้เล่นกับเรือ: นอกเรือ / เดินบนดาดฟ้า / ถือพวงมาลัย */
export type BoatRiderState = 'off' | 'deck' | 'helm';

export interface BoatAuthorityAdapter {
  connected(): boolean;
  send(action: BoatIntentAction, payload?: {
    entityId?: string; throttle?: number; steer?: number; anchor?: boolean; boost?: boolean;
    fireSide?: 'port' | 'starboard';
  }): string | null;
}

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
  private rider: BoatRiderState = 'off';
  private deckProvider: DynamicGroundProvider | null = null;
  private prevMatrix = new THREE.Matrix4();
  private prevHeading = 0;
  private gearArmed = true;
  private gearRepeat = 0;
  private authority: BoatAuthorityAdapter | null = null;
  private authorityEntityId: string | null = null;
  private authorityInputAccum = 0;
  private pendingSummonIntentId: string | null = null;
  private selectionListener: ((boatId: string) => void) | null = null;

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
    storage: GameStorage = gameStorage(),
  ) {
    this.progress = new BoatProgress(economy, storage);
    this.shop = new BoatShopUI(
      this.progress,
      () => this.active,
      (action, boatId) => this.handleShopAction(action, boatId),
    );
  }

  get activeBoat(): Boat | null {
    return this.active;
  }

  get riderState(): BoatRiderState {
    return this.rider;
  }

  get boostCooldownFraction(): number {
    return this.active?.boostCooldownFraction ?? 0;
  }

  get selectedBoatId(): string | null {
    return this.progress.selectedBoatId;
  }

  get shopOpen(): boolean {
    return this.shop.isOpen;
  }

  onSelectionChanged(listener: ((boatId: string) => void) | null): void {
    this.selectionListener = listener;
  }

  setAuthority(adapter: BoatAuthorityAdapter | null): void {
    this.authority = adapter;
    this.authorityEntityId = null;
  }

  private get authorityActive(): boolean {
    return this.authority?.connected() === true;
  }

  /** Absolute state from S17 Server; never accepts client-computed HP/position. */
  applyAuthoritativeBoat(snapshot: BoatWorldSnapshot, serverRider: BoatRiderState = 'off'): void {
    this.authorityEntityId = snapshot.entityId;
    let boat = this.active;
    if (boat && boat.definition.id !== snapshot.definitionId) {
      this.removeDeckProvider();
      this.scene.remove(boat.group);
      boat.dispose();
      this.active = null;
      boat = null;
    }
    if (!boat) {
      const definition = this.progress.getRuntimeDefinition(snapshot.definitionId)
        ?? getBoatDefinition(snapshot.definitionId);
      if (!definition) return;
      boat = new Boat(definition, this.textures, this.graphics);
      this.scene.add(boat.group);
      this.active = boat;
      this.ensureDeckProvider(boat);
    }
    boat.group.visible = snapshot.state !== 'sunk' && snapshot.state !== 'respawning';
    boat.group.position.x = snapshot.x;
    boat.group.position.z = snapshot.z;
    boat.heading = snapshot.heading;
    boat.group.rotation.y = snapshot.heading;
    boat.speed = snapshot.speed;
    boat.hp = snapshot.hp;
    boat.anchor = snapshot.anchor;
    if (serverRider !== this.rider) {
      this.rider = serverRider;
      const helm = serverRider === 'helm';
      this.controller.setMounted(helm);
      this.controller.setControlsEnabled(!helm);
      this.input.setMode(helm ? 'boat' : 'player');
      this.camera.setBoatMode(helm);
      if (serverRider !== 'off') {
        boat.group.updateMatrixWorld();
        this.placeRiderOnDeck(boat);
      }
    }
    if (snapshot.state !== 'sunk' && snapshot.state !== 'respawning') {
      boat.state = this.rider === 'helm'
        ? 'piloted'
        : Math.abs(snapshot.speed) > 0.15 ? 'spawned' : 'docked';
    }
  }

  handleAuthorityResult(result: { intentId: string; accepted: boolean; reason?: string }): void {
    if (result.intentId !== this.pendingSummonIntentId) return;
    this.pendingSummonIntentId = null;
    this.shop.setStatus(
      result.accepted ? 'Server ยืนยันการเรียกเรือแล้ว' : `เรียกเรือไม่สำเร็จ: ${result.reason ?? 'invalid'}`,
      !result.accepted,
    );
  }

  /** พาผู้เล่นกลับขึ้นดาดฟ้าเรือตัวเอง (หลังยึดเรือศัตรู) — คืน false ถ้าไม่มีเรือ */
  returnRiderToDeck(): boolean {
    const boat = this.active;
    if (!boat || boat.state === 'destroyed') return false;
    this.boardDeck(boat);
    return true;
  }

  /** โดนกระสุนปืนใหญ่ศัตรู (Naval Combat) — คืน true ถ้าโดนจริง */
  damageActiveBoat(amount: number): boolean {
    if (this.authorityActive) return false;
    const boat = this.active;
    if (!boat || boat.state === 'destroyed') return false;
    boat.damage(amount);
    this.hud.notify(`เรือโดนปืนใหญ่! -${amount} HP`, true);
    if (boat.hp <= 0) this.destroyBoat(boat);
    return true;
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
      this.removeDeckProvider();
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
    // ลงทะเบียนดาดฟ้าตั้งแต่เรือถูกเรียก เพื่อให้กระโดดจากน้ำขึ้นเรือได้
    // โดยไม่ต้องกดปุ่มขึ้นเรือซ้ำก่อน
    this.ensureDeckProvider(boat);

    const previousX = boat.group.position.x;
    const previousZ = boat.group.position.z;
    if (boat.state === 'piloted') {
      this.updatePiloted(boat, dt);
    } else if (!this.authorityActive) {
      this.updateIdle(boat, dt);
    }

    if (!this.authorityActive) {
      boat.group.position.x += Math.sin(boat.heading) * boat.speed * dt;
      boat.group.position.z += Math.cos(boat.heading) * boat.speed * dt;
      this.resolveCollision(boat, previousX, previousZ);
    }
    this.updateBuoyancy(boat, dt);
    this.updateWake(boat);
    this.updateSail(boat, dt);
    boat.group.updateMatrixWorld();

    if (this.rider === 'deck') this.updateDeckRider(boat);
    if (this.rider === 'off') this.updateBoardPrompt(boat);
    if (boat.state === 'piloted') this.syncRider(boat);

    // เก็บ transform ท้ายเฟรมไว้คำนวณ carry เฟรมถัดไป
    this.prevMatrix.copy(boat.group.matrixWorld);
    this.prevHeading = boat.heading;
  }

  /** ใบเรือหุบ/กางตามเกียร์ (pivot ขอบบน — หุบขึ้นหาคาน) */
  private updateSail(boat: Boat, dt: number): void {
    if (!boat.sail) return;
    const target = 0.14 + 0.86 * (boat.sailLevel / MAX_SAIL_LEVEL);
    boat.sail.scale.y = THREE.MathUtils.damp(boat.sail.scale.y, target, 5, dt);
  }

  /** ผู้เล่นบนดาดฟ้า: พาไปกับเรือ + ตรวจหลุดขอบ + พรอมป์พวงมาลัย */
  private updateDeckRider(boat: Boat): void {
    const position = this.controller.position;
    // moving platform carry — เรือเลื่อน/หมุน/โยกคลื่น ผู้เล่นไปด้วย
    carryRider(this.prevMatrix, boat.group.matrixWorld, position);
    this.controller.heading += boat.heading - this.prevHeading;

    const local = worldToDeckLocal(boat.group.matrixWorld, position.x, position.y, position.z, this.tempPosition);
    const bounds = deckBoundsFor(boat.definition);
    if (!withinDeck(bounds, local.x, local.z) || local.y < -0.6) {
      // เดิน/กระโดดพ้นขอบดาดฟ้า → ปล่อยตกน้ำหรือลงท่า (ว่ายน้ำ/พื้นเดิมรับต่อ)
      this.setRiderOff();
      return;
    }

    // ใกล้พวงมาลัย → เสนอถือพวงมาลัย
    this.tempPosition.set(0, 1.02, -boat.definition.length * 0.21);
    boat.group.localToWorld(this.tempPosition);
    if (position.distanceTo(this.tempPosition) <= HELM_RANGE) {
      this.prompt.showAction('ถือพวงมาลัย', boat.definition.name, '☸');
      if (this.input.consumeInteract() || this.prompt.consumeRequested()) this.takeHelm(boat);
    } else {
      this.prompt.hide();
    }
  }

  private setRiderOff(): void {
    if (this.authorityActive && this.rider !== 'off') {
      this.authority!.send('disembark', { entityId: this.authorityEntityId ?? undefined });
    }
    this.rider = 'off';
    this.prompt.hide();
  }

  /** พื้นดาดฟ้าต้องมีอยู่ตลอดอายุเรือ เพื่อรับผู้เล่นที่กระโดดจากน้ำขึ้นมา */
  private ensureDeckProvider(boat: Boat): void {
    if (this.deckProvider) return;
    const bounds = deckBoundsFor(boat.definition);
    const provider: DynamicGroundProvider = (x, z) => {
      const active = this.active;
      if (!active || active !== boat || active.state === 'destroyed') return null;
      return deckHeightAt(active.group.matrixWorld, bounds, active.group.position.y, x, z);
    };
    this.deckProvider = provider;
    this.collision.addDynamicGround(provider);
  }

  private removeDeckProvider(): void {
    if (!this.deckProvider) return;
    this.collision.removeDynamicGround(this.deckProvider);
    this.deckProvider = null;
  }

  private updatePiloted(boat: Boat, dt: number): void {
    this.prompt.showAction('ปล่อยพวงมาลัย', boat.definition.name, '☸');
    if (this.input.consumeInteract() || this.prompt.consumeRequested()) {
      this.leaveHelm(boat);
      return;
    }

    if (this.input.consumeAnchor()) {
      boat.anchor = !boat.anchor;
      if (this.authorityActive) this.authority!.send('input', { entityId: this.authorityEntityId ?? undefined, anchor: boat.anchor });
      this.hud.notify(boat.anchor ? '⚓ ทอดสมอแล้ว' : 'ยกสมอแล้ว');
    }

    const boostRequested = (this.input.consumeDash() || this.input.sprint)
      && boat.boostCooldown <= 0 && !boat.anchor;
    if (boostRequested) {
      boat.boostTimer = BOOST_DURATION;
      boat.boostCooldown = BOOST_COOLDOWN;
      this.hud.notify('⚡ Boost!');
    }

    const move = this.input.moveVector();
    const throttle = THREE.MathUtils.clamp(-move.z, -1, 1);
    const steering = THREE.MathUtils.clamp(move.x, -1, 1);

    if (this.authorityActive) {
      this.authorityInputAccum += dt;
      if (this.authorityInputAccum >= 0.1) {
        this.authorityInputAccum = 0;
        this.authority!.send('input', {
          entityId: this.authorityEntityId ?? undefined,
          throttle,
          steer: steering,
          anchor: boat.anchor,
          boost: boostRequested,
        });
      }
      const cannon = this.input.consumeCannon();
      if (cannon === 1 || cannon === 2) {
        this.authority!.send('fire', {
          entityId: this.authorityEntityId ?? undefined,
          fireSide: cannon === 1 ? 'port' : 'starboard',
        });
      }
      return;
    }

    // ---------- เกียร์ใบเรือ 0-3: ดันหน้า +1 / ดึงหลัง -1 (edge + repeat ตอนค้าง) ----------
    this.gearRepeat -= dt;
    if (Math.abs(throttle) < 0.35) {
      this.gearArmed = true;
      this.gearRepeat = 0;
    } else if (this.gearArmed || this.gearRepeat <= 0) {
      const next = THREE.MathUtils.clamp(boat.sailLevel + (throttle > 0 ? 1 : -1), 0, MAX_SAIL_LEVEL);
      if (next !== boat.sailLevel) {
        boat.sailLevel = next;
        this.hud.notify(next === 0 ? '⛵ เก็บใบเรือ' : `⛵ ใบเรือระดับ ${next}/${MAX_SAIL_LEVEL}`);
      }
      this.gearArmed = false;
      this.gearRepeat = 0.5;
    }

    // ---------- ความเร็วเข้าหาเป้าของเกียร์ (เกียร์ 0 + ดึงหลังค้าง = ถอย) ----------
    const reversing = boat.sailLevel === 0 && throttle < -0.35 && !boat.anchor;
    const target = boat.anchor
      ? 0
      : reversing
        ? -boat.definition.reverseSpeed
        : boat.definition.maxSpeed *
          SAIL_GEAR_RATIO[boat.sailLevel] *
          (boat.boostTimer > 0 ? 1.35 : 1);
    if (boat.speed < target) {
      boat.speed = Math.min(
        target,
        boat.speed + boat.definition.acceleration * (boat.boostTimer > 0 ? 1.7 : 1) * dt,
      );
    } else if (reversing) {
      boat.speed = Math.max(target, boat.speed - boat.definition.acceleration * 0.8 * dt);
    } else {
      const damping = boat.anchor ? boat.definition.brakePower : boat.definition.drag * 2.2;
      boat.speed = THREE.MathUtils.damp(boat.speed, target, damping, dt);
    }

    // ---------- เลี้ยวแบบมีความเฉื่อยเชิงมุม (หางเสือหนืด) ----------
    const turnFactor = THREE.MathUtils.clamp(Math.abs(boat.speed) / 3, 0.12, 1);
    const reverseDirection = boat.speed < 0 ? -1 : 1;
    // โยกขวา (steering > 0) = เลี้ยวขวา — heading เพิ่มขึ้นหมุนหัวเรือไปทางซ้าย จึงต้องลบ
    const targetTurn = steering * boat.definition.turnSpeed * turnFactor * reverseDirection;
    boat.turnVelocity = THREE.MathUtils.damp(boat.turnVelocity, targetTurn, 5, dt);
    boat.heading -= boat.turnVelocity * dt;
    // เลี้ยวแรงเสียความเร็วเล็กน้อย (แรงต้านน้ำ)
    boat.speed *= 1 - Math.min(0.3, Math.abs(boat.turnVelocity) * 0.22) * dt;
  }

  private updateIdle(boat: Boat, dt: number): void {
    const damping = boat.anchor ? boat.definition.brakePower : boat.definition.drag * 1.8;
    boat.speed = THREE.MathUtils.damp(boat.speed, 0, damping, dt);
    // หางเสือคลายตัวตามความเฉื่อย — ปล่อยพวงมาลัยแล้วเรือยังเบนต่อเล็กน้อย
    boat.turnVelocity = THREE.MathUtils.damp(boat.turnVelocity, 0, 3, dt);
    boat.heading -= boat.turnVelocity * dt;
    if (findDockAt(boat.group.position.x, boat.group.position.z) && Math.abs(boat.speed) < 0.25) {
      boat.state = 'docked';
    } else if (boat.state === 'docked') {
      boat.state = 'spawned';
    }
  }

  private updateBoardPrompt(boat: Boat): void {
    if (this.shop.isOpen) {
      this.prompt.hide();
      return;
    }
    // เมื่อลงบนผิวดาดฟ้าจริงจากการกระโดด ให้ขึ้นเรือทันที ไม่ต้องกด E
    if (this.tryAutoBoard(boat)) return;
    const distance = this.controller.position.distanceTo(boat.group.position);
    if (distance > BOARD_RANGE) {
      this.prompt.hide();
      return;
    }
    this.prompt.showAction('ขึ้น', boat.definition.name, '⛵');
    if (this.input.consumeInteract() || this.prompt.consumeRequested()) this.boardDeck(boat);
  }

  private tryAutoBoard(boat: Boat): boolean {
    const position = this.controller.position;
    const bounds = deckBoundsFor(boat.definition);
    const deckY = deckHeightAt(
      boat.group.matrixWorld,
      bounds,
      boat.group.position.y,
      position.x,
      position.z,
    );
    if (deckY === null) return false;

    const landedOnDeck =
      position.y >= deckY - 0.12 &&
      position.y <= deckY + 0.3 &&
      (this.controller.moveState.onGround || this.controller.verticalSpeed <= 0);
    if (!landedOnDeck) return false;

    this.boardDeck(boat, true);
    return true;
  }

  /** ขึ้นเรือ = ยืนบนดาดฟ้า เดินได้อิสระ (ยังไม่บังคับเรือ) */
  private boardDeck(boat: Boat, preservePosition = false): void {
    boat.group.updateMatrixWorld();
    this.ensureDeckProvider(boat);
    if (!preservePosition) this.placeRiderOnDeck(boat);
    this.rider = 'deck';
    if (this.authorityActive) this.authority!.send('board', { entityId: this.authorityEntityId ?? undefined });
    this.prevMatrix.copy(boat.group.matrixWorld);
    this.prevHeading = boat.heading;
    this.prompt.hide();
    this.hud.notify('ขึ้นเรือแล้ว — เดินไปที่พวงมาลัย ☸ แล้วกด E เพื่อบังคับเรือ');
  }

  /** ถือพวงมาลัย = โหมดขับเรือ (ล็อกตัวละครที่พวงมาลัย) */
  private takeHelm(boat: Boat): void {
    if (this.authorityActive) {
      this.authority!.send('take-helm', { entityId: this.authorityEntityId ?? undefined });
      this.prompt.hide();
      return;
    }
    boat.state = 'piloted';
    boat.anchor = false;
    this.rider = 'helm';
    this.controller.setMounted(true);
    this.controller.setControlsEnabled(false);
    this.input.setMode('boat');
    this.camera.setBoatMode(true);
    this.hud.show(boat);
    this.prompt.hide();
    this.syncRider(boat);
  }

  /** ปล่อยพวงมาลัย = กลับไปเดินบนดาดฟ้า (เรือแล่นต่อด้วยความเฉื่อย) */
  private leaveHelm(boat: Boat): void {
    if (this.authorityActive) {
      this.authority!.send('leave-helm', { entityId: this.authorityEntityId ?? undefined });
      this.prompt.hide();
      return;
    }
    boat.state = findDockAt(boat.group.position.x, boat.group.position.z) ? 'docked' : 'spawned';
    this.rider = 'deck';
    this.controller.setMounted(false);
    this.controller.setControlsEnabled(true);
    this.input.setMode('player');
    this.camera.setBoatMode(false);
    boat.group.updateMatrixWorld();
    this.placeRiderOnDeck(boat);
    this.prevMatrix.copy(boat.group.matrixWorld);
    this.prevHeading = boat.heading;
    this.hud.hide();
    this.prompt.hide();
    if (Math.abs(boat.speed) > 0.5) this.hud.notify('ปล่อยพวงมาลัย — เรือแล่นต่อตามความเฉื่อย');
  }

  /** วางผู้เล่นบนดาดฟ้า (หลังพวงมาลัยเล็กน้อย) */
  private placeRiderOnDeck(boat: Boat): void {
    const bounds = deckBoundsFor(boat.definition);
    this.tempPosition.set(0, bounds.deckTopLocalY + 0.04, -boat.definition.length * 0.05);
    boat.group.localToWorld(this.tempPosition);
    this.controller.teleport(this.tempPosition.x, this.tempPosition.y, this.tempPosition.z);
    this.controller.heading = boat.heading;
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
    if (!hit && Math.hypot(boat.group.position.x, boat.group.position.z) < SEA_BOUNDARY) return;
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
    // ผู้เล่นที่ยืนบนดาดฟ้า → เรือหายใต้เท้า ตกน้ำตามธรรมชาติ
    this.setRiderOff();
    this.removeDeckProvider();
    this.hud.notify(`เรือแตก! เรียกใหม่ได้ใน ${RESPAWN_COOLDOWN} วินาที`, true);
  }

  private handleShopAction(action: BoatShopAction, boatId?: string): void {
    if (action === 'purchase' && boatId) {
      const result = this.progress.purchase(boatId);
      if (result.ok && this.progress.selectedBoatId) this.selectionListener?.(this.progress.selectedBoatId);
      this.shop.setStatus(result.message, !result.ok);
      return;
    }
    if (action === 'select' && boatId) {
      const definition = getBoatDefinition(boatId);
      const ok = this.progress.select(boatId);
      if (ok) this.selectionListener?.(boatId);
      this.shop.setStatus(ok && definition ? `เลือก ${definition.name} แล้ว` : 'ยังไม่ได้เป็นเจ้าของเรือลำนี้', !ok);
      return;
    }
    if (action === 'summon') {
      this.summonSelected();
      return;
    }
    if (action === 'store') {
      if (!this.active) return;
      if (this.active.state === 'piloted' || this.rider !== 'off') {
        this.shop.setStatus('ลงจากเรือก่อนเก็บ', true);
        return;
      }
      this.removeDeckProvider();
      this.scene.remove(this.active.group);
      this.active.dispose();
      this.active = null;
      this.shop.setStatus('เก็บเรือเข้าคลังแล้ว');
      return;
    }
    if (action === 'repair') {
      if (!this.active) return;
      if (this.authorityActive) {
        this.shop.setStatus('การซ่อมเรืออยู่ภายใต้ Server — กลับท่าเพื่อรอระบบซ่อม', true);
        return;
      }
      this.active.hp = this.active.definition.maxHp;
      this.shop.setStatus('ซ่อมเรือเต็ม HP แล้ว');
      return;
    }
    if ((action === 'upgrade-hull' || action === 'upgrade-cannon' || action === 'upgrade-sail') && boatId) {
      const kind = action.replace('upgrade-', '') as 'hull' | 'cannon' | 'sail';
      const result = this.progress.upgrade(boatId, kind);
      this.shop.setStatus(
        result.ok ? `${result.message} — เรียกเรือใหม่เพื่อใช้ค่าอัปเกรด` : result.message,
        !result.ok,
      );
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
    if (this.authorityActive) {
      this.pendingSummonIntentId = this.authority!.send('summon');
      this.shop.setStatus(this.pendingSummonIntentId ? 'กำลังขอ Server เรียกเรือ…' : 'ยังไม่ได้เชื่อมต่อ Server', !this.pendingSummonIntentId);
      return;
    }
    if (this.active) {
      this.setRiderOff();
      this.removeDeckProvider();
      this.scene.remove(this.active.group);
      this.active.dispose();
    }
    const dock = getDock(this.activeDockId) ?? getDock('starter-harbor')!;
    const spawn = dock.boatSpawn;
    const runtimeDefinition = this.progress.getRuntimeDefinition(definition.id) ?? definition;
    const boat = new Boat(runtimeDefinition, this.textures, this.graphics);
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
    boat.group.updateMatrixWorld();
    this.ensureDeckProvider(boat);
    this.shop.setStatus(`เรียก ${definition.name} ที่${dock.name}แล้ว`);
    this.effects.spawnBoatImpact(boat.group.position);
  }
}
