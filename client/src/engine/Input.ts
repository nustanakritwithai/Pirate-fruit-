/**
 * รวมสถานะ input ทั้งหมดไว้ที่เดียว
 * - คีย์บอร์ดอ่านจาก e.code (ตำแหน่งปุ่มจริง) จึงใช้ได้ทุก layout รวมถึงแป้นไทย
 * - เมาส์ใช้ pointer lock สำหรับหมุนกล้อง, ล้อเมาส์สำหรับซูม
 */
export class Input {
  private keys = new Set<string>();

  /** ระยะที่เมาส์ขยับในเฟรมนี้ (รีเซ็ตทุกครั้งที่อ่านผ่าน consumeMouseDelta) */
  private mouseDX = 0;
  private mouseDY = 0;
  private wheelDelta = 0;
  private pointerLocked = false;
  private dragging = false;

  constructor(domElement: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      // กันหน้าเว็บ scroll ด้วย Space / ลูกศร
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    domElement.addEventListener('mousedown', (e) => {
      if (e.button === 0 && !this.pointerLocked) {
        domElement.requestPointerLock();
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

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  get forward(): boolean {
    return this.isDown('KeyW') || this.isDown('ArrowUp');
  }
  get backward(): boolean {
    return this.isDown('KeyS') || this.isDown('ArrowDown');
  }
  get left(): boolean {
    return this.isDown('KeyA') || this.isDown('ArrowLeft');
  }
  get right(): boolean {
    return this.isDown('KeyD') || this.isDown('ArrowRight');
  }
  get jump(): boolean {
    return this.isDown('Space');
  }
  get sprint(): boolean {
    return this.isDown('ShiftLeft') || this.isDown('ShiftRight');
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
