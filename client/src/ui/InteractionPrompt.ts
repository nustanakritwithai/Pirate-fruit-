import { isTouchDevice } from '../engine/device';

/** ปุ่ม/ข้อความโต้ตอบร่วมกันระหว่างคีย์บอร์ดและจอสัมผัส */
export class InteractionPrompt {
  private readonly element: HTMLButtonElement;
  private requested = false;

  constructor() {
    this.element = document.createElement('button');
    this.element.className = 'interaction-prompt';
    this.element.type = 'button';
    this.element.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      this.requested = true;
    });
    document.body.appendChild(this.element);
    this.hide();

    // มือถือ: เป็นปุ่มกดชิดขอบล่างจอ (ไม่บังกลางภาพ) / PC: ป้ายบอกกด E ใกล้ขอบล่าง
    const style = document.createElement('style');
    style.textContent = `
      .interaction-prompt {
        position: fixed; z-index: 34; left: 50%; bottom: ${isTouchDevice() ? '10px' : '72px'};
        transform: translateX(-50%); color: #fff; border: 2px solid rgba(255,226,145,.85);
        border-radius: 24px; padding: ${isTouchDevice() ? '11px 22px' : '9px 16px'};
        background: linear-gradient(180deg, rgba(24,40,54,.92), rgba(10,22,32,.92));
        box-shadow: 0 3px 14px rgba(0,0,0,.5); font: 700 ${isTouchDevice() ? '15px' : '13px'} 'Segoe UI',Tahoma,sans-serif;
        white-space: nowrap; touch-action: manipulation; backdrop-filter: blur(6px);
        max-width: 62vw; overflow: hidden; text-overflow: ellipsis;
      }
      .interaction-prompt strong { color: #ffdd7d; }
      .interaction-prompt:active { transform: translateX(-50%) scale(.94); background: rgba(90,130,90,.85); }
    `;
    document.head.appendChild(style);
  }

  show(name: string): void {
    this.showAction('คุยกับ', name, '💬');
  }

  showAction(action: string, target = '', icon = '◆'): void {
    const label = target ? `${action} <strong>${target}</strong>` : action;
    this.element.innerHTML = isTouchDevice()
      ? `${icon} ${label}`
      : `<strong>E</strong> · ${label}`;
    this.element.style.display = 'block';
  }

  hide(): void {
    this.element.style.display = 'none';
    this.requested = false;
  }

  consumeRequested(): boolean {
    if (!this.requested) return false;
    this.requested = false;
    return true;
  }
}
