/** ขอ fullscreen จาก gesture แรกของผู้เล่น โดยไม่ทำให้เกมเริ่มต้นด้วย overlay บังจอ */
export class FullscreenManager {
  private readonly prompt: HTMLButtonElement;
  private requested = false;
  private readonly onGesture = (): void => {
    void this.request();
  };

  constructor() {
    const root = document.createElement('div');
    root.className = 'fullscreen-prompt-root';
    root.innerHTML = '<button type="button" class="fullscreen-prompt">⛶ แตะเพื่อเต็มจอ</button>';
    document.body.appendChild(root);
    this.prompt = root.querySelector<HTMLButtonElement>('.fullscreen-prompt')!;
    this.prompt.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      void this.request();
    });

    const style = document.createElement('style');
    style.textContent = `
      .fullscreen-prompt-root { position:fixed; inset:0; z-index:120; display:none;
        align-items:flex-start; justify-content:center; padding-top:12px; pointer-events:none; }
      .fullscreen-prompt { pointer-events:auto; border:1px solid rgba(255,224,126,.7); border-radius:999px;
        padding:7px 13px; color:#fff4c6; background:rgba(5,23,34,.84); box-shadow:0 3px 14px rgba(0,0,0,.38);
        font:700 11px 'Segoe UI',Tahoma,sans-serif; cursor:pointer; touch-action:manipulation; }
      .fullscreen-prompt:active { transform:scale(.96); }
    `;
    document.head.appendChild(style);

    if (!this.supported()) {
      root.remove();
      return;
    }
    window.addEventListener('pointerdown', this.onGesture, { capture: true, passive: true });
    window.addEventListener('keydown', this.onGesture, { capture: true });
    document.addEventListener('fullscreenchange', () => this.sync(root));
    this.sync(root);
  }

  private supported(): boolean {
    const element = document.documentElement as HTMLElement & {
      requestFullscreen?: () => Promise<void>;
      webkitRequestFullscreen?: () => Promise<void> | void;
    };
    return Boolean(element.requestFullscreen || element.webkitRequestFullscreen);
  }

  private isFullscreen(): boolean {
    const doc = document as Document & { webkitFullscreenElement?: Element | null };
    return Boolean(document.fullscreenElement || doc.webkitFullscreenElement);
  }

  private async request(): Promise<void> {
    if (this.isFullscreen()) return;
    this.requested = true;
    const element = document.documentElement as HTMLElement & {
      requestFullscreen?: () => Promise<void>;
      webkitRequestFullscreen?: () => Promise<void> | void;
    };
    try {
      if (element.requestFullscreen) await element.requestFullscreen();
      else await element.webkitRequestFullscreen?.();
    } catch {
      // Browser policy/iOS อาจไม่อนุญาต — แสดงปุ่มเล็กให้ลอง gesture ถัดไป
      this.showPrompt();
    }
  }

  private sync(root: HTMLDivElement): void {
    root.style.display = this.isFullscreen() ? 'none' : this.requested ? 'flex' : 'none';
  }

  private showPrompt(): void {
    const root = this.prompt.parentElement;
    if (root) root.style.display = 'flex';
  }
}
