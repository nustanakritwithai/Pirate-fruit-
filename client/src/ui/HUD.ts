import type { CharacterController } from '../player/CharacterController';
import type { Game } from '../engine/Game';
import { TouchControls } from './TouchControls';

/**
 * HUD พื้นฐาน (HTML overlay): แถบ HP, แถบ Energy, พิกัด, FPS และคำแนะนำปุ่ม
 */
export class HUD {
  private hpFill: HTMLDivElement;
  private energyFill: HTMLDivElement;
  private hpText: HTMLSpanElement;
  private energyText: HTMLSpanElement;
  private posText: HTMLDivElement;
  private fpsText: HTMLDivElement;

  constructor(
    private controller: CharacterController,
    private game: Game,
  ) {
    const style = document.createElement('style');
    style.textContent = `
      .hud { position: fixed; pointer-events: none; color: #fff;
             text-shadow: 0 1px 3px rgba(0,0,0,.7); z-index: 10; }
      .hud-bars { left: 50%; transform: translateX(-50%); bottom: 10px; width: 180px; }
      .hud-bar { height: 13px; border-radius: 7px; background: rgba(0,0,0,.45);
                 border: 1px solid rgba(255,255,255,.35); margin-top: 4px;
                 position: relative; overflow: hidden; }
      .hud-bar-fill { height: 100%; border-radius: 6px; transition: width .1s linear; }
      .hud-bar-label { position: absolute; inset: 0; font-size: 9px; line-height: 13px;
                       text-align: center; font-weight: 600; }
      .hp-fill { background: linear-gradient(#ff7a6b, #d92f1f); }
      .energy-fill { background: linear-gradient(#ffe97a, #e8b820); }
      .hud-info { right: 16px; top: 16px; text-align: right; font-size: 13px; }
      .hud-help { left: 16px; top: 172px; font-size: 13px; background: rgba(0,0,0,.4);
                  padding: 10px 14px; border-radius: 10px; line-height: 1.7; }
      .hud-help b { color: #ffd76b; }
    `;
    document.head.appendChild(style);

    const bars = document.createElement('div');
    bars.className = 'hud hud-bars';
    bars.innerHTML = `
      <div class="hud-bar"><div class="hud-bar-fill hp-fill"></div>
        <div class="hud-bar-label">HP <span class="hp-num"></span></div></div>
      <div class="hud-bar"><div class="hud-bar-fill energy-fill"></div>
        <div class="hud-bar-label">Energy <span class="energy-num"></span></div></div>
    `;
    document.body.appendChild(bars);
    this.hpFill = bars.querySelector('.hp-fill')!;
    this.energyFill = bars.querySelector('.energy-fill')!;
    this.hpText = bars.querySelector('.hp-num')!;
    this.energyText = bars.querySelector('.energy-num')!;

    const info = document.createElement('div');
    info.className = 'hud hud-info';
    info.innerHTML = `<div class="pos"></div><div class="fps"></div>`;
    document.body.appendChild(info);
    this.posText = info.querySelector('.pos')!;
    this.fpsText = info.querySelector('.fps')!;

    // บนมือถือมีปุ่มบนจอครบแล้ว ไม่ต้องแสดงคำแนะนำคีย์บอร์ด
    if (!TouchControls.isTouchDevice()) {
      const help = document.createElement('div');
      help.className = 'hud hud-help';
      help.innerHTML = `
        <b>WASD / ลูกศร</b> เดิน<br>
        <b>Shift</b> วิ่ง (ใช้ Energy)<br>
        <b>Space</b> กระโดด<br>
        <b>Q</b> พุ่งหลบ<br>
        <b>คลิกซ้าย</b> ล็อกเมาส์หมุนกล้อง (Esc ปลด) / คลิกอีกที = โจมตี<br>
        <b>ล้อเมาส์</b> ซูม
      `;
      document.body.appendChild(help);
    }
  }

  update(): void {
    const c = this.controller;
    this.hpFill.style.width = `${(c.hp / c.hpMax) * 100}%`;
    this.energyFill.style.width = `${(c.energy / c.energyMax) * 100}%`;
    this.hpText.textContent = `${Math.round(c.hp)}/${c.hpMax}`;
    this.energyText.textContent = `${Math.round(c.energy)}/${c.energyMax}`;

    const p = c.position;
    this.posText.textContent = `X ${p.x.toFixed(1)}  Y ${p.y.toFixed(1)}  Z ${p.z.toFixed(1)}`;
    this.fpsText.textContent = `${this.game.fps} FPS`;
  }
}
