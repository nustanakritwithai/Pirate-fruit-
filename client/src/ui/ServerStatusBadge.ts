import type { PersistenceMode } from '../persistence/GamePersistence';
import type { SessionConnectionMode } from '../session/RemoteSession';

export interface ServerStatusState {
  session: SessionConnectionMode;
  save: PersistenceMode;
  economy: PersistenceMode;
  reconnecting: boolean;
}

export class ServerStatusBadge {
  private readonly element: HTMLDivElement;

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
      'border-radius:999px',
      'font:700 11px/1.2 system-ui,sans-serif',
      'letter-spacing:.03em',
      'box-shadow:0 4px 14px #0008',
      'pointer-events:none',
      'white-space:nowrap',
    ].join(';');
    document.body.appendChild(this.element);
  }

  update(state: ServerStatusState): void {
    const online = state.session === 'online'
      && state.save === 'remote'
      && state.economy === 'remote';
    this.element.dataset.mode = online ? 'remote' : state.reconnecting ? 'connecting' : 'local';
    if (online) {
      this.element.textContent = '🌐 SERVER ONLINE · SAVE REMOTE';
      this.element.style.color = '#dfffea';
      this.element.style.background = '#087443e8';
      return;
    }
    if (state.reconnecting) {
      this.element.textContent = '⏳ SERVER กำลังตื่น · เล่น LOCAL ชั่วคราว';
      this.element.style.color = '#fff7d6';
      this.element.style.background = '#806000e8';
      return;
    }
    this.element.textContent = '⚠ LOCAL FALLBACK · SERVER OFFLINE';
    this.element.style.color = '#ffe8e4';
    this.element.style.background = '#8b2f25e8';
  }
}
