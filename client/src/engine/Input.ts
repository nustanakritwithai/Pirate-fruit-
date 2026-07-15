import type { SkillAimCommand, SkillAimPreview, TouchControls } from '../ui/TouchControls';

export type ControlMode = 'player' | 'boat';

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
  private interactQueue = 0;
  private anchorQueue = 0;
  private cannonQueue = 0; // 1 = ยิงกราบซ้าย, 2 = ยิงกราบขวา (เฉพาะโหมดเรือ)
  private skillQueue = 0; // 1-3 = สกิลที่กด, 0 = ไม่มี
  private ultimateQueue = 0;
  private zoomQueue = 0;
  private weaponSwitchQueue = 0;
  private potionQueue = 0; // 1-2 = ช่องลัดยาที่กด, 0 = ไม่มี
  private mode: ControlMode = 'player';

  private touch: TouchControls | null = null;

  constructor(domElement: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      // กันหน้าเว็บ scroll ด้วย Space / ลูกศร
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
      if (e.code === 'KeyQ' && !e.repeat) this.dashQueue++;
      if (e.code === 'KeyE' && !e.repeat) this.interactQueue++;
      if (e.code === 'Space' && !e.repeat) this.anchorQueue++;
      if (e.code === 'KeyR' && !e.repeat) this.weaponSwitchQueue++;
      if (!e.repeat && (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3')) {
        // โหมดเรือ: 1/2 = ยิงปืนใหญ่กราบซ้าย/ขวา แทนสกิล
        if (this.mode === 'boat' && e.code !== 'Digit3') {
          this.cannonQueue = Number(e.code.slice(-1));
        } else {
          this.skillQueue = Number(e.code.slice(-1));
        }
      }
      if (!e.repeat && (e.code === 'Digit4' || e.code === 'KeyG')) this.ultimateQueue++;
      if (!e.repeat && e.code === 'KeyZ') this.potionQueue = 1;
      if (!e.repeat && e.code === 'KeyX') this.potionQueue = 2;
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
    touch.setMode(this.mode);
  }

  setMode(mode: ControlMode): void {
    this.mode = mode;
    this.anchorQueue = 0;
    this.dashQueue = 0;
    this.cannonQueue = 0;
    this.zoomQueue = 0;
    this.touch?.setMode(mode);
  }

  get controlMode(): ControlMode {
    return this.mode;
  }

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  /**
   * เวกเตอร์การเดินดิบ (-1..1 ต่อแกน, x = ขวา, z = หน้าจอลง = ถอยหลัง)
   * จอยสติ๊กให้ค่า analog, คีย์บอร์ดให้ -1/0/1
   */
  moveVector(): { x: number; z: number } {
    // หลังล็อก auto-run ผู้เล่นปล่อยจอยได้ แต่ยังวิ่งตรงไปข้างหน้าเอง
    if (this.touch?.autoRun && this.mode === 'player') {
      return { x: 0, z: -1 };
    }
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

  /** ถือ Block อยู่ไหม (F บน PC / ปุ่ม 🛡 บนมือถือ) */
  get block(): boolean {
    return this.isDown('KeyF') || (this.touch?.blockHeld ?? false);
  }

  /** อ่านสกิลที่กดหนึ่งครั้ง คืน 1-3 หรือ 0 ถ้าไม่มี */
  consumeSkill(): number {
    const command = this.consumeSkillAim();
    return command?.slot ?? 0;
  }

  consumeSkillAim(): SkillAimCommand | null {
    const fromTouch = this.touch?.consumeSkillAim() ?? null;
    if (fromTouch) return fromTouch;
    const n = this.skillQueue;
    this.skillQueue = 0;
    return n > 0 ? { slot: n } : null;
  }

  getSkillAimPreview(): SkillAimPreview | null {
    return this.touch?.getSkillAimPreview() ?? null;
  }

  /** อ่านช่องลัดใช้ยาที่กดหนึ่งครั้ง คืน 1-2 หรือ 0 (Z/X บน PC / ปุ่มยาบนมือถือ) */
  consumePotion(): number {
    const fromTouch = this.touch?.consumePotion() ?? 0;
    if (fromTouch > 0) return fromTouch;
    const n = this.potionQueue;
    this.potionQueue = 0;
    return n;
  }

  /** อ่านคำสั่งไม้ตายหนึ่งครั้ง (Digit4/KeyG บน PC / ปุ่มไม้ตายบนมือถือ) */
  consumeUltimate(): boolean {
    return this.consumeUltimateAim() !== null;
  }

  consumeUltimateAim(): SkillAimCommand | null {
    const fromTouch = this.touch?.consumeUltimateAim() ?? null;
    if (fromTouch) return fromTouch;
    if (this.ultimateQueue > 0) {
      this.ultimateQueue = 0;
      return { slot: 4 };
    }
    return null;
  }

  /** อ่านคำสั่งสลับอาวุธหนึ่งครั้ง */
  consumeWeaponSwitch(): boolean {
    if (this.touch?.consumeWeaponSwitch()) return true;
    if (this.weaponSwitchQueue > 0) {
      this.weaponSwitchQueue = 0;
      return true;
    }
    return false;
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

  /** อ่านคำสั่งโต้ตอบ NPC หนึ่งครั้ง */
  consumeInteract(): boolean {
    if (this.interactQueue > 0) {
      this.interactQueue = 0;
      return true;
    }
    return false;
  }

  /** อ่านคำสั่งยิงปืนใหญ่หนึ่งครั้ง คืน 1 = กราบซ้าย, 2 = กราบขวา, 0 = ไม่มี */
  consumeCannon(): number {
    const fromTouch = this.touch?.consumeCannon() ?? 0;
    if (fromTouch > 0) return fromTouch;
    const n = this.cannonQueue;
    this.cannonQueue = 0;
    return n;
  }

  /** Space/ปุ่มสมอแบบ edge trigger ใช้เฉพาะตอนขับเรือ */
  consumeAnchor(): boolean {
    if (this.touch?.consumeAnchor()) {
      this.anchorQueue = 0;
      return true;
    }
    if (this.anchorQueue > 0) {
      this.anchorQueue = 0;
      return true;
    }
    return false;
  }

  consumeZoom(): number {
    const fromTouch = this.touch?.consumeZoom() ?? 0;
    if (fromTouch !== 0) return fromTouch;
    const value = this.zoomQueue;
    this.zoomQueue = 0;
    return value;
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
