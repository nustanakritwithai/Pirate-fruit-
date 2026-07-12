/** แถบเลือดบอสกลางด้านบน โผล่เมื่อเข้าสู้บอส (DOM overlay) */
export class BossBar {
  private readonly root: HTMLDivElement;
  private readonly fill: HTMLDivElement;
  private readonly nameEl: HTMLSpanElement;

  constructor() {
    const style = document.createElement('style');
    style.textContent = `
      .boss-bar { position:fixed; z-index:26; left:50%; top:50px; transform:translateX(-50%);
        width:min(300px,60vw); padding:4px 8px 6px; box-sizing:border-box; color:#fff;
        border:1px solid rgba(255,120,110,.5); border-radius:9px;
        background:linear-gradient(180deg,rgba(40,8,10,.72),rgba(20,6,10,.62));
        box-shadow:0 3px 12px rgba(0,0,0,.35); backdrop-filter:blur(4px);
        text-shadow:0 1px 2px #000; pointer-events:none; display:none; }
      .boss-bar-name { display:flex; justify-content:space-between; font:800 10px 'Segoe UI',Tahoma,sans-serif;
        color:#ffd0c0; margin-bottom:3px; }
      .boss-bar-track { height:6px; border-radius:4px; overflow:hidden; background:rgba(0,0,0,.5);
        border:1px solid rgba(255,255,255,.2); }
      .boss-bar-fill { height:100%; width:100%; transition:width .15s linear;
        background:linear-gradient(90deg,#ff5b45,#ff9161); }
      @media(max-width:700px){ .boss-bar{ top:34px; width:min(250px,58vw); } }
    `;
    document.head.appendChild(style);

    this.root = document.createElement('div');
    this.root.className = 'boss-bar';
    this.root.innerHTML = `
      <div class="boss-bar-name"><span class="boss-bar-title"></span><span class="boss-bar-lv"></span></div>
      <div class="boss-bar-track"><div class="boss-bar-fill"></div></div>`;
    document.body.appendChild(this.root);
    this.fill = this.root.querySelector('.boss-bar-fill')!;
    this.nameEl = this.root.querySelector('.boss-bar-title')!;
    this.root.querySelector<HTMLSpanElement>('.boss-bar-lv')!;
  }

  show(name: string, level: number): void {
    this.nameEl.textContent = `☠ ${name}`;
    this.root.querySelector<HTMLSpanElement>('.boss-bar-lv')!.textContent = `Lv.${level}`;
    this.root.style.display = 'block';
  }

  setFraction(fraction: number): void {
    this.fill.style.width = `${Math.max(0, Math.min(1, fraction)) * 100}%`;
  }

  hide(): void {
    this.root.style.display = 'none';
  }
}
