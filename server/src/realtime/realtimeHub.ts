import {
  REALTIME_HEARTBEAT_INTERVAL_MS,
  REALTIME_IDLE_TIMEOUT_MS,
  REALTIME_MAX_CLIENT_MESSAGE_BYTES,
  REALTIME_MOVE_MIN_INTERVAL_MS,
  REALTIME_PROTOCOL_VERSION,
  type RealtimeAnnouncement,
  type RealtimeEconomyUpdate,
  type RealtimeServerMessage,
} from '@pirate-fruit/shared';

/** ส่วนของ WebSocket ที่ hub ใช้ — แคบพอให้เทสต์ด้วย fake ได้ */
export interface RealtimeSocket {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

const OPEN = 1;

export interface PresencePosition {
  islandId: string;
  x: number;
  y: number;
  z: number;
  heading: number;
  onBoat: boolean;
}

export interface RealtimeConnection {
  socket: RealtimeSocket;
  userId: string;
  characterId: string;
  characterName: string;
  seq: number;
  lastSeenAt: number;
  /** S13: ตำแหน่งล่าสุดที่ผู้เล่นรายงาน (null = ยังไม่เคยส่ง move) */
  presence: PresencePosition | null;
  lastMoveAt: number;
}

export interface RealtimeHubLogger {
  info(fields: object, message: string): void;
  warn(fields: object, message: string): void;
}

const silentLogger: RealtimeHubLogger = {
  info: () => undefined,
  warn: () => undefined,
};

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** อ่าน+ตรวจ payload ของ move (พิกัดต้องเป็นตัวเลขจำกัด, islandId สั้น ๆ) */
function readPosition(message: Record<string, unknown>): PresencePosition | null {
  const x = finiteNumber(message.x);
  const y = finiteNumber(message.y);
  const z = finiteNumber(message.z);
  const heading = finiteNumber(message.heading);
  const islandId = message.islandId;
  if (x === null || y === null || z === null || heading === null) return null;
  if (typeof islandId !== 'string' || islandId.length === 0 || islandId.length > 96) return null;
  return { islandId, x, y, z, heading, onBoat: message.onBoat === true };
}

function presenceMessage(connection: RealtimeConnection): RealtimeServerMessage {
  const presence = connection.presence!;
  return {
    type: 'presence',
    seq: 0,
    playerId: connection.characterId,
    name: connection.characterName,
    islandId: presence.islandId,
    x: presence.x,
    y: presence.y,
    z: presence.z,
    heading: presence.heading,
    onBoat: presence.onBoat,
  };
}

/**
 * S9 — ทะเบียน connection + broadcast แบบมี sequence ต่อ connection
 * seq เพิ่มทีละ 1 เสมอ (welcome = 1) — client ที่เห็นช่องว่างต้อง resync ทาง REST
 * ช่องทางนี้เป็น push อย่างเดียว: client ส่งได้แค่ ping ขนาดเล็ก เกินสเปก = ตัดทิ้ง
 */
export class RealtimeHub {
  private readonly connections = new Set<RealtimeConnection>();
  private reaper: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly logger: RealtimeHubLogger = silentLogger,
    private readonly now: () => number = () => Date.now(),
    private readonly maxConnections = 200,
    /** S13: เปิด presence relay (ผู้เล่นเห็นกันเคลื่อนที่) — ปิด = ไม่รับ move */
    private readonly presenceEnabled = false,
  ) {}

  get connectionCount(): number {
    return this.connections.size;
  }

  /** รับ connection ที่ผ่าน session auth แล้ว — ส่ง welcome ทันที */
  register(
    socket: RealtimeSocket,
    userId: string,
    characterId: string,
    characterName = 'Pirate',
  ): RealtimeConnection | null {
    if (this.connections.size >= this.maxConnections) {
      socket.close(1013, 'realtime capacity reached');
      return null;
    }
    const connection: RealtimeConnection = {
      socket,
      userId,
      characterId,
      characterName,
      seq: 0,
      lastSeenAt: this.now(),
      presence: null,
      lastMoveAt: 0,
    };
    this.connections.add(connection);
    this.sendTo(connection, {
      type: 'welcome',
      seq: 0, // ถูกแทนที่ใน sendTo
      protocolVersion: REALTIME_PROTOCOL_VERSION,
      serverTime: new Date(this.now()).toISOString(),
      heartbeatIntervalMs: REALTIME_HEARTBEAT_INTERVAL_MS,
    });
    return connection;
  }

  unregister(connection: RealtimeConnection): void {
    const wasPresent = this.connections.delete(connection);
    // S13: แจ้งผู้เล่นคนอื่นบนเกาะเดียวกันว่าคนนี้ออกไปแล้ว
    if (wasPresent && connection.presence) {
      this.broadcastPresenceLeave(connection);
    }
  }

  /** client ส่งอะไรมาก็ตาม: รับเฉพาะ ping เล็ก ๆ — เกินสเปกคือ protocol violation */
  handleClientMessage(connection: RealtimeConnection, raw: string | Buffer): void {
    const text = typeof raw === 'string' ? raw : raw.toString('utf8');
    if (text.length > REALTIME_MAX_CLIENT_MESSAGE_BYTES) {
      this.drop(connection, 1008, 'message too large');
      return;
    }
    connection.lastSeenAt = this.now();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      this.drop(connection, 1008, 'invalid message');
      return;
    }
    const message = parsed as Record<string, unknown>;
    if (message.type === 'ping' && typeof message.sentAt === 'number') {
      this.sendTo(connection, { type: 'pong', seq: 0, echo: message.sentAt });
      return;
    }
    if (message.type === 'move') {
      this.handleMove(connection, message);
      return;
    }
    this.drop(connection, 1008, 'unsupported message type');
  }

  /** S13: รับตำแหน่งจากผู้เล่น → relay presence ให้คนอื่นบนเกาะเดียวกัน */
  private handleMove(connection: RealtimeConnection, message: Record<string, unknown>): void {
    if (!this.presenceEnabled) return; // ปิด flag = เพิกเฉย (ไม่ถือเป็น violation)
    const position = readPosition(message);
    if (!position) {
      this.drop(connection, 1008, 'invalid move payload');
      return;
    }
    // throttle: ส่งถี่เกินก็อัปเดตตำแหน่งแต่ไม่ relay (กัน broadcast ท่วม)
    const now = this.now();
    const firstMove = connection.presence === null;
    const islandChanged = connection.presence?.islandId !== position.islandId;
    connection.presence = position;
    if (!firstMove && !islandChanged && now - connection.lastMoveAt < REALTIME_MOVE_MIN_INTERVAL_MS) {
      return;
    }
    connection.lastMoveAt = now;

    // ผู้เล่นคนนี้เพิ่งปรากฏ/เพิ่งย้ายเกาะ → ส่ง presence ของคนอื่นบนเกาะให้เห็นทันที
    if (firstMove || islandChanged) {
      for (const other of this.connections) {
        if (other === connection || !other.presence) continue;
        if (other.presence.islandId !== position.islandId) continue;
        this.sendTo(connection, presenceMessage(other));
      }
    }
    // และ broadcast ตำแหน่งของคนนี้ให้คนอื่นบนเกาะเดียวกัน
    for (const other of this.connections) {
      if (other === connection || !other.presence) continue;
      if (other.presence.islandId !== position.islandId) continue;
      this.sendTo(other, presenceMessage(connection));
    }
  }

  private broadcastPresenceLeave(connection: RealtimeConnection): void {
    const islandId = connection.presence?.islandId;
    for (const other of this.connections) {
      if (!other.presence || other.presence.islandId !== islandId) continue;
      this.sendTo(other, { type: 'presence-leave', seq: 0, playerId: connection.characterId });
    }
  }

  /** economy tick/trade เขียนสำเร็จ → push ให้ทุก connection */
  broadcastEconomy(tick: number, world: string, schemaVersion = 1): void {
    const payload: Omit<RealtimeEconomyUpdate, 'seq'> = {
      type: 'economy',
      tick,
      state: { schemaVersion, world },
    };
    for (const connection of [...this.connections]) {
      this.sendTo(connection, { ...payload, seq: 0 });
    }
  }

  broadcastAnnouncement(message: string, level: RealtimeAnnouncement['level'] = 'info'): void {
    for (const connection of [...this.connections]) {
      this.sendTo(connection, { type: 'announcement', seq: 0, message, level });
    }
  }

  /** เริ่มรอบเก็บ connection ที่เงียบเกิน idle timeout */
  startReaper(intervalMs = REALTIME_HEARTBEAT_INTERVAL_MS): () => void {
    this.reaper = setInterval(() => this.reapIdle(), intervalMs);
    return () => {
      if (this.reaper) clearInterval(this.reaper);
      this.reaper = null;
    };
  }

  reapIdle(): void {
    const cutoff = this.now() - REALTIME_IDLE_TIMEOUT_MS;
    for (const connection of [...this.connections]) {
      if (connection.lastSeenAt < cutoff) {
        this.drop(connection, 1001, 'idle timeout');
      }
    }
  }

  closeAll(): void {
    for (const connection of [...this.connections]) {
      this.drop(connection, 1001, 'server shutting down');
    }
  }

  private drop(connection: RealtimeConnection, code: number, reason: string): void {
    this.connections.delete(connection);
    try {
      connection.socket.close(code, reason);
    } catch {
      // socket อาจปิดไปแล้ว
    }
  }

  private sendTo(connection: RealtimeConnection, message: RealtimeServerMessage): void {
    if (connection.socket.readyState !== OPEN) {
      this.connections.delete(connection);
      return;
    }
    connection.seq += 1;
    try {
      connection.socket.send(JSON.stringify({ ...message, seq: connection.seq }));
    } catch (error) {
      this.logger.warn({ err: error }, 'realtime send failed; dropping connection');
      this.drop(connection, 1011, 'send failed');
    }
  }
}
