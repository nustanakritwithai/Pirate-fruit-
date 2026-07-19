import {
  REALTIME_HEARTBEAT_INTERVAL_MS,
  REALTIME_IDLE_TIMEOUT_MS,
  REALTIME_MAX_CLIENT_MESSAGE_BYTES,
  REALTIME_MOVE_MIN_INTERVAL_MS,
  REALTIME_PROTOCOL_VERSION,
  type RealtimeAnnouncement,
  type RealtimeEconomyUpdate,
  type RealtimeServerMessage,
  type RealtimeBoatIntent,
  type BoatWorldSnapshot,
  type RealtimeCombatRejectReason,
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

export interface BoatIntentResolution {
  accepted: boolean;
  reason?: string;
  entityId?: string;
}

/** S17 bridge: hub authenticates the character; world service owns every boat mutation. */
export interface BoatWorldBridge {
  snapshotMessageForIsland(islandId: string): RealtimeServerMessage;
  handleIntent(
    characterId: string,
    presence: PresencePosition | null,
    intent: RealtimeBoatIntent,
  ): Promise<BoatIntentResolution>;
  isPassenger(characterId: string): boolean;
  passengerBoat(characterId: string): BoatWorldSnapshot | null;
  removePlayer(characterId: string): void;
}

/** ส่วนของ WebSocket ที่ hub ใช้ — แคบพอให้เทสต์ด้วย fake ได้ */
export interface RealtimeSocket {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

const OPEN = 1;
/** Presentation interest only; PK/boat/world authority keeps its own server-side ranges. */
const PRESENCE_INTEREST_RANGE = 240;

export interface PresencePosition {
  islandId: string;
  x: number;
  y: number;
  z: number;
  heading: number;
  onBoat: boolean;
  /** S14: รุ่นเรือที่ขับอยู่ (undefined = เดินเท้า) */
  boatId?: string;
  locomotion?: 'idle' | 'walk' | 'run' | 'swim';
  animation?: import('@pirate-fruit/shared').RealtimePlayerAnimation;
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
  /** Peers already seeded to this connection while inside presentation interest. */
  visiblePeerIds: Set<string>;
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
  const locomotion = message.locomotion === 'walk' || message.locomotion === 'run'
    || message.locomotion === 'swim' ? message.locomotion : 'idle';
  const animation = readPlayerAnimation(message.animation);
  return { islandId, x, y, z, heading, onBoat, boatId, locomotion, animation };
}

function readPlayerAnimation(value: unknown): import('@pirate-fruit/shared').RealtimePlayerAnimation | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const input = value as Record<string, unknown>;
  const combatStates = new Set(['idle', 'attack1', 'attack2', 'attack3', 'attack4', 'casting',
    'blocking', 'stunned', 'knockback', 'knockdown', 'dead']);
  const categories = new Set(['style', 'sword', 'gun', 'fruit', 'utility']);
  const skillTypes = new Set(['projectile', 'beam', 'aoe', 'ground', 'dash', 'flurry', 'buff',
    'summon', 'homing', 'teleport']);
  if (typeof input.combatState !== 'string' || !combatStates.has(input.combatState)
    || typeof input.category !== 'string' || !categories.has(input.category)) return undefined;
  const finite = (field: string, fallback = 0) => {
    const number = input[field];
    return typeof number === 'number' && Number.isFinite(number) ? number : fallback;
  };
  const progress = (field: string) => THREEClamp(finite(field, 1), 0, 1);
  const skillAnimationType = typeof input.skillAnimationType === 'string'
    && skillTypes.has(input.skillAnimationType) ? input.skillAnimationType : undefined;
  const skillAnimationCategory = typeof input.skillAnimationCategory === 'string'
    && categories.has(input.skillAnimationCategory) ? input.skillAnimationCategory : undefined;
  return {
    combatState: input.combatState as import('@pirate-fruit/shared').RealtimePlayerAnimation['combatState'],
    category: input.category as import('@pirate-fruit/shared').RealtimePlayerAnimation['category'],
    onGround: input.onGround === true,
    dashing: input.dashing === true,
    verticalVelocity: Math.max(-100, Math.min(100, finite('verticalVelocity'))),
    attackProgress: progress('attackProgress'),
    hitReactionId: Math.max(0, Math.floor(finite('hitReactionId'))),
    hitReactionAngle: Math.max(-Math.PI, Math.min(Math.PI, finite('hitReactionAngle'))),
    skillAnimationProgress: progress('skillAnimationProgress'),
    skillAnimationReleaseProgress: progress('skillAnimationReleaseProgress'),
    skillAnimationType: skillAnimationType as import('@pirate-fruit/shared').RealtimePlayerAnimation['skillAnimationType'],
    skillAnimationVariant: Math.max(0, Math.min(16, Math.floor(finite('skillAnimationVariant')))),
    skillAnimationUltimate: input.skillAnimationUltimate === true,
    skillAnimationCategory: skillAnimationCategory as import('@pirate-fruit/shared').RealtimePlayerAnimation['skillAnimationCategory'],
  };
}

function THREEClamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
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
    locomotion: presence.onBoat ? 'idle' : presence.locomotion ?? 'idle',
    animation: presence.onBoat ? undefined : presence.animation,
    // Presentation-only default. A future profile/loadout service can replace
    // these fields without changing movement or combat authority.
    appearance: {
      schemaVersion: 1,
      avatarId: 'pirate-v1',
      clothingIds: [],
      equipmentIds: [],
    },
  };
}

function presenceWithinInterest(a: PresencePosition, b: PresencePosition): boolean {
  if (a.islandId !== b.islandId) return false;
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz <= PRESENCE_INTEREST_RANGE * PRESENCE_INTEREST_RANGE;
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
  /** S17: authoritative boat world; null preserves S14 boat presence fallback. */
  private boatWorld: BoatWorldBridge | null = null;

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
      visiblePeerIds: new Set(),
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
    if (!this.hasCharacter(connection.characterId)) this.boatWorld?.removePlayer(connection.characterId);
    for (const other of this.connections) other.visiblePeerIds.delete(connection.characterId);
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
    if (message.type === 'boat-intent') {
      this.handleBoatIntent(connection, message);
      return;
    }
    this.drop(connection, 1008, 'unsupported message type');
  }

  /** S13: รับตำแหน่งจากผู้เล่น → relay presence ให้คนอื่นบนเกาะเดียวกัน */
  private handleMove(connection: RealtimeConnection, message: Record<string, unknown>): void {
    if (!this.presenceEnabled) return; // ปิด flag = เพิกเฉย (ไม่ถือเป็น violation)
    // While aboard, seed/reconnect from the server boat transform and ignore client coordinates.
    const aboard = this.boatWorld?.passengerBoat(connection.characterId);
    if (aboard) {
      const firstMove = connection.presence === null;
      connection.presence = {
        islandId: aboard.islandId, x: aboard.x, y: 0, z: aboard.z,
        heading: aboard.heading, onBoat: true, boatId: aboard.definitionId,
      };
      if (firstMove) {
        this.sendTo(connection, this.boatWorld!.snapshotMessageForIsland(aboard.islandId));
        this.relayPresence(connection);
      }
      return;
    }
    const position = readPosition(message);
    if (!position) {
      this.drop(connection, 1008, 'invalid move payload');
      return;
    }
    if (this.boatWorld) {
      // S17: a client cannot claim it is aboard or choose a boat id via legacy presence.
      position.onBoat = false;
      position.boatId = undefined;
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
      // S16: และ seed มอนสเตอร์กลางของเกาะนี้ (full snapshot) ให้ผู้เล่นที่เพิ่งเข้ามา
      if (this.worldMonsters) {
        this.sendTo(connection, this.worldMonsters.snapshotMessageForIsland(position.islandId));
      }
      if (this.boatWorld) {
        this.sendTo(connection, this.boatWorld.snapshotMessageForIsland(position.islandId));
      }
    }
    this.relayPresence(connection);
  }

  /**
   * Broadcast the mover and seed the reverse direction once when a pair enters
   * interest. Without the reverse seed, a stationary player can see the mover
   * while the mover never sees the stationary player until another island sync.
   */
  private relayPresence(connection: RealtimeConnection): void {
    if (!connection.presence) return;
    for (const other of this.connections) {
      if (other === connection || !other.presence) continue;
      if (!presenceWithinInterest(connection.presence, other.presence)) {
        if (connection.visiblePeerIds.delete(other.characterId)) {
          this.sendTo(connection, { type: 'presence-leave', seq: 0, playerId: other.characterId });
        }
        if (other.visiblePeerIds.delete(connection.characterId)) {
          this.sendTo(other, { type: 'presence-leave', seq: 0, playerId: connection.characterId });
        }
        continue;
      }
      if (!connection.visiblePeerIds.has(other.characterId)) {
        this.sendTo(connection, presenceMessage(other));
        connection.visiblePeerIds.add(other.characterId);
      }
      this.sendTo(other, presenceMessage(connection));
      other.visiblePeerIds.add(connection.characterId);
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
    const targetId = message.targetId;
    if (typeof targetId !== 'string' || targetId.length === 0 || targetId.length > 128) {
      this.drop(connection, 1008, 'invalid attack payload');
      return;
    }
    // Missing intentId remains compatible with clients deployed before this acknowledgement.
    const intentId = typeof message.intentId === 'string' && message.intentId.length <= 128
      ? message.intentId
      : 'legacy';
    const reject = (reason: RealtimeCombatRejectReason) => {
      this.sendTo(connection, {
        type: 'combat-result', seq: 0, intentId, targetId, accepted: false, reason,
      });
    };
    if (!this.pvpEnabled) {
      reject('pvp-disabled');
      return;
    }
    const kind: AttackKind = message.kind === 'skill' ? 'skill' : 'melee';
    const attackerPos = connection.presence;
    const targetPos = this.presenceOfCharacter(targetId);
    // ต้องอยู่เกาะเดียวกัน (range check เป็นเรขาคณิตล้วน — กันพิกัดชนกันข้ามเกาะ)
    if (!attackerPos) return reject('presence-required');
    if (!targetPos) return reject('target-unavailable');
    if (attackerPos.islandId !== targetPos.islandId) return reject('different-island');
    const decision = this.combat.resolveAttackDetailed(
      this.now(),
      connection.characterId,
      attackerPos,
      targetId,
      targetPos,
      kind,
    );
    if (!decision.accepted) return reject(decision.reason);
    const resolution = decision.resolution;
    this.sendTo(connection, {
      type: 'combat-result', seq: 0, intentId, targetId, accepted: true,
    });
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

  attachBoatWorld(bridge: BoatWorldBridge): void {
    this.boatWorld = bridge;
  }

  /** Server simulation updates passenger presence; client coordinates are ignored aboard. */
  updateBoatPassengerPresence(
    characterId: string,
    islandId: string,
    x: number,
    z: number,
    heading: number,
    definitionId: string,
  ): void {
    for (const connection of this.connections) {
      if (connection.characterId !== characterId) continue;
      connection.presence = { islandId, x, y: 0, z, heading, onBoat: true, boatId: definitionId };
      for (const other of this.connections) {
        if (other === connection || !other.presence || !presenceWithinInterest(connection.presence, other.presence)) continue;
        this.sendTo(other, presenceMessage(connection));
      }
    }
  }

  broadcastBoat(islandId: string, message: RealtimeServerMessage): void {
    this.broadcastToIsland(islandId, message);
  }

  private handleBoatIntent(connection: RealtimeConnection, message: Record<string, unknown>): void {
    if (!this.boatWorld) return;
    const intentId = message.intentId;
    const action = message.action;
    const actions = new Set(['summon', 'board', 'disembark', 'input', 'fire']);
    if (typeof intentId !== 'string' || intentId.length < 8 || intentId.length > 64
      || typeof action !== 'string' || !actions.has(action)) {
      this.drop(connection, 1008, 'invalid boat intent');
      return;
    }
    const entityId = typeof message.entityId === 'string' && message.entityId.length <= 128
      ? message.entityId : undefined;
    const fireSide = message.fireSide === 'port' || message.fireSide === 'starboard'
      ? message.fireSide : undefined;
    const numberOrUndefined = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : undefined;
    const intent: RealtimeBoatIntent = {
      type: 'boat-intent', intentId, action: action as RealtimeBoatIntent['action'], entityId,
      throttle: numberOrUndefined(message.throttle),
      steer: numberOrUndefined(message.steer),
      anchor: typeof message.anchor === 'boolean' ? message.anchor : undefined,
      fireSide,
    };
    void this.boatWorld.handleIntent(connection.characterId, connection.presence, intent)
      .then((result) => this.sendTo(connection, {
        type: 'boat-intent-result', seq: 0, intentId, ...result,
      }))
      .catch((error) => this.logger.warn({ err: error, characterId: connection.characterId }, 'boat intent failed'));
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
    this.unregister(connection);
    try {
      connection.socket.close(code, reason);
    } catch {
      // socket อาจปิดไปแล้ว
    }
  }

  private sendTo(connection: RealtimeConnection, message: RealtimeServerMessage): void {
    if (connection.socket.readyState !== OPEN) {
      this.unregister(connection);
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
