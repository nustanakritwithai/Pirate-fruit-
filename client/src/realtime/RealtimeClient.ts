/**
 * S9 — WebSocket Foundation ฝั่งเกม
 * รับ push จาก Server (economy/announcement) แทนการ poll ทุก 5 วิ เมื่อเชื่อมได้
 * - auth ด้วย session cookie ใบเดียวกับ REST (credentialed WS)
 * - heartbeat ping ตามรอบที่ Server แจ้งใน welcome; เงียบเกิน = ตัดแล้วต่อใหม่
 * - reconnect แบบ exponential backoff + jitter (สูงสุด 30 วิ)
 * - sequence ต่อ connection: เห็น seq กระโดด = พลาดข้อความ → ขอ resync ทาง REST
 *   (ข้อความ seq ย้อนหลังถูกทิ้ง — กัน out-of-order/ซ้ำ)
 */

import {
  REALTIME_HEARTBEAT_INTERVAL_MS,
  REALTIME_PROTOCOL_VERSION,
  type RealtimeServerMessage,
} from '@pirate-fruit/shared';
import { getRemoteSession } from '../session/RemoteSession';

export interface RealtimeSocketLike {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
}

export interface RealtimePresenceSnapshot {
  playerId: string;
  name: string;
  islandId: string;
  x: number;
  y: number;
  z: number;
  heading: number;
  onBoat: boolean;
  /** S14: รุ่นเรือที่ขับอยู่ (undefined = เดินเท้า) */
  boatId?: string;
}

export interface RealtimeHandlers {
  onEconomy(state: { schemaVersion: number; world: string }, tick: number): void;
  /** seq กระโดด/หลุดช่วง — ผู้เรียกควรดึง snapshot ทาง REST หนึ่งครั้ง */
  onResync(): void;
  onAnnouncement?(message: string, level: 'info' | 'warning'): void;
  onStatusChange?(connected: boolean): void;
  /** S13: presence ของผู้เล่นคนอื่น (ตำแหน่งล่าสุด — apply ได้เลยไม่ต้องสน seq gap) */
  onPresence?(snapshot: RealtimePresenceSnapshot): void;
  onPresenceLeave?(playerId: string): void;
}

export interface RealtimeClientOptions {
  webSocketFactory?: (url: string) => RealtimeSocketLike;
  /** ฐาน backoff (มิลลิวินาที) — เทสต์ตั้งต่ำได้ */
  backoffBaseMs?: number;
  backoffMaxMs?: number;
  random?: () => number;
}

const OPEN = 1;

export class RealtimeClient {
  private socket: RealtimeSocketLike | null = null;
  private stopped = true;
  private attempts = 0;
  private lastSeq = 0;
  private sawWelcome = false;
  private heartbeatMs = REALTIME_HEARTBEAT_INTERVAL_MS;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private isConnected = false;

  constructor(
    private readonly url: string,
    private readonly handlers: RealtimeHandlers,
    private readonly options: RealtimeClientOptions = {},
  ) {}

  get connected(): boolean {
    return this.isConnected;
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.clearTimers();
    this.socket?.close(1000, 'client stopped');
    this.socket = null;
    this.setConnected(false);
  }

  private connect(): void {
    if (this.stopped) return;
    const factory = this.options.webSocketFactory
      ?? ((url: string) => new WebSocket(url) as unknown as RealtimeSocketLike);
    let socket: RealtimeSocketLike;
    try {
      socket = factory(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;
    this.lastSeq = 0;
    this.sawWelcome = false;

    socket.onopen = () => {
      this.attempts = 0;
      this.armIdleWatchdog();
    };
    socket.onmessage = (event) => this.handleMessage(String(event.data));
    socket.onclose = () => this.handleDisconnect();
    socket.onerror = () => {
      // onclose ตามมาเสมอ — ปล่อยให้ handleDisconnect จัดการ
    };
  }

  private handleMessage(raw: string): void {
    this.armIdleWatchdog();
    let message: RealtimeServerMessage;
    try {
      message = JSON.parse(raw) as RealtimeServerMessage;
    } catch {
      return;
    }
    if (typeof message.seq !== 'number') return;

    if (!this.sawWelcome) {
      if (message.type !== 'welcome' || message.protocolVersion !== REALTIME_PROTOCOL_VERSION) {
        this.socket?.close(1002, 'unexpected handshake');
        return;
      }
      this.sawWelcome = true;
      this.lastSeq = message.seq;
      this.heartbeatMs = message.heartbeatIntervalMs || REALTIME_HEARTBEAT_INTERVAL_MS;
      this.armIdleWatchdog(); // ตั้งใหม่ด้วยรอบ heartbeat จริงจาก server
      this.startPinging();
      this.setConnected(true);
      return;
    }

    // out-of-order guard: ย้อนหลัง/ซ้ำ = ทิ้ง, กระโดดข้าม = พลาดข้อความ → resync
    if (message.seq <= this.lastSeq) return;
    if (message.seq > this.lastSeq + 1) {
      // พลาดข้อความบางตัว → resync economy หนึ่งครั้ง แต่ยัง apply เฟรมที่มากับ gap
      // (presence เป็น absolute ใช้ได้เลย; economy ใหม่กว่าเดิมแน่นอน)
      this.lastSeq = message.seq;
      this.handlers.onResync();
      this.dispatch(message);
      return;
    }
    this.lastSeq = message.seq;
    this.dispatch(message);
  }

  private dispatch(message: RealtimeServerMessage): void {
    if (message.type === 'economy') {
      this.handlers.onEconomy(message.state, message.tick);
    } else if (message.type === 'announcement') {
      this.handlers.onAnnouncement?.(message.message, message.level);
    } else if (message.type === 'presence') {
      this.handlers.onPresence?.({
        playerId: message.playerId,
        name: message.name,
        islandId: message.islandId,
        x: message.x,
        y: message.y,
        z: message.z,
        heading: message.heading,
        onBoat: message.onBoat,
        boatId: message.boatId,
      });
    } else if (message.type === 'presence-leave') {
      this.handlers.onPresenceLeave?.(message.playerId);
    }
    // pong: แค่รีเซ็ต idle watchdog (ทำไปแล้วต้นฟังก์ชัน)
  }

  /** S13: รายงานตำแหน่งตัวเองให้ Server relay ให้ผู้เล่นคนอื่น (presence เท่านั้น) */
  sendMove(position: {
    islandId: string;
    x: number;
    y: number;
    z: number;
    heading: number;
    onBoat: boolean;
    boatId?: string;
  }): void {
    if (this.socket?.readyState !== OPEN || !this.sawWelcome) return;
    this.socket.send(JSON.stringify({ type: 'move', ...position }));
  }

  private handleDisconnect(): void {
    this.clearTimers();
    this.socket = null;
    this.setConnected(false);
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return;
    const base = this.options.backoffBaseMs ?? 1_000;
    const max = this.options.backoffMaxMs ?? 30_000;
    const random = this.options.random ?? Math.random;
    const delay = Math.min(max, base * 2 ** this.attempts) * (0.7 + random() * 0.6);
    this.attempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private startPinging(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => {
      if (this.socket?.readyState === OPEN) {
        this.socket.send(JSON.stringify({ type: 'ping', sentAt: Date.now() }));
      }
    }, this.heartbeatMs);
  }

  private armIdleWatchdog(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      // เงียบเกิน 2.5 รอบ heartbeat = connection ตายเงียบ — ตัดเพื่อเข้า backoff
      this.socket?.close(4000, 'idle');
      this.handleDisconnect();
    }, this.heartbeatMs * 2.5);
  }

  private clearTimers(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.pingTimer = null;
    this.reconnectTimer = null;
    this.idleTimer = null;
  }

  private setConnected(connected: boolean): void {
    if (this.isConnected === connected) return;
    this.isConnected = connected;
    this.handlers.onStatusChange?.(connected);
  }
}

/** เปิดใช้เมื่อ VITE_ENABLE_REALTIME + session online เท่านั้น (null = โหมด poll เดิม) */
export function initializeRealtime(handlers: RealtimeHandlers): RealtimeClient | null {
  const flag = import.meta.env.VITE_ENABLE_REALTIME;
  if (flag !== 'true' && flag !== '1') return null;
  if (getRemoteSession().mode !== 'online') return null;
  const explicit = import.meta.env.VITE_WS_URL?.trim();
  let url = explicit || '';
  if (!url) {
    const api = import.meta.env.VITE_API_URL?.trim();
    if (!api) return null;
    try {
      const parsed = new URL(api);
      parsed.protocol = parsed.protocol === 'http:' ? 'ws:' : 'wss:';
      parsed.pathname = '/ws';
      url = parsed.toString();
    } catch {
      return null;
    }
  }
  return new RealtimeClient(url, handlers);
}
