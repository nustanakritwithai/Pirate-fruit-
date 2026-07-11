import * as THREE from 'three';
import type { Input } from '../engine/Input';

const MOUSE_SENSITIVITY = 0.0028;
const MIN_PITCH = -0.2; // เงยต่ำสุด
const MAX_PITCH = 1.35; // ก้มสูงสุด (มองลงจากด้านบน)
const MIN_DIST = 3;
const MAX_DIST = 14;

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

  constructor(
    private camera: THREE.PerspectiveCamera,
    private input: Input,
    private getTarget: () => THREE.Vector3,
  ) {}

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

    // จุดที่กล้องมอง: ระดับหน้าอกของตัวละคร
    const target = this.getTarget().clone();
    target.y += 1.5;

    const horiz = Math.cos(this.pitch) * this.distance;
    const idealPos = new THREE.Vector3(
      target.x + Math.sin(this.yaw) * horiz,
      target.y + Math.sin(this.pitch) * this.distance,
      target.z + Math.cos(this.yaw) * horiz,
    );

    // กันกล้องมุดใต้พื้นน้ำ/พื้นดินแบบหยาบๆ
    idealPos.y = Math.max(idealPos.y, 0.5);

    if (!this.initialized) {
      this.currentPos.copy(idealPos);
      this.initialized = true;
    } else {
      // หน่วงกล้องเล็กน้อยให้ลื่น
      this.currentPos.lerp(idealPos, Math.min(1, dt * 10));
    }

    this.camera.position.copy(this.currentPos);
    this.camera.lookAt(target);
  }
}
