import type { Input } from '../engine/Input';
import type { ControlMode } from '../engine/Input';
import {
  controlSurfaceLayout,
  isTouchDevice,
  type ControlSurfaceLayout,
} from '../engine/device';

const CAMERA_TOUCH_SENSITIVITY = 2.2;

export interface CooldownView {
  /** 0..1 = สัดส่วนคูลดาวน์ที่เหลือ (0 = พร้อมใช้) */
  fraction: number;
  /** ใส่เมื่อ UI ควรแสดงเวลาที่เหลือเป็นตัวเลข */
  remainingSeconds?: number;
}

/** รองรับ getter เดิมที่คืน fraction อย่างเดียว เพื่อไม่กระทบระบบเรือ/dash */
export type CooldownGetter = () => number | CooldownView;

export function formatCooldownText(remainingSeconds: number | undefined): string {
  if (remainingSeconds === undefined || !Number.isFinite(remainingSeconds) || remainingSeconds <= 0) {
    return '';
  }
  if (remainingSeconds >= 10) return `${Math.ceil(remainingSeconds)}s`;
  return `${Math.max(0.1, remainingSeconds).toFixed(1)}s`;
}

export interface SkillAimCommand {
  slot: number;
  /** ทิศบนจอ: x ขวา, z ลง; มีค่าเฉพาะตอนลากเล็ง */
  screenX?: number;
  screenZ?: number;
}

export interface SkillAimPreview {
  slot: number;
  screenX: number;
  screenZ: number;
  dragged: boolean;
}

/**
 * ระบบบังคับบนจอสัมผัสสไตล์ PUBG:
 * - ซ้าย: จอยสติ๊กเสมือนแบบลอย; ดันขึ้นแรงจะแสดงจุดล็อกวิ่งอัตโนมัติ
 * - ขวา: ปุ่มโจมตีหลักใหญ่สุดที่มุม, สกิล 1-3 เรียงโค้งรอบปุ่มโจมตี,
 *   ไม้ตาย (Ultimate) แยกเด่น, ปุ่มพุ่งหลบ (Dash) และปุ่มกระโดด
 * - ลากนิ้วบนพื้นที่ว่างฝั่งขวา = หมุนกล้อง
 * สกิล/ไม้ตายยังล็อกอยู่ (ปลดใน Phase 5 Combat / Phase 7 ผลไม้ปีศาจ)
 */
export class TouchControls {
  /** ค่าจอยสติ๊ก -1..1 (x = ขวา, z = ลง/ถอยหลัง) */
  moveX = 0;
  moveZ = 0;
  joystickActive = false;
  private autoRunOn = false;

  /** วิ่งเมื่อดันจอยขึ้นแรง หรือแตะจุดเล็กเพื่อให้วิ่งตรงต่ออัตโนมัติ */
  get sprintOn(): boolean {
    const pushingForward = this.joystickActive && this.moveZ < -0.72 && Math.abs(this.moveX) < 0.72;
    return this.autoRunOn || pushingForward;
  }

  get autoRun(): boolean {
    return this.autoRunOn;
  }

  private jumpHeldRaw = false;
  /** แตะสั้นๆ ก็ต้องนับเป็นกระโดด — ค้างสถานะขั้นต่ำไว้ให้เฟรมถัดไปเก็บทัน */
  private jumpMinHoldUntil = 0;

  get jumpHeld(): boolean {
    return this.jumpHeldRaw || performance.now() < this.jumpMinHoldUntil;
  }

  private dashQueue = 0;
  private jumpQueue = 0;
  private attackQueue = 0;
  private anchorQueue = 0;
  private cannonQueue = 0; // 1 = ยิงกราบซ้าย, 2 = ยิงกราบขวา
  private skillTapQueue = 0;
  private skillAimQueue: SkillAimCommand | null = null;
  private ultTapQueue = 0;
  private ultimateAimQueue: SkillAimCommand | null = null;
  private zoomQueue = 0;
  private weaponQueue = 0;
  private potionTapQueue = 0;
  private skillsUnlocked = false;
  private skillIcons: [string, string, string] = ['🔒', '🔒', '🔒'];
  private skillMasteryRequirements = [0, 0, 0];
  private activeMasteryLevel = 1;
  private ultUnlocked = false;
  private ultIcon = '🔒';
  private ultRequirement = 0;
  private blockHeldRaw = false;
  private mode: ControlMode = 'player';

  get blockHeld(): boolean {
    return this.blockHeldRaw && this.mode === 'player';
  }

  private joyPointerId: number | null = null;
  private camPointerId: number | null = null;
  private skillPointerId: number | null = null;
  private aimingSkillSlot = 0;
  private aimingUltimate = false;
  private skillDragActive = false;
  private skillDragX = 0;
  private skillDragZ = -1;
  private skillGestureOrigin = { x: 0, y: 0 };
  private skillAimPreview: SkillAimPreview | null = null;
  private joyCenter = { x: 0, y: 0 };
  private lastCam = { x: 0, y: 0 };
  private autoRunReleaseTarget = false;

  private root: HTMLDivElement;
  private joyBase: HTMLDivElement;
  private joyKnob: HTMLDivElement;
  private autoRunBtn: HTMLDivElement;
  private cooldownRings = new Map<HTMLDivElement, CooldownGetter>();
  private toast: HTMLDivElement;
  private toastTimer: number | null = null;
  private attackBtn: HTMLDivElement;
  private dashBtn: HTMLDivElement;
  private jumpBtn: HTMLDivElement;
  private zoomInBtn: HTMLDivElement;
  private zoomOutBtn: HTMLDivElement;
  private skillCancelBtn: HTMLDivElement;
  private cannonLeftBtn: HTMLDivElement;
  private cannonRightBtn: HTMLDivElement;
  private blockBtn: HTMLDivElement;
  private weaponBtn: HTMLDivElement;
  private ultBtn: HTMLDivElement;
  private skillButtons: HTMLDivElement[] = [];
  private potionButtons: HTMLDivElement[] = [];
  private readonly layout: ControlSurfaceLayout;

  /** เกมควรเปิดระบบสัมผัสไหม (มีจอสัมผัส หรือบังคับด้วย ?touch=1 สำหรับทดสอบ) */
  static isTouchDevice(): boolean {
    return isTouchDevice();
  }

  get usesTouchLayout(): boolean {
    return this.layout === 'touch';
  }

  constructor(
    private input: Input,
    layout: ControlSurfaceLayout = controlSurfaceLayout(),
  ) {
    this.layout = layout;
    this.injectStyles();

    this.root = document.createElement('div');
    this.root.className = `tc-root tc-${layout}`;
    this.root.dataset.controlSurface = layout;
    document.body.appendChild(this.root);

    // ---------- โซนจอยสติ๊ก (ครึ่งซ้ายล่างของจอ) ----------
    const joyZone = document.createElement('div');
    joyZone.className = 'tc-joyzone';
    this.root.appendChild(joyZone);

    this.joyBase = document.createElement('div');
    this.joyBase.className = 'tc-joybase';
    this.joyKnob = document.createElement('div');
    this.joyKnob.className = 'tc-joyknob';
    this.joyBase.appendChild(this.joyKnob);
    this.root.appendChild(this.joyBase);

    joyZone.addEventListener('pointerdown', (e) => this.joyStart(e));
    window.addEventListener('pointermove', (e) => this.pointerMove(e));
    window.addEventListener('pointerup', (e) => this.pointerEnd(e));
    window.addEventListener('pointercancel', (e) => this.pointerEnd(e));

    // ---------- โซนหมุนกล้อง (ครึ่งขวา ยกเว้นปุ่ม) ----------
    const camZone = document.createElement('div');
    camZone.className = 'tc-camzone';
    this.root.appendChild(camZone);
    camZone.addEventListener('pointerdown', (e) => {
      if (this.camPointerId !== null) return;
      this.camPointerId = e.pointerId;
      this.lastCam = { x: e.clientX, y: e.clientY };
    });

    // ---------- ปุ่มฝั่งขวาแบบ RoV ----------
    // ปุ่มโจมตีหลัก (ใหญ่สุด มุมขวาล่าง)
    const attack = this.makeButton('tc-attack', '⚔️', () => (this.attackQueue = 1));
    // พุ่งหลบ — ติดตัวมาเลย ใช้ได้จริง
    const dash = this.makeButton('tc-dash', '💨', () => (this.dashQueue = 1));
    // กระโดด (กดค้างได้)
    const jump = this.makeButton('tc-jump', '⬆️', null);
    jump.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this.mode === 'boat') {
        this.anchorQueue = 1;
      } else {
        this.jumpHeldRaw = true;
        this.jumpQueue = 1;
        this.jumpMinHoldUntil = performance.now() + 150;
      }
    });
    const jumpOff = () => (this.jumpHeldRaw = false);
    jump.addEventListener('pointerup', jumpOff);
    jump.addEventListener('pointercancel', jumpOff);
    jump.addEventListener('pointerleave', jumpOff);

    // สกิล 1-3: กดค้างแล้วลากเพื่อเล็ง ปล่อยเพื่อใช้ (แตะสั้น = ใช้ทิศกล้องปัจจุบัน)
    for (let i = 1; i <= 3; i++) {
      const button = this.makeButton(`tc-skill tc-skill${i}`, '🔒', null);
      button.addEventListener('pointerdown', (event) => this.beginSkillAim(event, i, false));
      this.skillButtons.push(button);
    }
    // ไม้ตายใช้ gesture เดียวกัน โดย slot 4 map ไป index 3 ใน PlayerCombat
    this.ultBtn = this.makeButton('tc-ult', '🔒', null);
    this.ultBtn.addEventListener('pointerdown', (event) => this.beginSkillAim(event, 4, true));
    this.skillButtons.push(this.ultBtn);

    this.skillCancelBtn = this.makeButton('tc-skill-cancel', 'ยกเลิก', null);
    this.skillCancelBtn.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      this.cancelSkillAim();
    });
    this.skillCancelBtn.classList.remove('tc-visible');

    // ---------- Block (กดค้างเพื่อกัน) + สลับอาวุธ ----------
    this.blockBtn = this.makeButton('tc-block', '🛡️', null);
    this.blockBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.blockHeldRaw = true;
      this.blockBtn.classList.add('tc-on');
    });
    const blockOff = () => {
      this.blockHeldRaw = false;
      this.blockBtn.classList.remove('tc-on');
    };
    this.blockBtn.addEventListener('pointerup', blockOff);
    this.blockBtn.addEventListener('pointercancel', blockOff);
    this.blockBtn.addEventListener('pointerleave', blockOff);

    this.weaponBtn = this.makeButton('tc-weapon', '👊', () => (this.weaponQueue = 1));

    // ซูมมือถือแบบกดเพิ่ม/ลดระยะ ใช้ได้ทั้งตอนเดินและขับเรือ
    this.zoomInBtn = this.makeButton('tc-zoom tc-zoom-in', '＋', () => (this.zoomQueue = 1));
    this.zoomOutBtn = this.makeButton('tc-zoom tc-zoom-out', '－', () => (this.zoomQueue = -1));
    this.zoomInBtn.title = 'ซูมเข้า';
    this.zoomOutBtn.title = 'ซูมออก';

    // ---------- ปุ่มยิงปืนใหญ่กราบซ้าย/ขวา (โชว์เฉพาะโหมดเรือ) ----------
    this.cannonLeftBtn = this.makeButton('tc-cannon tc-cannon-left', '◀💣', () => (this.cannonQueue = 1));
    this.cannonRightBtn = this.makeButton('tc-cannon tc-cannon-right', '💣▶', () => (this.cannonQueue = 2));
    this.cannonLeftBtn.style.display = 'none';
    this.cannonRightBtn.style.display = 'none';

    // ---------- ช่องลัดใช้ยา (2 ช่อง) ----------
    for (let i = 1; i <= 2; i++) {
      const btn = this.makeButton(`tc-potion tc-potion${i}`, '➕', () => (this.potionTapQueue = i));
      const badge = document.createElement('b');
      badge.className = 'tc-potion-count';
      btn.appendChild(badge);
      this.potionButtons.push(btn);
    }

    // ---------- จุดล็อกวิ่งอัตโนมัติแบบ PUBG ----------
    this.autoRunBtn = this.makeButton('tc-autorun', '➜', () => {
      this.autoRunOn = !this.autoRunOn;
      this.autoRunBtn.classList.toggle('tc-on', this.autoRunOn);
      this.autoRunBtn.classList.toggle('tc-visible', this.autoRunOn);
    });
    this.autoRunBtn.title = 'ดันจอยขึ้น แล้ววางนิ้วบนจุดนี้เพื่อวิ่งอัตโนมัติ';

    // ---------- toast ----------
    this.toast = document.createElement('div');
    this.toast.className = 'tc-toast';
    this.root.appendChild(this.toast);

    // เก็บอ้างอิงไว้ผูกวงแหวนคูลดาวน์ทีหลัง
    this.attackBtn = attack;
    this.dashBtn = dash;
    this.jumpBtn = jump;
    this.decorateDesktopShortcuts();
  }

  setMode(mode: ControlMode): void {
    this.mode = mode;
    this.jumpHeldRaw = false;
    this.blockHeldRaw = false;
    this.blockBtn.classList.remove('tc-on');
    this.anchorQueue = 0;
    this.jumpQueue = 0;
    this.dashQueue = 0;
    this.cannonQueue = 0;
    this.skillTapQueue = 0;
    this.skillAimQueue = null;
    this.ultTapQueue = 0;
    this.ultimateAimQueue = null;
    this.zoomQueue = 0;
    this.cancelSkillAim();
    if (mode === 'boat') {
      this.autoRunOn = false;
      this.autoRunBtn.classList.remove('tc-on', 'tc-visible');
    }
    this.setButtonLabel(this.dashBtn, mode === 'boat' ? '⚡' : '💨');
    this.setButtonLabel(this.jumpBtn, mode === 'boat' ? '⚓' : '⬆️');
    const display = mode === 'boat' ? 'none' : 'flex';
    // โหมดเรือ: สลับปุ่มโจมตีเป็นปุ่มยิงปืนใหญ่กราบซ้าย/ขวา (Naval Combat)
    this.attackBtn.style.display = display;
    this.cannonLeftBtn.style.display = mode === 'boat' ? 'flex' : 'none';
    this.cannonRightBtn.style.display = mode === 'boat' ? 'flex' : 'none';
    // จุด auto-run ใช้ class ควบคุมการแสดงผล เพื่อให้ซ่อนจนกว่าจะดันจอยขึ้น
    this.autoRunBtn.style.display = mode === 'boat' ? 'none' : '';
    this.blockBtn.style.display = display;
    this.weaponBtn.style.display = display;
    for (const button of this.skillButtons) button.style.display = display;
    for (const button of this.potionButtons) button.style.display = 'flex';
    this.dashBtn.classList.toggle('tc-boat-boost', mode === 'boat');
  }

  resetTransientInputs(): void {
    this.jumpHeldRaw = false;
    this.blockHeldRaw = false;
    this.blockBtn.classList.remove('tc-on');
    this.joyPointerId = null;
    this.camPointerId = null;
    this.joystickActive = false;
    this.moveX = 0;
    this.moveZ = 0;
    this.joyBase.classList.remove('tc-visible');
    this.cancelSkillAim();
  }

  /** อ่านช่องลัดยาที่แตะหนึ่งครั้ง คืน 1-2 หรือ 0 */
  consumePotion(): number {
    const n = this.potionTapQueue;
    this.potionTapQueue = 0;
    return n;
  }

  /** อ่านการแตะปุ่มกระโดดหนึ่งครั้ง รองรับ double jump แม้ปล่อยนิ้วเร็ว */
  consumeJump(): boolean {
    if (this.jumpQueue > 0) {
      this.jumpQueue = 0;
      return true;
    }
    return false;
  }

  /** ตั้งไอคอน+จำนวนของช่องลัดยา (เรียกโดย HotkeyManager) — undefined = ช่องว่าง */
  setPotionSlots(slots: ({ icon: string; count: number } | undefined)[]): void {
    for (let i = 0; i < this.potionButtons.length; i++) {
      const btn = this.potionButtons[i];
      const slot = slots[i];
      this.setButtonLabel(btn, slot ? slot.icon : '➕');
      const badge = btn.querySelector<HTMLElement>('.tc-potion-count');
      if (badge) badge.textContent = slot && slot.count > 0 ? String(slot.count) : '';
      btn.classList.toggle('tc-potion-empty', !slot || slot.count <= 0);
    }
  }

  /** ผูก getter คูลดาวน์ของ dash/โจมตี เพื่อวาดวงแหวนบนปุ่ม */
  bindCooldowns(dash: CooldownGetter, attack: CooldownGetter): void {
    this.cooldownRings.set(this.dashBtn, dash);
    this.cooldownRings.set(this.attackBtn, attack);
  }

  /** ปลดล็อกปุ่มสกิล 1-3 พร้อมตั้งไอคอน (เรียกโดย PlayerCombat) */
  unlockSkills(icons: [string, string, string]): void {
    this.skillsUnlocked = true;
    this.skillIcons = icons;
    this.renderSkillMasteryState();
  }

  /** อัปเดตไอคอนสกิล 1-3 (เช่น ตอนสลับชุดสกิลอาวุธ↔ผลไม้) */
  setSkillIcons(icons: [string, string, string]): void {
    this.skillsUnlocked = true;
    this.skillIcons = icons;
    this.renderSkillMasteryState();
  }

  /** ปลดล็อกปุ่มไม้ตายพร้อมตั้งไอคอน */
  unlockUltimate(icon: string): void {
    this.ultUnlocked = true;
    this.ultIcon = icon;
    this.renderUltimateState();
  }

  /** อัปเดตไอคอนไม้ตาย (ตอนสลับชุดสกิล) */
  setUltimateIcon(icon: string): void {
    this.ultUnlocked = true;
    this.ultIcon = icon;
    this.renderUltimateState();
  }

  /** ตั้ง Mastery ขั้นต่ำของไม้ตายที่ active */
  setUltimateMastery(requirement: number): void {
    this.ultRequirement = requirement;
    this.renderUltimateState();
  }

  /** ผูกวงแหวนคูลดาวน์ของไม้ตาย */
  bindUltimateCooldown(getter: CooldownGetter): void {
    this.cooldownRings.set(this.ultBtn, getter);
  }

  /** อ่านคำสั่งไม้ตายหนึ่งครั้ง */
  consumeUltimate(): boolean {
    return this.consumeUltimateAim() !== null;
  }

  consumeUltimateAim(): SkillAimCommand | null {
    if (this.ultimateAimQueue) {
      const command = this.ultimateAimQueue;
      this.ultimateAimQueue = null;
      return command;
    }
    if (this.ultTapQueue <= 0) return null;
    this.ultTapQueue = 0;
    return { slot: 4 };
  }

  /** Phase 6: แสดงล็อกและเลข Mastery โดยไม่เพิ่มปุ่มมือถือใหม่ */
  setSkillMasteryState(masteryLevel: number, requirements: readonly number[]): void {
    this.activeMasteryLevel = masteryLevel;
    this.skillMasteryRequirements = [
      requirements[0] ?? 0,
      requirements[1] ?? 0,
      requirements[2] ?? 0,
    ];
    this.renderSkillMasteryState();
    this.renderUltimateState();
  }

  /** ผูกวงแหวนคูลดาวน์ของสกิล 1-3 */
  bindSkillCooldowns(getters: [CooldownGetter, CooldownGetter, CooldownGetter]): void {
    for (let i = 0; i < 3; i++) {
      this.cooldownRings.set(this.skillButtons[i], getters[i]);
    }
  }

  /** อ่านสกิลที่แตะหนึ่งครั้ง คืน 1-3 หรือ 0 */
  consumeSkill(): number {
    const command = this.consumeSkillAim();
    return command?.slot ?? 0;
  }

  consumeSkillAim(): SkillAimCommand | null {
    if (this.skillAimQueue) {
      const command = this.skillAimQueue;
      this.skillAimQueue = null;
      return command;
    }
    const n = this.skillTapQueue;
    this.skillTapQueue = 0;
    return n > 0 ? { slot: n } : null;
  }

  getSkillAimPreview(): SkillAimPreview | null {
    return this.skillAimPreview;
  }

  consumeWeaponSwitch(): boolean {
    if (this.weaponQueue <= 0) return false;
    this.weaponQueue = 0;
    return true;
  }

  /** อัปเดตไอคอนปุ่มอาวุธให้ตรงกับอาวุธปัจจุบัน */
  setWeaponIcon(icon: string): void {
    this.setButtonLabel(this.weaponBtn, icon);
  }

  /** ข้อความแจ้งเตือนสั้น ๆ (เช่น พลังงานไม่พอ) */
  notify(message: string): void {
    this.showToast(message);
  }

  consumeDash(): boolean {
    if (this.dashQueue > 0) {
      this.dashQueue = 0;
      return true;
    }
    return false;
  }

  consumeAttack(): boolean {
    if (this.attackQueue > 0) {
      this.attackQueue = 0;
      return true;
    }
    return false;
  }

  consumeAnchor(): boolean {
    if (this.anchorQueue <= 0) return false;
    this.anchorQueue = 0;
    return true;
  }

  /** อ่านคำสั่งยิงปืนใหญ่หนึ่งครั้ง คืน 1 = กราบซ้าย, 2 = กราบขวา, 0 = ไม่มี */
  consumeCannon(): number {
    const n = this.cannonQueue;
    this.cannonQueue = 0;
    return n;
  }

  consumeZoom(): number {
    const value = this.zoomQueue;
    this.zoomQueue = 0;
    return value;
  }

  /** ผูกวงแหวนคูลดาวน์ของปืนใหญ่ทั้งสองกราบ (แชร์คูลดาวน์เดียวกัน) */
  bindCannonCooldown(getter: CooldownGetter): void {
    this.cooldownRings.set(this.cannonLeftBtn, getter);
    this.cooldownRings.set(this.cannonRightBtn, getter);
  }

  /** ไฮไลต์กราบที่เปิดเล็งอยู่: 0 = ปิด, 1 = ซ้าย, 2 = ขวา */
  setCannonArmed(side: 0 | 1 | 2): void {
    this.cannonLeftBtn.classList.toggle('tc-armed', side === 1);
    this.cannonRightBtn.classList.toggle('tc-armed', side === 2);
  }

  /** เรียกทุกเฟรมจาก game loop เพื่ออัปเดตวงแหวนคูลดาวน์ */
  update(): void {
    for (const [btn, getter] of this.cooldownRings) {
      const value = getter();
      const fraction = typeof value === 'number' ? value : value.fraction;
      const remain = Number.isFinite(fraction) ? Math.max(0, Math.min(1, fraction)) : 0;
      const cooldownText = btn.querySelector<HTMLElement>('.tc-cd-text');
      if (cooldownText) {
        cooldownText.textContent = formatCooldownText(
          typeof value === 'number' ? undefined : value.remainingSeconds,
        );
      }
      if (remain <= 0) {
        btn.style.removeProperty('--cd');
        btn.classList.remove('tc-cooling');
      } else {
        btn.style.setProperty('--cd', `${remain * 360}deg`);
        btn.classList.add('tc-cooling');
      }
    }
  }

  private beginSkillAim(event: PointerEvent, slot: number, ultimate: boolean): void {
    event.preventDefault();
    const required = ultimate
      ? this.ultRequirement
      : this.skillMasteryRequirements[slot - 1] ?? 0;
    const unlocked = ultimate ? this.ultUnlocked : this.skillsUnlocked;
    if (!unlocked) {
      this.showToast(ultimate ? 'ยังไม่มีไม้ตาย' : `ยังไม่มีสกิลในช่อง ${slot}`);
      return;
    }
    if (this.activeMasteryLevel < required) {
      this.showToast(`ต้องการ Mastery ${required}`);
      return;
    }
    this.cancelSkillAim();
    this.skillPointerId = event.pointerId;
    this.aimingSkillSlot = slot;
    this.aimingUltimate = ultimate;
    this.skillDragActive = false;
    this.skillDragX = 0;
    this.skillDragZ = -1;
    this.skillGestureOrigin = { x: event.clientX, y: event.clientY };
    this.skillAimPreview = { slot, screenX: 0, screenZ: -1, dragged: false };
  }

  private cancelSkillAim(): void {
    this.skillPointerId = null;
    this.aimingSkillSlot = 0;
    this.aimingUltimate = false;
    this.skillDragActive = false;
    this.skillAimPreview = null;
    this.skillCancelBtn?.classList.remove('tc-visible');
    for (const button of this.skillButtons) button.classList.remove('tc-aiming');
  }

  private finishSkillAim(): void {
    if (this.aimingSkillSlot <= 0) return;
    const command: SkillAimCommand = {
      slot: this.aimingSkillSlot,
      ...(this.skillDragActive ? { screenX: this.skillDragX, screenZ: this.skillDragZ } : {}),
    };
    if (this.aimingUltimate) this.ultimateAimQueue = command;
    else this.skillAimQueue = command;
    this.cancelSkillAim();
  }

  // ---------- จอยสติ๊ก ----------

  private joyStart(e: PointerEvent): void {
    if (this.joyPointerId !== null) return;
    e.preventDefault();
    this.joyPointerId = e.pointerId;
    this.joyCenter = { x: e.clientX, y: e.clientY };
    this.joyBase.style.left = `${e.clientX}px`;
    this.joyBase.style.top = `${e.clientY}px`;
    this.autoRunBtn.style.left = `${e.clientX}px`;
    this.autoRunBtn.style.top = `${Math.max(46, e.clientY - 70)}px`;
    this.autoRunReleaseTarget = false;
    // แตะจอยใหม่เพื่อบังคับทิศทาง = ยกเลิก auto-run เดิม
    this.autoRunOn = false;
    this.autoRunBtn.classList.remove('tc-on');
    this.joyBase.classList.add('tc-visible');
    this.joystickActive = true;
    this.updateKnob(0, 0);
  }

  private pointerMove(e: PointerEvent): void {
    if (e.pointerId === this.skillPointerId) {
      // skillDragX/Z are normalized; keep a local origin on the first move instead of
      // using the button center so the gesture feels like a virtual aim stick.
      const origin = this.skillGestureOrigin;
      const rawX = e.clientX - origin.x;
      const rawZ = e.clientY - origin.y;
      const length = Math.hypot(rawX, rawZ);
      if (length >= 10) {
        this.skillDragActive = true;
        this.skillDragX = rawX / length;
        this.skillDragZ = rawZ / length;
        this.skillAimPreview = {
          slot: this.aimingSkillSlot,
          screenX: this.skillDragX,
          screenZ: this.skillDragZ,
          dragged: true,
        };
        this.skillCancelBtn.classList.add('tc-visible');
        this.skillButtons[this.aimingSkillSlot === 4 ? 3 : this.aimingSkillSlot - 1]?.classList.add('tc-aiming');
      }
    } else if (e.pointerId === this.joyPointerId) {
      const maxR = 43;
      let dx = e.clientX - this.joyCenter.x;
      let dy = e.clientY - this.joyCenter.y;
      const len = Math.hypot(dx, dy);
      if (len > maxR) {
        dx = (dx / len) * maxR;
        dy = (dy / len) * maxR;
      }
      this.updateKnob(dx, dy);
      this.moveX = dx / maxR;
      this.moveZ = dy / maxR;
      this.updateAutoRunHint(e.clientX, e.clientY);
    } else if (e.pointerId === this.camPointerId) {
      this.input.addCameraDelta(
        (e.clientX - this.lastCam.x) * CAMERA_TOUCH_SENSITIVITY,
        (e.clientY - this.lastCam.y) * CAMERA_TOUCH_SENSITIVITY,
      );
      this.lastCam = { x: e.clientX, y: e.clientY };
    }
  }

  private pointerEnd(e: PointerEvent): void {
    if (e.pointerId === this.skillPointerId) {
      if (e.type === 'pointercancel') this.cancelSkillAim();
      else this.finishSkillAim();
    } else if (e.pointerId === this.joyPointerId) {
      const lockAutoRun = this.autoRunReleaseTarget && this.moveZ < -0.72;
      this.joyPointerId = null;
      this.joystickActive = false;
      this.moveX = 0;
      this.moveZ = 0;
      this.joyBase.classList.remove('tc-visible');
      this.autoRunReleaseTarget = false;
      if (lockAutoRun) {
        this.autoRunOn = true;
        this.autoRunBtn.classList.add('tc-visible', 'tc-on');
      } else {
        this.autoRunBtn.classList.toggle('tc-visible', this.autoRunOn);
      }
    } else if (e.pointerId === this.camPointerId) {
      this.camPointerId = null;
    }
  }

  private updateKnob(dx: number, dy: number): void {
    this.joyKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }

  private updateAutoRunHint(clientX: number, clientY: number): void {
    const pushingForward = this.moveZ < -0.72 && Math.abs(this.moveX) < 0.72;
    if (!pushingForward) {
      this.autoRunReleaseTarget = false;
      this.autoRunBtn.classList.toggle('tc-visible', this.autoRunOn);
      return;
    }
    this.autoRunBtn.classList.add('tc-visible');
    const rect = this.autoRunBtn.getBoundingClientRect();
    this.autoRunReleaseTarget = clientX >= rect.left && clientX <= rect.right &&
      clientY >= rect.top && clientY <= rect.bottom;
    this.autoRunBtn.classList.toggle('tc-on', this.autoRunReleaseTarget || this.autoRunOn);
  }

  // ---------- helper ----------

  private makeButton(
    className: string,
    label: string,
    onTap: (() => void) | null,
  ): HTMLDivElement {
    const btn = document.createElement('div');
    btn.className = `tc-btn ${className}`;
    btn.setAttribute('role', 'button');
    btn.innerHTML = `<span>${label}</span><div class="tc-ring"></div><small class="tc-cd-text"></small>`;
    if (onTap) {
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        onTap();
      });
    }
    this.root.appendChild(btn);
    return btn;
  }

  private decorateDesktopShortcuts(): void {
    if (this.layout !== 'desktop') return;
    const shortcuts: Array<[HTMLDivElement, string]> = [
      [this.attackBtn, 'LMB'],
      [this.dashBtn, 'Q'],
      [this.jumpBtn, 'SPACE'],
      [this.skillButtons[0], '1'],
      [this.skillButtons[1], '2'],
      [this.skillButtons[2], '3'],
      [this.ultBtn, '4 / G'],
      [this.blockBtn, 'F'],
      [this.weaponBtn, 'R'],
      [this.cannonLeftBtn, '1'],
      [this.cannonRightBtn, '2'],
    ];
    for (const [button, key] of shortcuts) {
      const badge = document.createElement('kbd');
      badge.className = 'tc-key';
      badge.textContent = key;
      button.appendChild(badge);
    }
  }

  private setButtonLabel(button: HTMLDivElement, label: string): void {
    const span = button.querySelector('span');
    if (span) span.textContent = label;
  }

  private renderSkillMasteryState(): void {
    for (let i = 0; i < 3; i++) {
      const locked = !this.skillsUnlocked || this.activeMasteryLevel < this.skillMasteryRequirements[i];
      this.setButtonLabel(
        this.skillButtons[i],
        locked && this.skillMasteryRequirements[i] > 0
          ? `🔒${this.skillMasteryRequirements[i]}`
          : this.skillsUnlocked
            ? this.skillIcons[i]
            : '🔒',
      );
      this.skillButtons[i].classList.toggle('tc-skill-ready', !locked);
      this.skillButtons[i].classList.toggle('tc-skill-locked', locked);
    }
  }

  private renderUltimateState(): void {
    const locked = !this.ultUnlocked || this.activeMasteryLevel < this.ultRequirement;
    this.setButtonLabel(
      this.ultBtn,
      locked && this.ultRequirement > 0
        ? `🔒${this.ultRequirement}`
        : this.ultUnlocked
          ? this.ultIcon
          : '🔒',
    );
    this.ultBtn.classList.toggle('tc-skill-ready', !locked);
    this.ultBtn.classList.toggle('tc-skill-locked', locked);
  }

  private showToast(msg: string): void {
    this.toast.textContent = msg;
    this.toast.classList.add('tc-visible');
    if (this.toastTimer !== null) clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toast.classList.remove('tc-visible'), 1800);
  }

  private injectStyles(): void {
    const style = document.createElement('style');
    style.textContent = `
      .tc-root { position: fixed; inset: 0; z-index: 20; pointer-events: none;
                 -webkit-user-select: none; user-select: none; touch-action: none;
                 font-family: 'Segoe UI', Tahoma, sans-serif; }
      .tc-joyzone { position: absolute; left: 0; bottom: 0; width: 45%; height: 75%;
                    pointer-events: auto; touch-action: none; }
      .tc-camzone { position: absolute; right: 0; top: 0; width: 55%; height: 100%;
                    pointer-events: auto; touch-action: none; }

      .tc-joybase { position: absolute; width: 102px; height: 102px; border-radius: 50%;
                    background: rgba(255,255,255,.10); border: 2px solid rgba(255,255,255,.35);
                    transform: translate(-50%, -50%); display: none; }
      .tc-joybase.tc-visible { display: block; }
      .tc-joyknob { position: absolute; left: 50%; top: 50%; width: 44px; height: 44px;
                    border-radius: 50%; background: rgba(255,255,255,.45);
                    border: 2px solid rgba(255,255,255,.7);
                    transform: translate(-50%, -50%); }

      .tc-btn { position: absolute; border-radius: 50%; pointer-events: auto;
                touch-action: none; display: flex; align-items: center; justify-content: center;
                background: rgba(10,25,45,.55); border: 2px solid rgba(255,255,255,.45);
                color: #fff; box-shadow: 0 2px 8px rgba(0,0,0,.35); }
      .tc-btn:active { background: rgba(90,160,255,.5); }
      .tc-btn span { pointer-events: none; }
      .tc-key { position:absolute; left:-4px; top:-7px; min-width:15px; height:15px; padding:0 3px;
                border-radius:5px; border:1px solid rgba(255,255,255,.5); background:rgba(4,13,24,.92);
                color:#eaf7ff; font:800 8px/15px 'Segoe UI',Tahoma,sans-serif; text-align:center;
                box-shadow:0 1px 4px rgba(0,0,0,.55); pointer-events:none; }
      .tc-cd-text { position:absolute; left:50%; bottom:1px; transform:translateX(-50%);
                    z-index:2; min-width:28px; color:#fff; font:800 9px/1 'Segoe UI',Tahoma,sans-serif;
                    text-align:center; text-shadow:0 1px 3px #000; pointer-events:none; }

      .tc-attack { right: 14px;  bottom: 18px;  width: 70px; height: 70px; font-size: 28px;
                   border-color: rgba(255,120,90,.8); background: rgba(120,35,20,.55); }
      /* ปุ่มยิงปืนใหญ่โหมดเรือ: [◀💣] ⚡ [💣▶] เรียงแถวล่างขวา */
      .tc-cannon { width: 62px; height: 62px; font-size: 19px;
                   border-color: rgba(255,150,80,.85); background: rgba(120,45,15,.6); }
      .tc-cannon-right { right: 14px;  bottom: 18px; }
      .tc-cannon-left  { right: 156px; bottom: 18px; }
      .tc-cannon.tc-armed { background: rgba(255,140,50,.72); border-color: #ffd9a0;
                   box-shadow: 0 0 16px rgba(255,170,80,.85); }
      .tc-dash   { right: 92px; bottom: 24px;  width: 48px; height: 48px; font-size: 21px;
                   border-color: rgba(120,220,255,.8); }
      .tc-dash.tc-boat-boost { border-color:rgba(255,220,95,.9); background:rgba(100,72,12,.62); }
      .tc-jump   { right: 86px; bottom: 82px; width: 48px; height: 48px; font-size: 20px; }
      .tc-skill1 { right: 18px;  bottom: 108px; width: 42px; height: 42px; font-size: 16px; }
      .tc-skill2 { right: 70px;  bottom: 146px; width: 42px; height: 42px; font-size: 16px; }
      .tc-skill3 { right: 124px; bottom: 124px; width: 42px; height: 42px; font-size: 16px; }
      .tc-skill  { opacity: .55; }
      .tc-skill.tc-skill-ready { opacity: .95; border-color: rgba(140,235,190,.85);
                   background: rgba(14,66,48,.6); }
      .tc-skill.tc-skill-locked { opacity:.55; font-size:14px; filter:saturate(.45); }
      .tc-skill.tc-aiming { opacity: 1; border-color: #ffe27a;
                   box-shadow: 0 0 18px rgba(255,210,100,.9); transform: scale(1.08); }
      .tc-skill-cancel { position: fixed; right: 88px; bottom: 220px; width: 48px; height: 28px;
                   border-radius: 14px; display: none; font-size: 11px; z-index: 3;
                   background: rgba(120,30,25,.9); border-color: rgba(255,180,150,.95); }
      .tc-skill-cancel.tc-visible { display: flex; }
      .tc-ult    { right: 148px; bottom: 18px;  width: 50px; height: 50px; font-size: 19px;
                   border-color: rgba(200,120,255,.85); background: rgba(70,25,110,.55);
                   opacity: .65; }
      /* ย้ายโล่ไปยังตำแหน่งเดิมของปุ่มเปลี่ยนอาวุธ */
      .tc-block  { right: 202px; bottom: 76px; width: 42px; height: 42px; font-size: 18px;
                   border-color: rgba(150,200,255,.8); }
      .tc-block.tc-on { background: rgba(90,160,255,.55); border-color: #bfe0ff; }
      /* จุดวงกลมด้านขวากลางจอสำหรับสลับอาวุธ ไม่ชนปุ่มโจมตี */
      .tc-weapon { right: 16px; top: 52%; transform: translateY(-50%); width: 42px; height: 42px; font-size: 17px;
                   opacity: .9; border-color: rgba(255,215,140,.8); }
      .tc-zoom { left: 8px; right: auto; width: 24px; height: 24px; font-size: 14px; opacity: .3;
                 border-width: 1px; z-index: 2; background: rgba(10,25,45,.4);
                 border-color: rgba(170,220,255,.45); box-shadow: none; }
      .tc-zoom-in { top: auto; bottom: 42px; }
      .tc-zoom-out { top: auto; bottom: 10px; }
      .tc-zoom:active { opacity: .72; }
      /* ช่องลัดใช้ยา — ซ้ายของกลุ่มปุ่มโจมตี */
      .tc-potion  { width: 40px; height: 40px; font-size: 17px; opacity: .9;
                    border-color: rgba(120,235,150,.8); background: rgba(14,52,30,.55); }
      .tc-potion1 { right: 256px; bottom: 132px; }
      .tc-potion2 { right: 256px; bottom: 84px; }
      .tc-potion.tc-potion-empty { opacity: .5; filter: saturate(.4); }
      .tc-potion-count { position: absolute; right: -3px; bottom: -3px; min-width: 15px; height: 15px;
                    padding: 0 3px; border-radius: 8px; background: #1b6b3a; color: #fff; font-size: 10px;
                    line-height: 15px; text-align: center; font-weight: 800; box-shadow: 0 1px 3px rgba(0,0,0,.5); }
      .tc-autorun { position: fixed; left: 110px; top: 570px; width: 34px; height: 34px; font-size: 15px;
                    display: none; opacity: .75; border-width: 1px; border-color: rgba(255,224,126,.85);
                    background: rgba(80,68,18,.7); }
      .tc-autorun.tc-visible { display: flex; }
      .tc-autorun.tc-on { opacity: 1; background: rgba(255,215,90,.72); border-color: #ffe27a; }

      /* Desktop ใช้คีย์บอร์ด/เมาส์จริง จึงแสดงเฉพาะ Combat HUD และไม่วางโซนโปร่งใสดักเมาส์ */
      .tc-root.tc-desktop::before { content:''; position:absolute; right:8px; bottom:8px;
                    width:292px; height:140px; border-radius:20px;
                    border:1px solid rgba(130,205,255,.22);
                    background:linear-gradient(145deg,rgba(5,18,33,.4),rgba(5,18,33,.16));
                    box-shadow:0 8px 24px rgba(0,0,0,.18); pointer-events:none; }
      .tc-desktop .tc-joyzone, .tc-desktop .tc-camzone, .tc-desktop .tc-joybase,
      .tc-desktop .tc-autorun, .tc-desktop .tc-zoom, .tc-desktop .tc-potion { display:none !important; }
      .tc-desktop .tc-attack { right:16px; bottom:16px; width:58px; height:58px; font-size:24px; }
      .tc-desktop .tc-dash { right:84px; bottom:20px; width:44px; height:44px; }
      .tc-desktop .tc-jump { right:136px; bottom:20px; width:44px; height:44px; }
      .tc-desktop .tc-block { right:188px; bottom:20px; width:44px; height:44px; }
      .tc-desktop .tc-weapon { right:240px; top:auto; bottom:20px; transform:none;
                    width:44px; height:44px; }
      .tc-desktop .tc-skill1 { right:16px; bottom:86px; width:46px; height:46px; }
      .tc-desktop .tc-skill2 { right:70px; bottom:86px; width:46px; height:46px; }
      .tc-desktop .tc-skill3 { right:124px; bottom:86px; width:46px; height:46px; }
      .tc-desktop .tc-ult { right:180px; bottom:84px; width:50px; height:50px; }
      .tc-desktop .tc-skill-cancel { right:240px; bottom:94px; }
      .tc-desktop .tc-cannon-right { right:16px; bottom:18px; }
      .tc-desktop .tc-cannon-left { right:90px; bottom:18px; }
      .tc-desktop .tc-dash.tc-boat-boost { right:164px; }

      /* วงแหวนคูลดาวน์: --cd = องศาที่ยังมืดอยู่ */
      .tc-ring { position: absolute; inset: -2px; border-radius: 50%; pointer-events: none; }
      .tc-cooling .tc-ring {
        background: conic-gradient(rgba(0,0,0,.65) var(--cd, 0deg), transparent var(--cd, 0deg));
      }
      .tc-cooling { filter: saturate(.4); }

      .tc-toast { position: absolute; left: 50%; top: 18%; transform: translateX(-50%);
                  background: rgba(0,0,0,.7); color: #fff; padding: 8px 18px;
                  border-radius: 20px; font-size: 14px; opacity: 0;
                  transition: opacity .25s; white-space: nowrap; }
      .tc-toast.tc-visible { opacity: 1; }
    `;
    document.head.appendChild(style);
  }
}
