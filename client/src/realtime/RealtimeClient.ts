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
  type WorldMonsterSnapshot,
  type WorldMonsterDelta,
  type WorldMonsterAttack,
  type WorldMonsterReward,
  type RealtimeKnockback,
  type BoatWorldSnapshot,
  type BoatIntentAction,
  type RealtimeCombatRejectReason,
  type CombatStatCategory,
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
  appearance?: import('@pirate-fruit/shared').RealtimeCharacterAppearance;
  presentation?: import('@pirate-fruit/shared').RealtimePlayerPresentation;
  visual?: import('@pirate-fruit/shared').RealtimePlayerVisual;
  locomotion?: 'idle' | 'walk' | 'run' | 'swim';
  animation?: import('@pirate-fruit/shared').RealtimePlayerAnimation;
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
  /** S15: PvP — Server แจ้งผลการโจมตี/แพ้/เกิดใหม่ (HP เป็น authority ของ Server) */
  onCombatHit?(hit: {
    attackerId: string;
    targetId: string;
    damage: number;
    hp: number;
    maxHp: number;
    knockback?: RealtimeKnockback;
  }): void;
  onCombatDefeat?(playerId: string, byId: string): void;
  onCombatRespawn?(playerId: string, hp: number, maxHp: number): void;
  onCombatState?(state: {
    playerId: string;
    hp: number;
    maxHp: number;
    defeated: boolean;
    engaged: boolean;
  }): void;
  onCombatResult?(result: {
    intentId: string;
    targetId: string;
    accepted: boolean;
    reason?: RealtimeCombatRejectReason;
  }): void;
  onMovementCorrection?(correction: {
    islandId: string;
    x: number;
    y: number;
    z: number;
    heading: number;
    reason: 'initial-anchor' | 'speed' | 'island';
  }): void;
  /** S16: มอนสเตอร์กลาง — snapshot/delta/dead/respawn (Server เป็นเจ้าของ) */
  onWorldMonsterSnapshot?(islandId: string, monsters: WorldMonsterSnapshot[]): void;
  onWorldMonsterDelta?(islandId: string, updates: WorldMonsterDelta[]): void;
  onWorldMonsterAttack?(attack: WorldMonsterAttack): void;
  onWorldMonsterDead?(spawnId: string, byId?: string, reward?: WorldMonsterReward): void;
  onWorldMonsterRespawn?(monster: WorldMonsterSnapshot): void;
  /** S17 authoritative boat world. */
  onBoatSnapshot?(islandId: string, boats: BoatWorldSnapshot[]): void;
  onBoatDelta?(boat: BoatWorldSnapshot): void;
  onBoatCannon?(event: { attackerId: string; targetId?: string; side: 'port' | 'starboard'; damage: number; targetHp?: number; x: number; z: number }): void;
  onBoatSunk?(entityId: string, byEntityId: string | undefined, respawnAt: number): void;
  onBoatRespawn?(boat: BoatWorldSnapshot): void;
  onBoatIntentResult?(result: { intentId: string; accepted: boolean; reason?: string; entityId?: string }): void;
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
  private attackIntentSequence = 0;
  private monsterIntentSequence = 0;

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
      this.requestResync();
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
        appearance: message.appearance,
        presentation: message.presentation,
        visual: message.visual,
        locomotion: message.locomotion,
        animation: message.animation,
      });
    } else if (message.type === 'presence-leave') {
      this.handlers.onPresenceLeave?.(message.playerId);
    } else if (message.type === 'combat-hit') {
      this.handlers.onCombatHit?.({
        attackerId: message.attackerId,
        targetId: message.targetId,
        damage: message.damage,
        hp: message.hp,
        maxHp: message.maxHp,
        knockback: message.knockback,
      });
    } else if (message.type === 'combat-defeat') {
      this.handlers.onCombatDefeat?.(message.playerId, message.byId);
    } else if (message.type === 'combat-respawn') {
      this.handlers.onCombatRespawn?.(message.playerId, message.hp, message.maxHp);
    } else if (message.type === 'combat-state') {
      this.handlers.onCombatState?.(message);
    } else if (message.type === 'combat-result') {
      this.handlers.onCombatResult?.(message);
    } else if (message.type === 'movement-correction') {
      this.handlers.onMovementCorrection?.(message);
    } else if (message.type === 'world-monster-snapshot') {
      this.handlers.onWorldMonsterSnapshot?.(message.islandId, message.monsters);
    } else if (message.type === 'world-monster-delta') {
      this.handlers.onWorldMonsterDelta?.(message.islandId, message.updates);
    } else if (message.type === 'world-monster-attack') {
      this.handlers.onWorldMonsterAttack?.(message.attack);
    } else if (message.type === 'world-monster-dead') {
      this.handlers.onWorldMonsterDead?.(message.spawnId, message.byId, message.reward);
    } else if (message.type === 'world-monster-respawn') {
      this.handlers.onWorldMonsterRespawn?.(message.monster);
    } else if (message.type === 'boat-snapshot') {
      this.handlers.onBoatSnapshot?.(message.islandId, message.boats);
    } else if (message.type === 'boat-delta') {
      this.handlers.onBoatDelta?.(message.boat);
    } else if (message.type === 'boat-cannon') {
      this.handlers.onBoatCannon?.(message);
    } else if (message.type === 'boat-sunk') {
      this.handlers.onBoatSunk?.(message.entityId, message.byEntityId, message.respawnAt);
    } else if (message.type === 'boat-respawn') {
      this.handlers.onBoatRespawn?.(message.boat);
    } else if (message.type === 'boat-intent-result') {
      this.handlers.onBoatIntentResult?.(message);
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
    locomotion?: 'idle' | 'walk' | 'run' | 'swim';
    animation?: import('@pirate-fruit/shared').RealtimePlayerAnimation;
    presentation?: import('@pirate-fruit/shared').RealtimePlayerPresentation;
    visual?: import('@pirate-fruit/shared').RealtimePlayerVisual;
  }): boolean {
    if (this.socket?.readyState !== OPEN || !this.sawWelcome) return false;
    this.socket.send(JSON.stringify({ type: 'move', ...position }));
    return true;
  }

  /** Ask the Server to reseed the current authoritative island/world state. */
  requestResync(): boolean {
    if (this.socket?.readyState !== OPEN || !this.sawWelcome) return false;
    this.socket.send(JSON.stringify({ type: 'resync' }));
    return true;
  }

  /** S15: รายงานเจตนาโจมตีผู้เล่นอีกคน — Server ตัดสินดาเมจ/HP เอง (ไม่ส่งดาเมจ) */
  sendAttack(
    targetId: string,
    kind: 'melee' | 'skill',
    skillId?: string,
    category?: CombatStatCategory,
  ): string | null {
    if (this.socket?.readyState !== OPEN || !this.sawWelcome) return null;
    const intentId = `atk-${++this.attackIntentSequence}`;
    this.socket.send(JSON.stringify({ type: 'attack', intentId, targetId, kind, skillId, category }));
    return intentId;
  }

  sendCombatBlock(active: boolean): void {
    if (this.socket?.readyState !== OPEN || !this.sawWelcome) return;
    this.socket.send(JSON.stringify({ type: 'combat-block', active }));
  }

  /** S16: รายงานเจตนาตีมอนสเตอร์กลาง — Server ตัดสินดาเมจ/ตาย/contribution เอง */
  sendMonsterHit(
    spawnId: string,
    kind: 'melee' | 'skill',
    category?: CombatStatCategory,
  ): void {
    this.sendMonsterHits([spawnId], kind, category);
  }

  /** One authoritative action may hit an AoE set; one intent id prevents replaying the set. */
  sendMonsterHits(
    spawnIds: readonly string[],
    kind: 'melee' | 'skill',
    category?: CombatStatCategory,
  ): string | null {
    if (this.socket?.readyState !== OPEN || !this.sawWelcome) return null;
    const targets = [...new Set(spawnIds)].slice(0, 16);
    if (targets.length === 0) return null;
    const intentId = `mob-${++this.monsterIntentSequence}`;
    this.socket.send(JSON.stringify({
      type: 'world-monster-hit',
      intentId,
      spawnIds: targets,
      kind,
      category,
    }));
    return intentId;
  }

  /** S17: only control intent; no position/HP/damage/reward fields exist in this payload. */
  sendBoatIntent(action: BoatIntentAction, payload: {
    entityId?: string; throttle?: number; steer?: number; anchor?: boolean; boost?: boolean;
    fireSide?: 'port' | 'starboard';
  } = {}, retryIntentId?: string): string | null {
    if (this.socket?.readyState !== OPEN || !this.sawWelcome) return null;
    const intentId = retryIntentId ?? globalThis.crypto?.randomUUID?.()
      ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    this.socket.send(JSON.stringify({ type: 'boat-intent', intentId, action, ...payload }));
    return intentId;
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
