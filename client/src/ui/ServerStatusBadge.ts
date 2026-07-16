import type { PersistenceMode } from '../persistence/GamePersistence';
import type { SessionConnectionMode } from '../session/RemoteSession';

export interface ServerStatusState {
  session: SessionConnectionMode;
  save: PersistenceMode;
  economy: PersistenceMode;
  reconnecting: boolean;
  /** สาเหตุล่าสุดที่ Remote Save ตกลง Local — โชว์ใต้ป้ายให้วินิจฉัยจากภาพหน้าจอได้ */
  saveFallbackReason?: string | null;
}

export class ServerStatusBadge {
  private readonly element: HTMLDivElement;
  private readonly label: HTMLDivElement;
  private readonly detail: HTMLDivElement;

  constructor() {
    this.element = document.createElement('div');
    this.element.dataset.testid = 'server-status';
    this.element.style.cssText = [
      'position:fixed',
      'top:10px',
      'left:50%',
      'transform:translateX(-50%)',
      'z-index:95',
      'padding:6px 11px',
      'border-radius:14px',
      'font:700 11px/1.2 system-ui,sans-serif',
      'letter-spacing:.03em',
      'box-shadow:0 4px 14px #0008',
      'pointer-events:none',
      'text-align:center',
      'max-width:86vw',
    ].join(';');
    this.label = document.createElement('div');
    this.label.style.whiteSpace = 'nowrap';
    this.detail = document.createElement('div');
    this.detail.style.cssText = [
      'font:600 9px/1.3 system-ui,sans-serif',
      'opacity:.85',
      'margin-top:2px',
      'white-space:nowrap',
      'overflow:hidden',
      'text-overflow:ellipsis',
      'display:none',
    ].join(';');
    this.element.append(this.label, this.detail);
    document.body.appendChild(this.element);
  }

  update(state: ServerStatusState): void {
    const online = state.session === 'online'
      && state.save === 'remote'
      && state.economy === 'remote';
    this.element.dataset.mode = online
      ? 'remote'
      : state.reconnecting
        ? 'connecting'
        : state.session === 'online'
          ? 'degraded'
          : 'local';
    // แถวเหตุผล: โชว์เฉพาะตอน save ตกโหมด local ทั้งที่ session ต่อได้ (เคสที่ต้องวินิจฉัย)
    const reason = state.session === 'online' && state.save === 'local' && !state.reconnecting
      ? state.saveFallbackReason ?? null
      : null;
    this.detail.textContent = reason ?? '';
    this.detail.style.display = reason ? 'block' : 'none';
    if (online) {
      this.label.textContent = '🌐 SERVER ONLINE · SAVE REMOTE';
      this.element.style.color = '#dfffea';
      this.element.style.background = '#087443e8';
      return;
    }
    if (state.reconnecting) {
      this.label.textContent = '⏳ SERVER กำลังตื่น · เล่น LOCAL ชั่วคราว';
      this.element.style.color = '#fff7d6';
      this.element.style.background = '#806000e8';
      return;
    }
    if (state.session === 'online') {
      this.label.textContent = state.save === 'local'
        ? '⚠ SERVER ONLINE · SAVE LOCAL'
        : '⚠ SERVER ONLINE · ECONOMY LOCAL';
      this.element.style.color = '#fff7d6';
      this.element.style.background = '#806000e8';
      return;
    }
    this.label.textContent = '⚠ SESSION OFFLINE · PLAYING LOCAL';
    this.element.style.color = '#ffe8e4';
    this.element.style.background = '#8b2f25e8';
  }
}
