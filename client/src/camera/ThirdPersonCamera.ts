import * as THREE from 'three';
import type { Input } from '../engine/Input';

const MOUSE_SENSITIVITY = 0.0028;
const MIN_PITCH = -0.2; // เงยต่ำสุด
const MAX_PITCH = 1.35; // ก้มสูงสุด (มองลงจากด้านบน)
const MIN_DIST = 3;
const MAX_DIST = 20;
const TOUCH_ZOOM_STEP = 1.5;
const BOAT_CAMERA_DISTANCE = 15;

/**
 * กล้อง Third Person: ตามหลังผู้เล่น หมุนด้วยเมาส์ ซูมด้วยล้อเมาส์
 * yaw = 0 หมายถึงกล้องอยู่ทาง +Z ของผู้เล่น (มองไปทาง -Z)
 */
export class ThirdPersonCamera {
  yaw = 0;
  pitch = 0.35;
  distance = 7;

  private currentPos = new THREE.Vector3();
  private initialized = false;
  private playerDistance = 7;
  private targetHeight = 1.5;
  private boatMode = false;

  constructor(
    private camera: THREE.PerspectiveCamera,
    private input: Input,
    private getTarget: () => THREE.Vector3,
    private heightAt?: (x: number, z: number) => number,
  ) {}

  setBoatMode(enabled: boolean): void {
    this.boatMode = enabled;
    if (enabled) {
      this.playerDistance = this.distance;
      this.distance = BOAT_CAMERA_DISTANCE;
      this.targetHeight = 1.35;
      this.pitch = Math.max(this.pitch, 0.25);
    } else {
      this.distance = THREE.MathUtils.clamp(this.playerDistance, MIN_DIST, MAX_DIST);
      this.targetHeight = 1.5;
    }
  }

  update(dt: number): void {
    const { dx, dy } = this.input.consumeMouseDelta();
    this.yaw -= dx * MOUSE_SENSITIVITY;
    this.pitch = THREE.MathUtils.clamp(
      this.pitch + dy * MOUSE_SENSITIVITY,
      MIN_PITCH,
      MAX_PITCH,
    );

    const wheel = this.input.consumeWheelDelta();
    this.distance = THREE.MathUtils.clamp(this.distance + wheel * 0.01, MIN_DIST, MAX_DIST);
    if (wheel !== 0 && this.boatMode) this.playerDistance = this.distance;
    const zoom = this.input.consumeZoom();
    if (zoom !== 0) {
      this.distance = THREE.MathUtils.clamp(
        this.distance - zoom * TOUCH_ZOOM_STEP,
        MIN_DIST,
        MAX_DIST,
      );
      if (this.boatMode) this.playerDistance = this.distance;
    }

    // จุดที่กล้องมอง: ระดับหน้าอกของตัวละคร
    const target = this.getTarget().clone();
    target.y += this.targetHeight;

    const horiz = Math.cos(this.pitch) * this.distance;
    const idealPos = new THREE.Vector3(
      target.x + Math.sin(this.yaw) * horiz,
      target.y + Math.sin(this.pitch) * this.distance,
      target.z + Math.cos(this.yaw) * horiz,
    );

    // Keep the camera above the actual procedural terrain, not only sea level.
    const groundY = this.heightAt?.(idealPos.x, idealPos.z) ?? 0;
    idealPos.y = Math.max(idealPos.y, groundY + 0.35, 0.5);

    if (!this.initialized) {
      this.currentPos.copy(idealPos);
      this.initialized = true;
    } else {
      // หน่วงกล้องเล็กน้อยให้ลื่น
      this.currentPos.lerp(idealPos, Math.min(1, dt * 10));
    }
    const currentGroundY = this.heightAt?.(this.currentPos.x, this.currentPos.z) ?? 0;
    this.currentPos.y = Math.max(this.currentPos.y, currentGroundY + 0.35, 0.5);

    this.camera.position.copy(this.currentPos);
    this.camera.lookAt(target);
  }
}
