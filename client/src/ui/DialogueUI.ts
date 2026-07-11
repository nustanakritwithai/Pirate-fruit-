export interface DialogueContent {
  name: string;
  role: string;
  pages: string[];
  actionLabel?: string;
  onAction?: () => void;
}

/** กล่องบทสนทนาแบบหลายหน้า รองรับปุ่มแตะและคีย์บอร์ด */
export class DialogueUI {
  private readonly root: HTMLDivElement;
  private readonly nameElement: HTMLDivElement;
  private readonly roleElement: HTMLDivElement;
  private readonly textElement: HTMLDivElement;
  private readonly pageElement: HTMLDivElement;
  private readonly nextButton: HTMLButtonElement;
  private readonly actionButton: HTMLButtonElement;
  private content: DialogueContent | null = null;
  private page = 0;
  private onClose: (() => void) | null = null;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'dialogue-root';
    this.root.innerHTML = `
      <div class="dialogue-card">
        <div class="dialogue-head"><div><div class="dialogue-name"></div><div class="dialogue-role"></div></div>
          <button class="dialogue-close" type="button" aria-label="ปิด">×</button></div>
        <div class="dialogue-text"></div>
        <div class="dialogue-foot"><div class="dialogue-page"></div><div class="dialogue-actions">
          <button class="dialogue-action" type="button"></button>
          <button class="dialogue-next" type="button">ถัดไป ›</button></div></div>
      </div>`;
    document.body.appendChild(this.root);
    this.nameElement = this.root.querySelector('.dialogue-name')!;
    this.roleElement = this.root.querySelector('.dialogue-role')!;
    this.textElement = this.root.querySelector('.dialogue-text')!;
    this.pageElement = this.root.querySelector('.dialogue-page')!;
    this.nextButton = this.root.querySelector('.dialogue-next')!;
    this.actionButton = this.root.querySelector('.dialogue-action')!;
    this.nextButton.addEventListener('click', () => this.advance());
    this.actionButton.addEventListener('click', () => {
      const action = this.content?.onAction;
      this.close();
      action?.();
    });
    this.root.querySelector<HTMLButtonElement>('.dialogue-close')!.addEventListener('click', () => this.close());
    window.addEventListener('keydown', (event) => {
      if (!this.isOpen) return;
      if (event.code === 'Escape') this.close();
      if (event.code === 'Enter' || event.code === 'KeyE') this.advance();
    });
    this.injectStyles();
    this.root.style.display = 'none';
  }

  get isOpen(): boolean {
    return this.content !== null;
  }

  open(content: DialogueContent, onClose: () => void): void {
    if (document.pointerLockElement) document.exitPointerLock();
    this.content = content;
    this.page = 0;
    this.onClose = onClose;
    this.nameElement.textContent = content.name;
    this.roleElement.textContent = content.role;
    this.root.style.display = 'flex';
    this.renderPage();
  }

  close(): void {
    if (!this.content) return;
    this.content = null;
    this.root.style.display = 'none';
    const callback = this.onClose;
    this.onClose = null;
    callback?.();
  }

  private advance(): void {
    if (!this.content) return;
    if (this.page >= this.content.pages.length - 1) {
      this.close();
      return;
    }
    this.page++;
    this.renderPage();
  }

  private renderPage(): void {
    if (!this.content) return;
    this.textElement.textContent = this.content.pages[this.page];
    this.pageElement.textContent = `${this.page + 1} / ${this.content.pages.length}`;
    this.nextButton.textContent = this.page === this.content.pages.length - 1 ? 'จบการสนทนา' : 'ถัดไป ›';
    const showAction = this.page === this.content.pages.length - 1 && Boolean(this.content.actionLabel);
    this.actionButton.style.display = showAction ? 'inline-block' : 'none';
    this.actionButton.textContent = this.content.actionLabel ?? '';
  }

  private injectStyles(): void {
    const style = document.createElement('style');
    style.textContent = `
      .dialogue-root { position:fixed; inset:0; z-index:60; display:flex; align-items:flex-end;
        justify-content:center; pointer-events:none; padding:0 14px 42px; box-sizing:border-box;
        font-family:'Segoe UI',Tahoma,sans-serif; }
      .dialogue-card { width:min(620px,100%); pointer-events:auto; color:#f7f4e8;
        background:linear-gradient(145deg,rgba(9,24,34,.96),rgba(19,43,51,.96));
        border:1px solid rgba(255,211,117,.58); border-radius:16px; padding:16px 18px 14px;
        box-shadow:0 8px 35px rgba(0,0,0,.58); backdrop-filter:blur(10px); }
      .dialogue-head,.dialogue-foot { display:flex; align-items:center; justify-content:space-between; gap:12px; }
      .dialogue-name { color:#ffda7a; font-size:18px; font-weight:800; }
      .dialogue-role,.dialogue-page { color:#9fb7bd; font-size:11px; margin-top:2px; }
      .dialogue-text { min-height:54px; margin:13px 0 15px; line-height:1.62; font-size:15px; }
      .dialogue-close { border:0; color:#c7d2d4; background:transparent; font-size:27px; cursor:pointer; }
      .dialogue-next { border:1px solid rgba(255,218,122,.65); border-radius:16px; padding:7px 14px;
        color:#1c2930; background:#ffda7a; font-weight:800; cursor:pointer; touch-action:manipulation; }
      .dialogue-actions { display:flex; align-items:center; gap:7px; }
      .dialogue-action { display:none; border:1px solid rgba(126,225,241,.55); border-radius:16px; padding:7px 14px;
        color:#e8fbff; background:rgba(19,102,120,.72); font-weight:800; cursor:pointer; touch-action:manipulation; }
      @media (max-width:700px) { .dialogue-root { padding-bottom:122px; }
        .dialogue-card { padding:14px; } .dialogue-text { font-size:14px; min-height:62px; } }
    `;
    document.head.appendChild(style);
  }
}
