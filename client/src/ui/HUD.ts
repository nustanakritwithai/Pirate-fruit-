import type { CharacterController } from '../player/CharacterController';
import type { Game } from '../engine/Game';
import { TouchControls } from './TouchControls';

/**
 * HUD พื้นฐาน (HTML overlay): Guard, พิกัด, FPS และคำแนะนำปุ่ม
 */
export class HUD {
  private posText: HTMLDivElement;
  private fpsText: HTMLDivElement;
  private timeText: HTMLDivElement;
  private damageFlash!: HTMLDivElement;

  constructor(
    private controller: CharacterController,
    private game: Game,
    private getClockLabel: () => string,
  ) {
    const style = document.createElement('style');
    style.textContent = `
      .hud { position: fixed; pointer-events: none; color: #fff;
             text-shadow: 0 1px 3px rgba(0,0,0,.7); z-index: 10; }
      .hud-bars { left: 50%; transform: translateX(-50%); bottom: 72px; width: 180px; }
      .hud-guard { height: 6px; margin-top: 3px; border-radius: 4px; overflow: hidden;
                   background: rgba(0,0,0,.4); border: 1px solid rgba(255,255,255,.25);
                   opacity: 0; transition: opacity .25s; }
      .hud-guard.visible { opacity: 1; }
      .guard-fill { height: 100%; background: linear-gradient(90deg, #6fc2ff, #a5dcff);
                    transition: width .1s linear; }
      .hud-info { right: 16px; top: 16px; text-align: right; font-size: 13px; }
      .hud-help { left: 16px; top: 310px; font-size: 13px; background: rgba(0,0,0,.4);
                  padding: 10px 14px; border-radius: 10px; line-height: 1.7; }
      .hud-help b { color: #ffd76b; }
      .hud-damage { position:fixed; inset:0; z-index:9; pointer-events:none; opacity:0;
        transition:opacity .35s ease-out;
        box-shadow: inset 0 0 120px 30px rgba(200,20,20,.65); }
      .hud-damage.hit { opacity:1; transition:opacity .04s; }
      @media(max-width:700px){
        .hud-bars { bottom:74px; width:160px; }
      }
    `;
    document.head.appendChild(style);

    this.damageFlash = document.createElement('div');
    this.damageFlash.className = 'hud-damage';
    document.body.appendChild(this.damageFlash);

    const bars = document.createElement('div');
    bars.className = 'hud hud-bars';
    bars.innerHTML = '<div class="hud-guard"><div class="guard-fill"></div></div>';
    document.body.appendChild(bars);

    const info = document.createElement('div');
    info.className = 'hud hud-info';
    info.innerHTML = `<div class="time"></div><div class="pos"></div><div class="fps"></div>`;
    document.body.appendChild(info);
    this.posText = info.querySelector('.pos')!;
    this.fpsText = info.querySelector('.fps')!;
    this.timeText = info.querySelector('.time')!;

    // บนมือถือมีปุ่มบนจอครบแล้ว ไม่ต้องแสดงคำแนะนำคีย์บอร์ด
    if (!TouchControls.isTouchDevice()) {
      const help = document.createElement('div');
      help.className = 'hud hud-help';
      help.innerHTML = `
        <b>WASD / ลูกศร</b> เดิน<br>
        <b>Shift</b> วิ่ง (ใช้ Energy)<br>
        <b>Space</b> กระโดด<br>
        <b>Q</b> พุ่งหลบ · <b>F</b> ยกโล่กัน<br>
        <b>R</b> สลับหมัด/ดาบ · <b>1-3</b> สกิล<br>
        <b>Z/X</b> ใช้ยา · <b>B</b> กระเป๋า · <b>K</b> เปิด Stats<br>
        <b>คลิกซ้าย</b> ล็อกเมาส์หมุนกล้อง (Esc ปลด) / คลิกอีกที = โจมตี<br>
        <b>ล้อเมาส์</b> ซูม<br>
        <span style="color:#9fd4ff">🎮 กด <b>แผงควบคุม</b> มุมซ้ายล่าง เพื่อเปิดจอย+ปุ่มแบบมือถือ</span>
      `;
      document.body.appendChild(help);
    }
  }

  private getGuardFraction: (() => number) | null = null;
  private isBlocking: (() => boolean) | null = null;

  /** ผูกแถบ Guard เข้ากับ PlayerCombat (เรียกครั้งเดียวตอนบูต) */
  bindGuard(getFraction: () => number, isBlocking: () => boolean): void {
    this.getGuardFraction = getFraction;
    this.isBlocking = isBlocking;
  }

  /** แฟลชขอบจอแดงสั้น ๆ ตอนผู้เล่นโดนตี */
  flashDamage(): void {
    this.damageFlash.classList.add('hit');
    requestAnimationFrame(() => this.damageFlash.classList.remove('hit'));
  }

  update(): void {
    const c = this.controller;
    // แถบ Guard: โชว์เฉพาะตอนบล็อกหรือ guard ยังไม่เต็ม
    if (this.getGuardFraction) {
      const fraction = this.getGuardFraction();
      const guardBar = document.querySelector<HTMLDivElement>('.hud-guard');
      const guardFill = document.querySelector<HTMLDivElement>('.guard-fill');
      if (guardBar && guardFill) {
        guardBar.classList.toggle('visible', fraction < 0.999 || (this.isBlocking?.() ?? false));
        guardFill.style.width = `${fraction * 100}%`;
      }
    }

    const p = c.position;
    this.posText.textContent = `X ${p.x.toFixed(1)}  Y ${p.y.toFixed(1)}  Z ${p.z.toFixed(1)}`;
    this.timeText.textContent = `☀ ${this.getClockLabel()}`;
    const tris = this.game.triangles >= 1000
      ? `${(this.game.triangles / 1000).toFixed(1)}k`
      : `${this.game.triangles}`;
    this.fpsText.textContent = `${this.game.fps} FPS · ${this.game.drawCalls} calls · ${tris} tris`;
  }
}
