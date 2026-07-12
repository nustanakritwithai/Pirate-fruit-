import type { Input } from '../engine/Input';
import type { ControlMode } from '../engine/Input';
import { isTouchDevice } from '../engine/device';

const CAMERA_TOUCH_SENSITIVITY = 2.2;

/** getter คืนค่า 0..1 = สัดส่วนคูลดาวน์ที่เหลือ (0 = พร้อมใช้) */
export type CooldownGetter = () => number;

/**
 * ระบบบังคับบนจอสัมผัสสไตล์ RoV:
 * - ซ้าย: จอยสติ๊กเสมือนแบบลอย (แตะตรงไหนก็ได้ในโซนซ้าย) + ปุ่มเปิด/ปิดวิ่ง
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
  sprintOn = false;

  private jumpHeldRaw = false;
  /** แตะสั้นๆ ก็ต้องนับเป็นกระโดด — ค้างสถานะขั้นต่ำไว้ให้เฟรมถัดไปเก็บทัน */
  private jumpMinHoldUntil = 0;

  get jumpHeld(): boolean {
    return this.jumpHeldRaw || performance.now() < this.jumpMinHoldUntil;
  }

  private dashQueue = 0;
  private attackQueue = 0;
  private anchorQueue = 0;
  private skillTapQueue = 0;
  private weaponQueue = 0;
  private skillsUnlocked = false;
  private blockHeldRaw = false;
  private mode: ControlMode = 'player';

  get blockHeld(): boolean {
    return this.blockHeldRaw && this.mode === 'player';
  }

  private joyPointerId: number | null = null;
  private camPointerId: number | null = null;
  private joyCenter = { x: 0, y: 0 };
  private lastCam = { x: 0, y: 0 };

  private root: HTMLDivElement;
  private joyBase: HTMLDivElement;
  private joyKnob: HTMLDivElement;
  private sprintBtn: HTMLDivElement;
  private cooldownRings = new Map<HTMLDivElement, CooldownGetter>();
  private toast: HTMLDivElement;
  private toastTimer: number | null = null;
  private attackBtn: HTMLDivElement;
  private dashBtn: HTMLDivElement;
  private jumpBtn: HTMLDivElement;
  private blockBtn: HTMLDivElement;
  private weaponBtn: HTMLDivElement;
  private skillButtons: HTMLDivElement[] = [];

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
          if (this.skillsUnlocked) {
            this.skillTapQueue = i;
          } else {
            this.showToast(`สกิล ${i} ปลดล็อกใน Phase 5 (Combat)`);
          }
        }),
      );
    }
    // ไม้ตาย (ล็อก รอ Phase 7)
    this.skillButtons.push(
      this.makeButton('tc-ult', '🔒', () =>
        this.showToast('ไม้ตายปลดล็อกใน Phase 7 (ผลไม้ปีศาจ)'),
      ),
    );

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

    // ---------- ปุ่มสลับวิ่ง (ข้างจอยสติ๊ก) ----------
    this.sprintBtn = this.makeButton('tc-sprint', '🏃', () => {
      this.sprintOn = !this.sprintOn;
      this.sprintBtn.classList.toggle('tc-on', this.sprintOn);
    });

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
    this.skillTapQueue = 0;
    if (mode === 'boat') {
      this.sprintOn = false;
      this.sprintBtn.classList.remove('tc-on');
    }
    this.setButtonLabel(this.dashBtn, mode === 'boat' ? '⚡' : '💨');
    this.setButtonLabel(this.jumpBtn, mode === 'boat' ? '⚓' : '⬆️');
    const display = mode === 'boat' ? 'none' : 'flex';
    this.attackBtn.style.display = display;
    this.sprintBtn.style.display = display;
    this.blockBtn.style.display = display;
    this.weaponBtn.style.display = display;
    for (const button of this.skillButtons) button.style.display = display;
    this.dashBtn.classList.toggle('tc-boat-boost', mode === 'boat');
  }

  /** ผูก getter คูลดาวน์ของ dash/โจมตี เพื่อวาดวงแหวนบนปุ่ม */
  bindCooldowns(dash: CooldownGetter, attack: CooldownGetter): void {
    this.cooldownRings.set(this.dashBtn, dash);
    this.cooldownRings.set(this.attackBtn, attack);
  }

  /** ปลดล็อกปุ่มสกิล 1-3 พร้อมตั้งไอคอน (เรียกโดย PlayerCombat) */
  unlockSkills(icons: [string, string, string]): void {
    this.skillsUnlocked = true;
    for (let i = 0; i < 3; i++) {
      this.setButtonLabel(this.skillButtons[i], icons[i]);
      this.skillButtons[i].classList.add('tc-skill-ready');
    }
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
    this.joyBase.classList.add('tc-visible');
    this.joystickActive = true;
    this.updateKnob(0, 0);
  }

  private pointerMove(e: PointerEvent): void {
    if (e.pointerId === this.joyPointerId) {
      const maxR = 55;
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
      this.joyPointerId = null;
      this.joystickActive = false;
      this.moveX = 0;
      this.moveZ = 0;
      this.joyBase.classList.remove('tc-visible');
    } else if (e.pointerId === this.camPointerId) {
      this.camPointerId = null;
    }
  }

  private updateKnob(dx: number, dy: number): void {
    this.joyKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
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

      .tc-joybase { position: absolute; width: 130px; height: 130px; border-radius: 50%;
                    background: rgba(255,255,255,.10); border: 2px solid rgba(255,255,255,.35);
                    transform: translate(-50%, -50%); display: none; }
      .tc-joybase.tc-visible { display: block; }
      .tc-joyknob { position: absolute; left: 50%; top: 50%; width: 58px; height: 58px;
                    border-radius: 50%; background: rgba(255,255,255,.45);
                    border: 2px solid rgba(255,255,255,.7);
                    transform: translate(-50%, -50%); }

      .tc-btn { position: absolute; border-radius: 50%; pointer-events: auto;
                touch-action: none; display: flex; align-items: center; justify-content: center;
                background: rgba(10,25,45,.55); border: 2px solid rgba(255,255,255,.45);
                color: #fff; box-shadow: 0 2px 8px rgba(0,0,0,.35); }
      .tc-btn:active { background: rgba(90,160,255,.5); }
      .tc-btn span { pointer-events: none; }

      .tc-attack { right: 22px;  bottom: 22px;  width: 88px; height: 88px; font-size: 38px;
                   border-color: rgba(255,120,90,.8); background: rgba(120,35,20,.55); }
      .tc-dash   { right: 128px; bottom: 30px;  width: 62px; height: 62px; font-size: 26px;
                   border-color: rgba(120,220,255,.8); }
      .tc-dash.tc-boat-boost { border-color:rgba(255,220,95,.9); background:rgba(100,72,12,.62); }
      .tc-jump   { right: 112px; bottom: 108px; width: 62px; height: 62px; font-size: 24px; }
      .tc-skill1 { right: 26px;  bottom: 134px; width: 56px; height: 56px; font-size: 20px; }
      .tc-skill2 { right: 92px;  bottom: 188px; width: 56px; height: 56px; font-size: 20px; }
      .tc-skill3 { right: 176px; bottom: 158px; width: 56px; height: 56px; font-size: 20px; }
      .tc-skill  { opacity: .55; }
      .tc-skill.tc-skill-ready { opacity: .95; border-color: rgba(140,235,190,.85);
                   background: rgba(14,66,48,.6); }
      .tc-ult    { right: 216px; bottom: 26px;  width: 70px; height: 70px; font-size: 24px;
                   border-color: rgba(200,120,255,.85); background: rgba(70,25,110,.55);
                   opacity: .65; }
      .tc-block  { right: 296px; bottom: 28px; width: 60px; height: 60px; font-size: 24px;
                   border-color: rgba(150,200,255,.8); }
      .tc-block.tc-on { background: rgba(90,160,255,.55); border-color: #bfe0ff; }
      .tc-weapon { right: 254px; bottom: 106px; width: 48px; height: 48px; font-size: 20px;
                   opacity: .9; border-color: rgba(255,215,140,.8); }
      .tc-sprint { left: 180px; bottom: 40px; width: 58px; height: 58px; font-size: 24px;
                   opacity: .8; }
      .tc-sprint.tc-on { background: rgba(255,215,90,.55); border-color: #ffd76b; }

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
