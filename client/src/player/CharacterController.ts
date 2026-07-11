import * as THREE from 'three';
import type { Input } from '../engine/Input';
import type { CollisionSystem } from '../world/Collision';
import { WATER_LEVEL } from '../world/World';

const WALK_SPEED = 4;
const SPRINT_SPEED = 8;
const JUMP_SPEED = 8.5;
const GRAVITY = 25;

const ENERGY_MAX = 100;
const ENERGY_DRAIN = 22; // ต่อวินาที ตอน sprint
const ENERGY_REGEN = 16; // ต่อวินาที ตอนไม่ sprint
/** ถ้าพลังหมด ต้องฟื้นถึงค่านี้ก่อนถึงจะ sprint ได้อีก */
const ENERGY_RECOVER_THRESHOLD = 25;

// พุ่งหลบ (ติดตัวทุกคน ใช้ได้ตั้งแต่ Phase 1)
const DASH_SPEED = 22;
const DASH_DURATION = 0.18;
const DASH_COOLDOWN = 2.2;
const DASH_ENERGY_COST = 12;

export interface MoveState {
  /** ความเร็วแนวราบปัจจุบัน (m/s) ใช้เลือก animation */
  speed: number;
  onGround: boolean;
  sprinting: boolean;
  dashing: boolean;
}

/**
 * ตัวควบคุมการเคลื่อนที่ของผู้เล่น: เดิน วิ่ง กระโดด sprint พุ่งหลบ
 * แรงโน้มถ่วง และการชน — ทิศทางการเดินอิงมุมกล้อง (กด W = เดินไปทางที่กล้องหัน)
 * รองรับ input แบบ analog จากจอยสติ๊กเสมือน (ขนาดเวกเตอร์คุมความเร็ว)
 */
export class CharacterController {
  readonly position = new THREE.Vector3();
  /** มุมหันของตัวละคร (radian รอบแกน Y) */
  heading = 0;

  hp = 100;
  readonly hpMax = 100;
  energy = ENERGY_MAX;
  readonly energyMax = ENERGY_MAX;

  private verticalVelocity = 0;
  private onGround = false;
  private exhausted = false;
  private state: MoveState = { speed: 0, onGround: true, sprinting: false, dashing: false };

  private dashTimer = 0;
  private dashCooldownTimer = 0;
  private dashDir = new THREE.Vector3(0, 0, 1);

  /** เรียกเมื่อผู้เล่นจมน้ำ/ตกขอบโลก เพื่อให้ระบบภายนอกพากลับจุดเซฟ */
  onDrown: (() => void) | null = null;

  constructor(
    private input: Input,
    private collision: CollisionSystem,
    private getCameraYaw: () => number,
  ) {}

  get moveState(): MoveState {
    return this.state;
  }

  /** สัดส่วนคูลดาวน์พุ่งหลบที่เหลือ 0..1 (0 = พร้อมใช้) สำหรับวาดวงแหวนบนปุ่ม */
  get dashCooldownFraction(): number {
    return Math.max(0, this.dashCooldownTimer) / DASH_COOLDOWN;
  }

  teleport(x: number, y: number, z: number): void {
    this.position.set(x, y, z);
    this.verticalVelocity = 0;
    this.dashTimer = 0;
  }

  update(dt: number): void {
    // ---------- ทิศทางจาก input (สัมพัทธ์กับกล้อง) ----------
    const raw = this.input.moveVector();
    let mag = Math.min(1, Math.hypot(raw.x, raw.z));
    if (mag < 0.15) mag = 0; // deadzone จอยสติ๊ก
    const hasInput = mag > 0;

    const yaw = this.getCameraYaw();
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    // หมุนเวกเตอร์ input ตามมุมกล้อง (ทิศหน่วย)
    let dirX = 0;
    let dirZ = 0;
    if (hasInput) {
      dirX = raw.x * cos + raw.z * sin;
      dirZ = -raw.x * sin + raw.z * cos;
      const len = Math.hypot(dirX, dirZ);
      dirX /= len;
      dirZ /= len;
    }

    // ---------- Sprint + Energy ----------
    const wantSprint = this.input.sprint && hasInput;
    if (this.exhausted && this.energy >= ENERGY_RECOVER_THRESHOLD) this.exhausted = false;
    const sprinting = wantSprint && !this.exhausted && this.energy > 0;

    if (sprinting) {
      this.energy = Math.max(0, this.energy - ENERGY_DRAIN * dt);
      if (this.energy === 0) this.exhausted = true;
    } else {
      this.energy = Math.min(ENERGY_MAX, this.energy + ENERGY_REGEN * dt);
    }

    // ---------- พุ่งหลบ (Dash) ----------
    this.dashCooldownTimer = Math.max(0, this.dashCooldownTimer - dt);
    if (
      this.input.consumeDash() &&
      this.dashCooldownTimer === 0 &&
      this.energy >= DASH_ENERGY_COST
    ) {
      this.energy -= DASH_ENERGY_COST;
      this.dashTimer = DASH_DURATION;
      this.dashCooldownTimer = DASH_COOLDOWN;
      // พุ่งไปทางที่กำลังเดิน ถ้ายืนเฉยๆ พุ่งไปทางที่ตัวละครหันหน้า
      if (hasInput) {
        this.dashDir.set(dirX, 0, dirZ);
      } else {
        this.dashDir.set(Math.sin(this.heading), 0, Math.cos(this.heading));
      }
    }
    const dashing = this.dashTimer > 0;

    // ---------- เคลื่อนที่แนวราบ ----------
    let speed = 0;
    if (dashing) {
      this.dashTimer -= dt;
      speed = DASH_SPEED;
      this.position.x += this.dashDir.x * DASH_SPEED * dt;
      this.position.z += this.dashDir.z * DASH_SPEED * dt;
      this.faceToward(this.dashDir.x, this.dashDir.z, dt, 20);
    } else if (hasInput) {
      speed = (sprinting ? SPRINT_SPEED : WALK_SPEED) * mag;
      this.position.x += dirX * speed * dt;
      this.position.z += dirZ * speed * dt;
      this.faceToward(dirX, dirZ, dt, 12);
    }

    // ---------- แรงโน้มถ่วง + กระโดด ----------
    if (this.onGround && this.input.jump) {
      this.verticalVelocity = JUMP_SPEED;
      this.onGround = false;
    }
    this.verticalVelocity -= GRAVITY * dt;
    this.position.y += this.verticalVelocity * dt;

    // ---------- ชนพื้น (จากสูตรความสูงของเกาะ) ----------
    const ground = this.collision.heightAt(this.position.x, this.position.z);
    if (this.position.y <= ground) {
      this.position.y = ground;
      this.verticalVelocity = 0;
      this.onGround = true;
    } else if (this.position.y - ground > 0.05) {
      this.onGround = false;
    }

    // ---------- ชนสิ่งกีดขวาง ----------
    this.collision.resolveObstacles(this.position);

    // ---------- จมน้ำ ----------
    if (this.position.y < WATER_LEVEL - 1.2) {
      this.onDrown?.();
    }

    this.state = { speed, onGround: this.onGround, sprinting, dashing };
  }

  /** ค่อยๆ หมุนตัวละครไปทางทิศ (dx, dz) */
  private faceToward(dx: number, dz: number, dt: number, rate: number): void {
    const targetHeading = Math.atan2(dx, dz);
    let diff = targetHeading - this.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.heading += diff * Math.min(1, dt * rate);
  }
}
