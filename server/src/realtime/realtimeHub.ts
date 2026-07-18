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
import { CombatAuthority, type AttackKind } from './combatAuthority.js';
import type { PlayerView } from '../world/monsterSimulation.js';

/**
 * S16 — สะพานไปยัง MonsterWorld: hub เรียกเพื่อส่ง snapshot ตอน join + ส่งต่อ hit
 * (world sim เรียกกลับ hub เพื่อ broadcast delta/death/respawn)
 */
export interface WorldMonsterBridge {
  snapshotMessageForIsland(islandId: string): RealtimeServerMessage;
  handleHit(
    characterId: string,
    islandId: string,
    x: number,
    z: number,
    spawnId: string,
    kind: AttackKind,
  ): void;
}

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
  /** S14: รุ่นเรือที่ขับอยู่ (undefined = เดินเท้า) */
  boatId?: string;
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
  const onBoat = message.onBoat === true;
  const boatId = onBoat && typeof message.boatId === 'string' && message.boatId.length <= 128
    ? message.boatId
    : undefined;
  return { islandId, x, y, z, heading, onBoat, boatId };
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
    boatId: presence.boatId,
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
  private combatTicker: ReturnType<typeof setInterval> | null = null;
  /** S15: แหล่งความจริงของ HP PvP — Client ส่งได้แค่เจตนาโจมตี */
  private readonly combat = new CombatAuthority();
  /** S16: สะพานไป MonsterWorld (null = ปิด shared world monsters) */
  private worldMonsters: WorldMonsterBridge | null = null;

  constructor(
    private readonly logger: RealtimeHubLogger = silentLogger,
    private readonly now: () => number = () => Date.now(),
    private readonly maxConnections = 200,
    /** S13: เปิด presence relay (ผู้เล่นเห็นกันเคลื่อนที่) — ปิด = ไม่รับ move */
    private readonly presenceEnabled = false,
    /** S15: เปิด PvP combat authority — ปิด = ไม่รับ attack */
    private readonly pvpEnabled = false,
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
    if (this.pvpEnabled) this.combat.ensure(characterId);
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
    // S15: ไม่มี connection ของ character นี้เหลือแล้ว → ล้างสถานะ PvP
    if (this.pvpEnabled && !this.hasCharacter(connection.characterId)) {
      this.combat.remove(connection.characterId);
    }
  }

  private hasCharacter(characterId: string): boolean {
    for (const other of this.connections) {
      if (other.characterId === characterId) return true;
    }
    return false;
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
    if (message.type === 'attack') {
      this.handleAttack(connection, message);
      return;
    }
    if (message.type === 'world-monster-hit') {
      this.handleWorldMonsterHit(connection, message);
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
      // S16: และ seed มอนสเตอร์กลางของเกาะนี้ (full snapshot) ให้ผู้เล่นที่เพิ่งเข้ามา
      if (this.worldMonsters) {
        this.sendTo(connection, this.worldMonsters.snapshotMessageForIsland(position.islandId));
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

  /** S15: รับเจตนาโจมตี → Server ตัดสินระยะ/คูลดาวน์/ดาเมจเอง แล้ว broadcast ผล */
  private handleAttack(connection: RealtimeConnection, message: Record<string, unknown>): void {
    if (!this.pvpEnabled) return; // ปิด flag = เพิกเฉย (ไม่ถือเป็น violation)
    const targetId = message.targetId;
    if (typeof targetId !== 'string' || targetId.length === 0 || targetId.length > 128) {
      this.drop(connection, 1008, 'invalid attack payload');
      return;
    }
    const kind: AttackKind = message.kind === 'skill' ? 'skill' : 'melee';
    const attackerPos = connection.presence;
    const targetPos = this.presenceOfCharacter(targetId);
    // ต้องอยู่เกาะเดียวกัน (range check เป็นเรขาคณิตล้วน — กันพิกัดชนกันข้ามเกาะ)
    if (!attackerPos || !targetPos || attackerPos.islandId !== targetPos.islandId) return;
    const resolution = this.combat.resolveAttack(
      this.now(),
      connection.characterId,
      attackerPos,
      targetId,
      targetPos,
      kind,
    );
    if (!resolution) return;
    const islandId = targetPos.islandId;
    this.broadcastToIsland(islandId, {
      type: 'combat-hit',
      seq: 0,
      attackerId: connection.characterId,
      targetId,
      damage: resolution.damage,
      hp: resolution.hp,
      maxHp: resolution.maxHp,
    });
    if (resolution.defeated) {
      this.broadcastToIsland(islandId, {
        type: 'combat-defeat',
        seq: 0,
        playerId: targetId,
        byId: connection.characterId,
      });
    }
  }

  /** presence ล่าสุดของ character (connection แรกที่มี presence) — null ถ้าไม่มี */
  private presenceOfCharacter(characterId: string): PresencePosition | null {
    for (const other of this.connections) {
      if (other.characterId === characterId && other.presence) return other.presence;
    }
    return null;
  }

  private broadcastToIsland(islandId: string, message: RealtimeServerMessage): void {
    for (const other of this.connections) {
      if (other.presence?.islandId !== islandId) continue;
      this.sendTo(other, message);
    }
  }

  /** S15: รอบเกิดใหม่ PvP — ผู้เล่นที่ครบเวลาแล้วรีเซ็ต HP เต็ม + broadcast */
  processCombatRespawns(): void {
    if (!this.pvpEnabled) return;
    for (const event of this.combat.collectRespawns(this.now())) {
      const islandId = this.presenceOfCharacter(event.playerId)?.islandId;
      for (const other of this.connections) {
        const sameIsland = islandId !== undefined && other.presence?.islandId === islandId;
        if (other.characterId !== event.playerId && !sameIsland) continue;
        this.sendTo(other, {
          type: 'combat-respawn',
          seq: 0,
          playerId: event.playerId,
          hp: event.hp,
          maxHp: event.maxHp,
        });
      }
    }
  }

  /** เริ่มรอบตรวจเกิดใหม่ PvP (ละเอียดกว่ารอบ reaper) */
  startCombatTicker(intervalMs = 1_000): () => void {
    this.combatTicker = setInterval(() => this.processCombatRespawns(), intervalMs);
    return () => {
      if (this.combatTicker) clearInterval(this.combatTicker);
      this.combatTicker = null;
    };
  }

  /** S16: ต่อ MonsterWorld เข้า hub — เปิด shared world monsters */
  attachWorldMonsters(bridge: WorldMonsterBridge): void {
    this.worldMonsters = bridge;
  }

  /** S16: มุมมองผู้เล่นที่มีตำแหน่ง (ให้ world sim ใช้ขับ AI) */
  worldPlayerViews(): PlayerView[] {
    const views: PlayerView[] = [];
    for (const connection of this.connections) {
      if (!connection.presence) continue;
      views.push({
        characterId: connection.characterId,
        islandId: connection.presence.islandId,
        x: connection.presence.x,
        z: connection.presence.z,
      });
    }
    return views;
  }

  /** S16: broadcast ข้อความมอนสเตอร์ให้ผู้เล่นบนเกาะเดียวกัน (interest = ระดับเกาะ) */
  broadcastWorldMonster(islandId: string, message: RealtimeServerMessage): void {
    this.broadcastToIsland(islandId, message);
  }

  private handleWorldMonsterHit(connection: RealtimeConnection, message: Record<string, unknown>): void {
    if (!this.worldMonsters) return; // ปิด flag = เพิกเฉย
    const spawnId = message.spawnId;
    if (typeof spawnId !== 'string' || spawnId.length === 0 || spawnId.length > 96) {
      this.drop(connection, 1008, 'invalid world-monster-hit payload');
      return;
    }
    const kind: AttackKind = message.kind === 'skill' ? 'skill' : 'melee';
    const presence = connection.presence;
    if (!presence) return; // ต้องมีตำแหน่ง (Server วัดระยะเอง — ไม่เชื่อพิกัด client)
    this.worldMonsters.handleHit(
      connection.characterId,
      presence.islandId,
      presence.x,
      presence.z,
      spawnId,
      kind,
    );
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
