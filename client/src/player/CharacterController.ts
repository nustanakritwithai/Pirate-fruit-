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

export interface MoveState {
  /** ความเร็วแนวราบปัจจุบัน (m/s) ใช้เลือก animation */
  speed: number;
  onGround: boolean;
  sprinting: boolean;
}

/**
 * ตัวควบคุมการเคลื่อนที่ของผู้เล่น: เดิน วิ่ง กระโดด sprint แรงโน้มถ่วง และการชน
 * ทิศทางการเดินอิงมุมกล้อง (กด W = เดินไปทางที่กล้องหัน)
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
  private state: MoveState = { speed: 0, onGround: true, sprinting: false };

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

  teleport(x: number, y: number, z: number): void {
    this.position.set(x, y, z);
    this.verticalVelocity = 0;
  }

  update(dt: number): void {
    // ---------- ทิศทางจาก input (สัมพัทธ์กับกล้อง) ----------
    let ix = 0;
    let iz = 0;
    if (this.input.forward) iz -= 1;
    if (this.input.backward) iz += 1;
    if (this.input.left) ix -= 1;
    if (this.input.right) ix += 1;
    const hasInput = ix !== 0 || iz !== 0;

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

    // ---------- เคลื่อนที่แนวราบ ----------
    let speed = 0;
    if (hasInput) {
      const yaw = this.getCameraYaw();
      // หมุนเวกเตอร์ input ตามมุมกล้อง
      const sin = Math.sin(yaw);
      const cos = Math.cos(yaw);
      let dx = ix * cos + iz * sin;
      let dz = -ix * sin + iz * cos;
      const len = Math.hypot(dx, dz);
      dx /= len;
      dz /= len;

      speed = sprinting ? SPRINT_SPEED : WALK_SPEED;
      this.position.x += dx * speed * dt;
      this.position.z += dz * speed * dt;

      // ค่อยๆ หมุนตัวละครไปทางที่เดิน
      const targetHeading = Math.atan2(dx, dz);
      let diff = targetHeading - this.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.heading += diff * Math.min(1, dt * 12);
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

    this.state = { speed, onGround: this.onGround, sprinting };
  }
}
