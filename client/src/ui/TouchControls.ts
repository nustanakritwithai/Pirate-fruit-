import type { Input } from '../engine/Input';
import type { ControlMode } from '../engine/Input';
import { isTouchDevice } from '../engine/device';

const CAMERA_TOUCH_SENSITIVITY = 2.2;

/** getter คืนค่า 0..1 = สัดส่วนคูลดาวน์ที่เหลือ (0 = พร้อมใช้) */
export type CooldownGetter = () => number;

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
  private attackQueue = 0;
  private anchorQueue = 0;
  private cannonQueue = 0; // 1 = ยิงกราบซ้าย, 2 = ยิงกราบขวา
  private skillTapQueue = 0;
  private ultTapQueue = 0;
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
  private cannonLeftBtn: HTMLDivElement;
  private cannonRightBtn: HTMLDivElement;
  private blockBtn: HTMLDivElement;
  private weaponBtn: HTMLDivElement;
  private ultBtn: HTMLDivElement;
  private skillButtons: HTMLDivElement[] = [];
  private potionButtons: HTMLDivElement[] = [];

  /** เกมควรเปิดระบบสัมผัสไหม (มีจอสัมผัส หรือบังคับด้วย ?touch=1 สำหรับทดสอบ) */
  static isTouchDevice(): boolean {
    return isTouchDevice();
  }

  constructor(private input: Input) {
    this.injectStyles();

    this.root = document.createElement('div');
    this.root.className = 'tc-root';
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
        this.jumpMinHoldUntil = performance.now() + 150;
      }
    });
    const jumpOff = () => (this.jumpHeldRaw = false);
    jump.addEventListener('pointerup', jumpOff);
    jump.addEventListener('pointercancel', jumpOff);
    jump.addEventListener('pointerleave', jumpOff);

    // สกิล 1-3 (ปลดล็อกผ่าน unlockSkills โดย PlayerCombat)
    for (let i = 1; i <= 3; i++) {
      this.skillButtons.push(
        this.makeButton(`tc-skill tc-skill${i}`, '🔒', () => {
          const required = this.skillMasteryRequirements[i - 1];
          if (this.activeMasteryLevel < required) {
            this.showToast(`ต้องการ Mastery ${required}`);
          } else if (this.skillsUnlocked) {
            this.skillTapQueue = i;
          } else {
            this.showToast(`สกิล ${i} ปลดล็อกใน Phase 5 (Combat)`);
          }
        }),
      );
    }
    // ไม้ตาย (Ultimate) — ใช้งานได้จริงตั้งแต่ Phase 7
    this.ultBtn = this.makeButton('tc-ult', '🔒', () => {
      if (!this.ultUnlocked) {
        this.showToast('ยังไม่มีไม้ตาย');
      } else if (this.activeMasteryLevel < this.ultRequirement) {
        this.showToast(`ต้องการ Mastery ${this.ultRequirement}`);
      } else {
        this.ultTapQueue = 1;
      }
    });
    this.skillButtons.push(this.ultBtn);

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
  }

  setMode(mode: ControlMode): void {
    this.mode = mode;
    this.jumpHeldRaw = false;
    this.blockHeldRaw = false;
    this.blockBtn.classList.remove('tc-on');
    this.anchorQueue = 0;
    this.dashQueue = 0;
    this.cannonQueue = 0;
    this.skillTapQueue = 0;
    this.ultTapQueue = 0;
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
    for (const button of this.potionButtons) button.style.display = display;
    this.dashBtn.classList.toggle('tc-boat-boost', mode === 'boat');
  }

  /** อ่านช่องลัดยาที่แตะหนึ่งครั้ง คืน 1-2 หรือ 0 */
  consumePotion(): number {
    const n = this.potionTapQueue;
    this.potionTapQueue = 0;
    return n;
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
    if (this.ultTapQueue <= 0) return false;
    this.ultTapQueue = 0;
    return true;
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
    const n = this.skillTapQueue;
    this.skillTapQueue = 0;
    return n;
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

  /** ผูกวงแหวนคูลดาวน์ของปืนใหญ่ทั้งสองกราบ (แชร์คูลดาวน์เดียวกัน) */
  bindCannonCooldown(getter: CooldownGetter): void {
    this.cooldownRings.set(this.cannonLeftBtn, getter);
    this.cooldownRings.set(this.cannonRightBtn, getter);
  }

  /** เรียกทุกเฟรมจาก game loop เพื่ออัปเดตวงแหวนคูลดาวน์ */
  update(): void {
    for (const [btn, getter] of this.cooldownRings) {
      const remain = getter();
      if (remain <= 0) {
        btn.style.removeProperty('--cd');
        btn.classList.remove('tc-cooling');
      } else {
        btn.style.setProperty('--cd', `${remain * 360}deg`);
        btn.classList.add('tc-cooling');
      }
    }
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
    if (e.pointerId === this.joyPointerId) {
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
    if (e.pointerId === this.joyPointerId) {
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
    btn.innerHTML = `<span>${label}</span><div class="tc-ring"></div>`;
    if (onTap) {
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        onTap();
      });
    }
    this.root.appendChild(btn);
    return btn;
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

      .tc-attack { right: 14px;  bottom: 18px;  width: 70px; height: 70px; font-size: 28px;
                   border-color: rgba(255,120,90,.8); background: rgba(120,35,20,.55); }
      /* ปุ่มยิงปืนใหญ่โหมดเรือ: [◀💣] ⚡ [💣▶] เรียงแถวล่างขวา */
      .tc-cannon { width: 62px; height: 62px; font-size: 19px;
                   border-color: rgba(255,150,80,.85); background: rgba(120,45,15,.6); }
      .tc-cannon-right { right: 14px;  bottom: 18px; }
      .tc-cannon-left  { right: 156px; bottom: 18px; }
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
