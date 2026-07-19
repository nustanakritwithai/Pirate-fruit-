import type { AudioManager } from './AudioManager';
import type { AudioSettings, AudioRuntimeStatus } from './types';

const STYLE_ID = 'pirate-audio-settings-style';

function installStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .audio-toggle{position:fixed;z-index:46;top:max(92px,calc(env(safe-area-inset-top) + 82px));right:max(60px,calc(env(safe-area-inset-right) + 50px));width:42px;height:42px;border-radius:50%;border:1px solid #8bd9cf88;background:#071e29dd;color:#fff;font-size:19px;box-shadow:0 3px 14px #0008;cursor:pointer;touch-action:manipulation}
    .audio-toggle[data-locked="true"]{animation:audio-pulse 1.6s infinite;border-color:#ffd36f}
    .audio-panel{position:fixed;z-index:47;top:max(92px,calc(env(safe-area-inset-top) + 82px));left:50%;transform:translateX(-50%);width:min(280px,calc(100vw - 20px));box-sizing:border-box;padding:14px;border-radius:15px;border:1px solid #8bd9cf66;background:#061923f2;color:#eefcf8;font:600 13px/1.3 sans-serif;box-shadow:0 8px 30px #000a;backdrop-filter:blur(8px)}
    .audio-panel[hidden]{display:none}.audio-panel h2{font-size:15px;margin:0 0 9px}.audio-status{margin:0 0 10px;color:#b8ddd7;font-size:11px}.audio-unlock{width:100%;min-height:38px;margin-bottom:9px;border:1px solid #ffd36f88;border-radius:9px;background:#5c4519;color:#fff4cc;font-weight:700}.audio-row{display:grid;grid-template-columns:76px 1fr 34px;gap:7px;align-items:center;min-height:34px}.audio-row input{width:100%;accent-color:#67d9c2}.audio-row output{text-align:right;color:#bcefe4;font-variant-numeric:tabular-nums}.audio-mute{width:100%;min-height:38px;margin-top:8px;border:1px solid #8bd9cf88;border-radius:9px;background:#123d47;color:#fff;font-weight:700}
    @keyframes audio-pulse{50%{box-shadow:0 0 0 7px #ffd36f22}}
    @media(max-width:600px){.audio-toggle{top:max(88px,calc(env(safe-area-inset-top) + 78px));right:max(46px,calc(env(safe-area-inset-right) + 38px));width:38px;height:38px}.audio-panel{top:max(164px,calc(env(safe-area-inset-top) + 154px));left:max(10px,env(safe-area-inset-left));transform:none;width:210px;max-height:calc(100vh - 176px);overflow:auto}.audio-row{grid-template-columns:64px 1fr 31px;min-height:38px}}
    @media(prefers-reduced-motion:reduce){.audio-toggle[data-locked="true"]{animation:none}}
  `;
  document.head.appendChild(style);
}

const LABELS: Record<AudioRuntimeStatus, string> = {
  disabled: 'ระบบเสียงปิดด้วย feature flag',
  locked: 'เสียงยังถูกล็อก — แตะเพื่อเปิดเสียง',
  running: 'ระบบเสียงพร้อมใช้งาน',
  suspended: 'พักเสียงขณะซ่อนแท็บ',
  failed: 'อุปกรณ์เปิดเสียงไม่ได้ แต่เกมยังเล่นต่อได้',
};

export class AudioSettingsUI {
  readonly toggle: HTMLButtonElement;
  readonly panel: HTMLDivElement;
  private readonly status: HTMLParagraphElement;
  private readonly unlock: HTMLButtonElement;
  private readonly mute: HTMLButtonElement;
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly audio: AudioManager) {
    installStyles();
    this.toggle = document.createElement('button');
    this.toggle.className = 'audio-toggle';
    this.toggle.type = 'button';
    this.toggle.setAttribute('aria-label', 'เปิดการตั้งค่าเสียง');
    this.toggle.setAttribute('aria-expanded', 'false');
    this.toggle.textContent = audio.settings.muted ? '🔇' : '🔊';

    this.panel = document.createElement('div');
    this.panel.className = 'audio-panel';
    this.panel.hidden = true;
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-label', 'การตั้งค่าเสียงเกม');
    const title = document.createElement('h2');
    title.textContent = 'เสียง Pirate Fruit';
    this.status = document.createElement('p');
    this.status.className = 'audio-status';
    this.status.setAttribute('aria-live', 'polite');
    this.unlock = document.createElement('button');
    this.unlock.type = 'button';
    this.unlock.className = 'audio-unlock';
    this.unlock.textContent = 'แตะเพื่อเปิดเสียง';
    this.unlock.addEventListener('click', () => { void this.audio.unlock(); });
    this.panel.append(title, this.status, this.unlock);

    this.addSlider('master', 'เสียงรวม');
    this.addSlider('music', 'เพลง');
    this.addSlider('sfx', 'เอฟเฟกต์');
    this.addSlider('ambience', 'บรรยากาศ');

    this.mute = document.createElement('button');
    this.mute.type = 'button';
    this.mute.className = 'audio-mute';
    this.mute.addEventListener('click', () => {
      this.audio.toggleMute();
      this.renderSettings();
    });
    this.panel.appendChild(this.mute);
    document.body.append(this.toggle, this.panel);

    this.toggle.addEventListener('click', () => this.setOpen(this.panel.hidden));
    document.addEventListener('keydown', this.onKeyDown);
    this.unsubscribe = audio.onStatus((status) => this.renderStatus(status));
    this.renderSettings();
  }

  private addSlider(key: keyof Pick<AudioSettings, 'master' | 'music' | 'sfx' | 'ambience'>, label: string): void {
    const row = document.createElement('label');
    row.className = 'audio-row';
    const name = document.createElement('span');
    name.textContent = label;
    const input = document.createElement('input');
    input.type = 'range';
    input.min = '0';
    input.max = '1';
    input.step = '0.05';
    input.value = String(this.audio.settings[key]);
    input.dataset.audioSetting = key;
    input.setAttribute('aria-label', `ปรับ${label}`);
    const output = document.createElement('output');
    output.value = `${Math.round(this.audio.settings[key] * 100)}%`;
    input.addEventListener('input', () => {
      const value = Number(input.value);
      output.value = `${Math.round(value * 100)}%`;
      this.audio.updateSettings({ [key]: value });
    });
    row.append(name, input, output);
    this.panel.appendChild(row);
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && !this.panel.hidden) this.setOpen(false);
    if (event.key.toLowerCase() === 'm' && !event.repeat && !(event.target instanceof HTMLInputElement)) {
      this.audio.toggleMute();
      this.renderSettings();
    }
  };

  private setOpen(open: boolean): void {
    this.panel.hidden = !open;
    this.toggle.setAttribute('aria-expanded', String(open));
    if (open) this.panel.querySelector<HTMLElement>('button,input')?.focus();
  }

  private renderStatus(status: AudioRuntimeStatus): void {
    this.status.textContent = LABELS[status];
    const locked = status === 'locked' || status === 'failed';
    this.toggle.dataset.locked = String(locked);
    this.unlock.hidden = !locked;
  }

  private renderSettings(): void {
    this.toggle.textContent = this.audio.settings.muted ? '🔇' : '🔊';
    this.mute.textContent = this.audio.settings.muted ? 'เปิดเสียง' : 'ปิดเสียงทั้งหมด';
    for (const input of this.panel.querySelectorAll<HTMLInputElement>('input[data-audio-setting]')) {
      const key = input.dataset.audioSetting as keyof AudioSettings;
      input.value = String(this.audio.settings[key]);
      const output = input.nextElementSibling as HTMLOutputElement | null;
      if (output) output.value = `${Math.round(Number(input.value) * 100)}%`;
    }
  }

  dispose(): void {
    this.unsubscribe?.();
    document.removeEventListener('keydown', this.onKeyDown);
    this.toggle.remove();
    this.panel.remove();
  }
}
