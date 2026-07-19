import {
  CHARACTER_NAME_MAX,
  sanitizeCharacterName,
  type CharacterListResponse,
  type CharacterSummary,
} from '@pirate-fruit/shared';
import { resolveRemoteApiUrl } from './RemoteSession';

/**
 * S18 — หน้าแรกแบบ MMORPG: login แขก (cookie) + เลือก/สร้าง/ลบตัวละคร 3 ช่อง
 * รันก่อนบูตเกม — resolve เมื่อผู้เล่นเลือกตัวละครแล้ว (หรือเลือกเล่นออฟไลน์)
 * ปิด flag / Server ไม่รองรับ (503) = ข้าม gate → บูตแบบเดิมทุกประการ
 */

function flagEnabled(value: string | undefined): boolean {
  return value === 'true' || value === '1';
}

interface GateContext {
  apiUrl: string;
  csrfToken: string | null;
}

async function api(
  context: GateContext,
  path: string,
  method: 'GET' | 'POST' | 'DELETE',
  body?: unknown,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 15_000);
  try {
    return await fetch(`${context.apiUrl}${path}`, {
      method,
      credentials: 'include',
      headers: {
        accept: 'application/json',
        ...(method === 'GET' ? {} : { 'content-type': 'application/json' }),
        ...(context.csrfToken && method !== 'GET'
          ? { 'x-csrf-token': context.csrfToken }
          : {}),
      },
      ...(method === 'GET' ? {} : { body: JSON.stringify(body ?? {}) }),
      signal: controller.signal,
    });
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

export class CharacterGate {
  private readonly root: HTMLDivElement;
  private readonly panel: HTMLDivElement;
  private resolveGate: (() => void) | null = null;

  constructor() {
    this.injectStyles();
    this.root = document.createElement('div');
    this.root.className = 'chargate-root';
    this.panel = document.createElement('div');
    this.panel.className = 'chargate-panel';
    this.root.appendChild(this.panel);
    document.body.appendChild(this.root);
  }

  /** จบ gate: ถอด UI แล้วปล่อยเกมบูตต่อ */
  finish(): void {
    this.root.remove();
    this.resolveGate?.();
    this.resolveGate = null;
  }

  wait(): Promise<void> {
    return new Promise((resolve) => {
      this.resolveGate = resolve;
    });
  }

  showLoading(message = 'กำลังเชื่อมต่อ...'): void {
    this.panel.innerHTML = `
      <div class="chargate-title">🏴‍☠️ Pirate Fruit</div>
      <div class="chargate-sub">${message}</div>`;
  }

  /** Server ไม่ตอบ — ให้เลือกเล่นออฟไลน์ (Local mode เดิม) หรือรอลองใหม่ */
  showOffline(onRetry: () => void): void {
    this.panel.innerHTML = `
      <div class="chargate-title">🏴‍☠️ Pirate Fruit</div>
      <div class="chargate-sub">เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ในตอนนี้</div>
      <div class="chargate-actions">
        <button class="chargate-btn" data-act="retry">ลองใหม่</button>
        <button class="chargate-btn chargate-btn-ghost" data-act="offline">เล่นแบบออฟไลน์</button>
      </div>`;
    this.panel.querySelector('[data-act="retry"]')!.addEventListener('click', onRetry);
    this.panel
      .querySelector('[data-act="offline"]')!
      .addEventListener('click', () => this.finish());
  }

  /** ยังไม่มีบัญชีบนเบราว์เซอร์นี้ → ตั้งชื่อตัวละครแรกเพื่อเริ่ม */
  showFirstRun(onSubmit: (name: string) => void): void {
    this.panel.innerHTML = `
      <div class="chargate-title">🏴‍☠️ Pirate Fruit</div>
      <div class="chargate-sub">ตั้งชื่อโจรสลัดของคุณเพื่อเริ่มการเดินทาง</div>
      <form class="chargate-form">
        <input class="chargate-input" name="name" maxlength="${CHARACTER_NAME_MAX}"
               placeholder="ชื่อตัวละคร (2-${CHARACTER_NAME_MAX} ตัวอักษร)" autocomplete="off" />
        <div class="chargate-error" hidden></div>
        <button class="chargate-btn" type="submit">⚓ เริ่มผจญภัย</button>
      </form>
      <div class="chargate-note">บัญชีแขกผูกกับเบราว์เซอร์นี้ — กลับมาเล่นต่อได้จากเครื่องเดิม</div>`;
    const form = this.panel.querySelector('form')!;
    const input = form.querySelector('input')!;
    const error = form.querySelector('.chargate-error') as HTMLElement;
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const name = sanitizeCharacterName(input.value);
      if (!name) {
        error.textContent = 'ชื่อต้องยาว 2-20 ตัวอักษร (ไทย/อังกฤษ/ตัวเลข)';
        error.hidden = false;
        return;
      }
      onSubmit(name);
    });
    input.focus();
  }

  showSlots(
    list: CharacterListResponse,
    handlers: {
      onPlay: (character: CharacterSummary) => void;
      onCreate: (name: string) => void;
      onDelete: (character: CharacterSummary) => void;
    },
  ): void {
    const slots: string[] = list.characters.map(
      (character) => `
      <div class="chargate-slot" data-id="${character.id}">
        <div class="chargate-slot-name">${escapeHtml(character.name)}${character.active ? ' <span class="chargate-active">กำลังเล่น</span>' : ''}</div>
        <div class="chargate-slot-meta">Lv.${character.level} · 🪙 ${character.coins.toLocaleString()}</div>
        <div class="chargate-slot-actions">
          <button class="chargate-btn" data-act="play">▶ เล่น</button>
          <button class="chargate-btn chargate-btn-danger" data-act="delete">🗑</button>
        </div>
      </div>`,
    );
    for (let i = list.characters.length; i < list.maxSlots; i++) {
      slots.push(`
      <div class="chargate-slot chargate-slot-empty" data-empty="1">
        <div class="chargate-slot-name">ช่องว่าง</div>
        <button class="chargate-btn chargate-btn-ghost" data-act="new">＋ สร้างตัวละคร</button>
      </div>`);
    }
    this.panel.innerHTML = `
      <div class="chargate-title">🏴‍☠️ เลือกตัวละคร</div>
      <div class="chargate-slots">${slots.join('')}</div>
      <div class="chargate-error" hidden></div>`;

    for (const slotEl of this.panel.querySelectorAll<HTMLElement>('.chargate-slot[data-id]')) {
      const character = list.characters.find((c) => c.id === slotEl.dataset.id)!;
      slotEl.querySelector('[data-act="play"]')!.addEventListener('click', () =>
        handlers.onPlay(character),
      );
      slotEl.querySelector('[data-act="delete"]')!.addEventListener('click', () => {
        if (globalThis.confirm(`ลบ "${character.name}" ถาวร? ของทั้งหมดของตัวละครนี้จะหายไป`)) {
          handlers.onDelete(character);
        }
      });
    }
    for (const btn of this.panel.querySelectorAll('[data-act="new"]')) {
      btn.addEventListener('click', () => {
        const raw = globalThis.prompt(`ตั้งชื่อตัวละครใหม่ (2-${CHARACTER_NAME_MAX} ตัวอักษร)`);
        if (raw === null) return;
        const name = sanitizeCharacterName(raw);
        if (!name) {
          this.showError('ชื่อต้องยาว 2-20 ตัวอักษร (ไทย/อังกฤษ/ตัวเลข)');
          return;
        }
        handlers.onCreate(name);
      });
    }
  }

  showError(message: string): void {
    const error = this.panel.querySelector('.chargate-error') as HTMLElement | null;
    if (error) {
      error.textContent = message;
      error.hidden = false;
    }
  }

  private injectStyles(): void {
    if (document.getElementById('chargate-styles')) return;
    const style = document.createElement('style');
    style.id = 'chargate-styles';
    style.textContent = `
      .chargate-root { position:fixed; inset:0; z-index:120; display:flex; align-items:center;
        justify-content:center; padding:20px; background:radial-gradient(ellipse at top, #0d2438, #050d16);
        font-family:'Segoe UI',Tahoma,sans-serif; color:#eaf6ff; }
      .chargate-panel { width:min(520px, 94vw); text-align:center; }
      .chargate-title { font-size:26px; font-weight:900; color:#ffd76b; text-shadow:0 2px 8px rgba(0,0,0,.6); }
      .chargate-sub { margin-top:8px; color:#9fc3d8; font-size:13px; }
      .chargate-form { margin-top:18px; display:flex; flex-direction:column; gap:10px; align-items:center; }
      .chargate-input { width:min(320px, 86vw); padding:11px 14px; border-radius:12px; font-size:15px;
        border:1px solid rgba(140,190,220,.4); background:rgba(8,24,38,.85); color:#fff; outline:none; }
      .chargate-input:focus { border-color:#ffd76b; }
      .chargate-btn { padding:10px 22px; border-radius:12px; border:0; cursor:pointer; font-weight:800;
        font-size:14px; color:#1d1405; background:linear-gradient(180deg,#ffd76b,#f0a93c); }
      .chargate-btn:active { transform:translateY(1px); }
      .chargate-btn-ghost { background:rgba(140,190,220,.15); color:#cfe8f5; border:1px solid rgba(140,190,220,.35); }
      .chargate-btn-danger { background:rgba(220,80,70,.18); color:#ff9b8e; border:1px solid rgba(220,80,70,.4); padding:10px 12px; }
      .chargate-actions { margin-top:16px; display:flex; gap:10px; justify-content:center; }
      .chargate-slots { margin-top:18px; display:flex; flex-direction:column; gap:10px; }
      .chargate-slot { display:flex; align-items:center; gap:12px; padding:12px 14px; border-radius:14px;
        background:rgba(12,32,50,.8); border:1px solid rgba(140,190,220,.25); text-align:left; }
      .chargate-slot-empty { justify-content:space-between; opacity:.85; }
      .chargate-slot-name { flex:1; font-weight:800; font-size:15px; }
      .chargate-active { font-size:10px; color:#8ff0c5; font-weight:700; margin-left:6px; }
      .chargate-slot-meta { color:#9fc3d8; font-size:12px; margin-right:8px; }
      .chargate-slot-actions { display:flex; gap:8px; }
      .chargate-error { margin-top:10px; color:#ff9b8e; font-size:12px; }
      .chargate-note { margin-top:14px; color:#6d92a8; font-size:11px; }
    `;
    document.head.appendChild(style);
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

function isCharacterList(value: unknown): value is CharacterListResponse {
  const candidate = value as Partial<CharacterListResponse> | null;
  return Boolean(candidate && candidate.ok === true && Array.isArray(candidate.characters));
}

/**
 * จุดเข้าเดียวจาก main.ts — คืนทันทีเมื่อ flag ปิด/ระบบ session ปิด
 * (Server flag ปิดแต่ client เปิด → เจอ 503 ที่ /api/characters แล้วข้าม gate เอง)
 */
export async function runCharacterGate(): Promise<void> {
  if (!flagEnabled(import.meta.env.VITE_ENABLE_CHARACTER_SELECT)) return;
  const apiUrl = resolveRemoteApiUrl();
  if (!apiUrl) return;

  const context: GateContext = { apiUrl, csrfToken: null };
  const gate = new CharacterGate();
  const done = gate.wait();

  const bootstrap = async (): Promise<void> => {
    gate.showLoading();
    let me: Response;
    try {
      me = await api(context, '/api/session/me', 'GET');
    } catch {
      gate.showOffline(() => void bootstrap());
      return;
    }

    if (me.status === 503) {
      // ระบบ session ฝั่ง Server ปิด → บูตแบบเดิม
      gate.finish();
      return;
    }

    if (me.status === 401) {
      gate.showFirstRun((name) => void createFirstCharacter(name));
      return;
    }

    if (!me.ok) {
      gate.showOffline(() => void bootstrap());
      return;
    }

    const payload = (await me.json().catch(() => null)) as
      | { csrfToken?: string }
      | null;
    context.csrfToken = payload?.csrfToken ?? null;
    await loadSlots();
  };

  const createFirstCharacter = async (name: string): Promise<void> => {
    gate.showLoading('กำลังสร้างตัวละคร...');
    try {
      const response = await api(context, '/api/session/guest', 'POST', { name });
      if (!response.ok) throw new Error(`guest failed (${response.status})`);
      gate.finish();
    } catch {
      gate.showOffline(() => void bootstrap());
    }
  };

  const loadSlots = async (): Promise<void> => {
    let response: Response;
    try {
      response = await api(context, '/api/characters', 'GET');
    } catch {
      gate.showOffline(() => void bootstrap());
      return;
    }
    if (response.status === 503) {
      // Server ยังไม่เปิด character select → เล่นแบบเดิม
      gate.finish();
      return;
    }
    if (response.status === 401) {
      gate.showFirstRun((name) => void createFirstCharacter(name));
      return;
    }
    const payload: unknown = await response.json().catch(() => null);
    if (!isCharacterList(payload)) {
      gate.showOffline(() => void bootstrap());
      return;
    }
    if (payload.characters.length === 0) {
      // ไม่มีตัวละคร (สภาพเก่า/ถูกลบหมดจากแท็บอื่น) — ให้สร้างผ่านช่องปกติ
      gate.showFirstRun((name) => void createInSlot(name));
      return;
    }
    gate.showSlots(payload, {
      onPlay: (character) => void play(character),
      onCreate: (name) => void createInSlot(name),
      onDelete: (character) => void remove(character),
    });
  };

  const play = async (character: CharacterSummary): Promise<void> => {
    if (character.active) {
      gate.finish();
      return;
    }
    try {
      const response = await api(
        context,
        `/api/characters/${character.id}/select`,
        'POST',
        {},
      );
      if (!response.ok) throw new Error(`select failed (${response.status})`);
      gate.finish();
    } catch {
      gate.showError('เลือกตัวละครไม่สำเร็จ — ลองใหม่อีกครั้ง');
    }
  };

  const createInSlot = async (name: string): Promise<void> => {
    try {
      const response = await api(context, '/api/characters', 'POST', { name });
      if (response.status === 409) {
        const body = (await response.json().catch(() => null)) as
          | { error?: { code?: string } }
          | null;
        gate.showError(
          body?.error?.code === 'CHARACTER_NAME_TAKEN'
            ? 'ชื่อนี้ถูกใช้แล้วในบัญชีของคุณ'
            : 'ช่องตัวละครเต็มแล้ว (สูงสุด 3 ตัว)',
        );
        return;
      }
      if (!response.ok) throw new Error(`create failed (${response.status})`);
      // Server ตั้งตัวใหม่เป็น active แล้ว → เข้าเกมเลย
      gate.finish();
    } catch {
      gate.showError('สร้างตัวละครไม่สำเร็จ — ลองใหม่อีกครั้ง');
    }
  };

  const remove = async (character: CharacterSummary): Promise<void> => {
    try {
      const response = await api(context, `/api/characters/${character.id}`, 'DELETE');
      if (!response.ok) throw new Error(`delete failed (${response.status})`);
      const body = (await response.json().catch(() => null)) as
        | { sessionRevoked?: boolean }
        | null;
      if (body?.sessionRevoked) {
        // ลบตัวสุดท้าย → บัญชีปิด กลับสู่หน้าสร้างตัวละครแรก
        context.csrfToken = null;
        gate.showFirstRun((name) => void createFirstCharacter(name));
        return;
      }
      await loadSlots();
    } catch {
      gate.showError('ลบตัวละครไม่สำเร็จ — ลองใหม่อีกครั้ง');
    }
  };

  void bootstrap();
  return done;
}
