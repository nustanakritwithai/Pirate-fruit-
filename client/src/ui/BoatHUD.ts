import type { Boat } from '../boat/Boat';

export class BoatHUD {
  private readonly root: HTMLDivElement;
  private readonly hpFill: HTMLDivElement;
  private readonly hpText: HTMLSpanElement;
  private readonly speedText: HTMLSpanElement;
  private readonly stateText: HTMLSpanElement;
  private readonly boostText: HTMLSpanElement;
  private readonly toast: HTMLDivElement;
  private toastTimer = 0;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'boat-hud';
    this.root.innerHTML = `
      <div class="boat-hud-title">⛵ <span class="boat-name"></span></div>
      <div class="boat-hud-row"><span>HP เรือ</span><span class="boat-hp-text"></span></div>
      <div class="boat-hp"><div class="boat-hp-fill"></div></div>
      <div class="boat-hud-metrics">
        <span>ความเร็ว <b class="boat-speed">0</b></span>
        <span class="boat-state">ลอยลำ</span>
        <span>Boost <b class="boat-boost">พร้อม</b></span>
      </div>`;
    document.body.appendChild(this.root);
    this.hpFill = this.root.querySelector('.boat-hp-fill')!;
    this.hpText = this.root.querySelector('.boat-hp-text')!;
    this.speedText = this.root.querySelector('.boat-speed')!;
    this.stateText = this.root.querySelector('.boat-state')!;
    this.boostText = this.root.querySelector('.boat-boost')!;

    this.toast = document.createElement('div');
    this.toast.className = 'boat-toast';
    document.body.appendChild(this.toast);
    this.injectStyles();
    this.hide();
  }

  show(boat: Boat): void {
    this.root.querySelector<HTMLSpanElement>('.boat-name')!.textContent = boat.definition.name;
    this.root.style.display = 'block';
  }

  hide(): void {
    this.root.style.display = 'none';
  }

  update(boat: Boat | null, dt: number): void {
    this.toastTimer = Math.max(0, this.toastTimer - dt);
    if (this.toastTimer === 0) this.toast.classList.remove('visible');
    if (!boat || boat.state !== 'piloted') return;
    this.hpFill.style.width = `${boat.hpFraction * 100}%`;
    this.hpFill.classList.toggle('critical', boat.hpFraction < 0.3);
    this.hpText.textContent = `${Math.ceil(boat.hp)}/${boat.definition.maxHp}`;
    this.speedText.textContent = `${Math.abs(boat.speed).toFixed(1)} m/s`;
    this.stateText.textContent = boat.anchor ? '⚓ ทอดสมอ' : boat.boostTimer > 0 ? '⚡ Boost' : 'กำลังแล่น';
    this.boostText.textContent = boat.boostCooldown <= 0 ? 'พร้อม' : `${boat.boostCooldown.toFixed(1)}s`;
  }

  notify(message: string, danger = false): void {
    this.toast.textContent = message;
    this.toast.classList.toggle('danger', danger);
    this.toast.classList.add('visible');
    this.toastTimer = 2.2;
  }

  private injectStyles(): void {
    const style = document.createElement('style');
    style.textContent = `
      .boat-hud { position:fixed; z-index:24; right:12px; top:96px;
        width:196px; padding:7px 10px; box-sizing:border-box; color:#eefcff;
        border:1px solid rgba(123,218,239,.48); border-radius:10px;
        background:linear-gradient(135deg,rgba(5,26,38,.85),rgba(15,49,59,.78));
        box-shadow:0 4px 18px rgba(0,0,0,.36); backdrop-filter:blur(7px);
        font:600 10px 'Segoe UI',Tahoma,sans-serif; pointer-events:none; }
      .boat-hud-title { color:#ffe08a; font-size:12px; font-weight:800; margin-bottom:4px; }
      .boat-hud-row,.boat-hud-metrics { display:flex; justify-content:space-between; gap:6px; }
      .boat-hp { height:6px; margin:3px 0 5px; border-radius:4px; overflow:hidden; background:rgba(0,0,0,.45); }
      .boat-hp-fill { height:100%; background:linear-gradient(90deg,#3fd1aa,#78e58e); transition:width .12s; }
      .boat-hp-fill.critical { background:linear-gradient(90deg,#d82e2e,#ff6a45); }
      .boat-hud-metrics { color:#b9d6db; font-size:9px; }
      .boat-hud-metrics b { color:#fff; }
      .boat-toast { position:fixed; z-index:72; left:50%; top:25%; transform:translate(-50%,-8px);
        opacity:0; color:#fff; padding:9px 17px; border-radius:20px; background:rgba(7,34,45,.9);
        border:1px solid rgba(126,225,241,.6); font:700 13px 'Segoe UI',Tahoma,sans-serif;
        transition:opacity .2s,transform .2s; pointer-events:none; white-space:nowrap; }
      .boat-toast.visible { opacity:1; transform:translate(-50%,0); }
      .boat-toast.danger { background:rgba(92,22,17,.92); border-color:#ff765d; }
      @media(max-width:700px) { .boat-hud { right:8px; top:90px; width:150px; padding:6px 8px; }
        .boat-hud-title { font-size:11px; }
        .boat-hud-metrics { flex-wrap:wrap; gap:4px; } }
    `;
    document.head.appendChild(style);
  }
}
