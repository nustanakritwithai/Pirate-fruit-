import type { TouchControls } from '../ui/TouchControls';

/**
 * รวมสถานะ input ทั้งหมดไว้ที่เดียว (คีย์บอร์ด + เมาส์ + จอสัมผัส)
 * - คีย์บอร์ดอ่านจาก e.code (ตำแหน่งปุ่มจริง) จึงใช้ได้ทุก layout รวมถึงแป้นไทย
 * - เมาส์ใช้ pointer lock สำหรับหมุนกล้อง, ล้อเมาส์สำหรับซูม
 * - จอสัมผัส: รับค่าจาก TouchControls (จอยสติ๊ก + ปุ่มแบบ RoV)
 */
export class Input {
  private keys = new Set<string>();

  /** ระยะที่เมาส์/นิ้วขยับในเฟรมนี้ (รีเซ็ตทุกครั้งที่อ่านผ่าน consumeMouseDelta) */
  private mouseDX = 0;
  private mouseDY = 0;
  private wheelDelta = 0;
  private pointerLocked = false;
  private dragging = false;

  /** นับจำนวนครั้งที่สั่ง dash/โจมตี (edge trigger) รอให้ logic มาเก็บไป */
  private dashQueue = 0;
  private attackQueue = 0;

  private touch: TouchControls | null = null;

  constructor(domElement: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      // กันหน้าเว็บ scroll ด้วย Space / ลูกศร
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
      if (e.code === 'KeyQ' && !e.repeat) this.dashQueue++;
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    domElement.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (!this.pointerLocked) {
        domElement.requestPointerLock();
      } else {
        // คลิกซ้ายระหว่างล็อกเมาส์ = โจมตี
        this.attackQueue++;
      }
      this.dragging = true;
    });
    window.addEventListener('mouseup', () => (this.dragging = false));

    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === domElement;
    });

    window.addEventListener('mousemove', (e) => {
      if (this.pointerLocked || this.dragging) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      }
    });

    window.addEventListener('wheel', (e) => (this.wheelDelta += e.deltaY), { passive: true });
  }

  /** เชื่อมกับระบบปุ่มจอสัมผัส (เรียกครั้งเดียวตอนบูตเกม) */
  attachTouch(touch: TouchControls): void {
    this.touch = touch;
  }

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  /**
   * เวกเตอร์การเดินดิบ (-1..1 ต่อแกน, x = ขวา, z = หน้าจอลง = ถอยหลัง)
   * จอยสติ๊กให้ค่า analog, คีย์บอร์ดให้ -1/0/1
   */
  moveVector(): { x: number; z: number } {
    if (this.touch?.joystickActive) {
      return { x: this.touch.moveX, z: this.touch.moveZ };
    }
    let x = 0;
    let z = 0;
    if (this.isDown('KeyW') || this.isDown('ArrowUp')) z -= 1;
    if (this.isDown('KeyS') || this.isDown('ArrowDown')) z += 1;
    if (this.isDown('KeyA') || this.isDown('ArrowLeft')) x -= 1;
    if (this.isDown('KeyD') || this.isDown('ArrowRight')) x += 1;
    return { x, z };
  }

  get jump(): boolean {
    return this.isDown('Space') || (this.touch?.jumpHeld ?? false);
  }

  get sprint(): boolean {
    return this.isDown('ShiftLeft') || this.isDown('ShiftRight') || (this.touch?.sprintOn ?? false);
  }

  /** อ่านคำสั่ง dash หนึ่งครั้ง (คืน true ครั้งเดียวต่อการกด) */
  consumeDash(): boolean {
    const fromTouch = this.touch?.consumeDash() ?? false;
    if (fromTouch) return true;
    if (this.dashQueue > 0) {
      this.dashQueue = 0;
      return true;
    }
    return false;
  }

  /** อ่านคำสั่งโจมตีหนึ่งครั้ง */
  consumeAttack(): boolean {
    const fromTouch = this.touch?.consumeAttack() ?? false;
    if (fromTouch) return true;
    if (this.attackQueue > 0) {
      this.attackQueue = 0;
      return true;
    }
    return false;
  }

  /** ให้ TouchControls ป้อนการหมุนกล้องจากการลากนิ้ว */
  addCameraDelta(dx: number, dy: number): void {
    this.mouseDX += dx;
    this.mouseDY += dy;
  }

  /** อ่านค่าการหมุนเมาส์ของเฟรมนี้แล้วเคลียร์ทิ้ง */
  consumeMouseDelta(): { dx: number; dy: number } {
    const d = { dx: this.mouseDX, dy: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return d;
  }

  consumeWheelDelta(): number {
    const d = this.wheelDelta;
    this.wheelDelta = 0;
    return d;
  }
}
