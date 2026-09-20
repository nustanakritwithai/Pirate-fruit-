import { createInterface } from 'node:readline';
import { inferIslandId, type MonsterKillsRequest, type RealtimeServerMessage } from '@pirate-fruit/shared';
import { RealtimeHub, type RealtimeConnection, type RealtimeSocket } from '../realtime/realtimeHub.js';
import type { AuthoritativeCombatProfile, CombatProfileProvider } from '../realtime/combatProfile.js';
import { MonsterWorldService, type MonsterWorldStateSnapshot } from './monsterWorldService.js';
import type { PlayerView } from './monsterSimulation.js';
import { normalizeInitialPlayerState, deriveCanonicalCombatProfile, applyCanonicalStateOperation } from '../player/centralStateAdapter.js';
import { prepareCanonicalReward } from '../player/centralRewardAdapter.js';
import { serializePlayerState } from '../player/playerState.js';

export interface CentralPlayer { characterId: string; islandId?: string; x: number; y?: number; z: number; heading?: number; profile: AuthoritativeCombatProfile; }
export interface CentralIntent { characterId: string; intentId: string; spawnIds: string[]; kind?: 'melee' | 'skill'; category?: string; }
export interface CentralRequest {
  id: string | number; op: 'ready' | 'step' | 'owned-hit' | 'reward-ack' | 'normalize-state' | 'serialize-state' | 'state-profile' | 'reward-preview' | 'export-world' | 'restore-world' | 'state-operation'; now: number; players?: CentralPlayer[]; intents?: CentralIntent[];
  characterId?: string; operation?: unknown;
  ownerId?: string; actorId?: string; targetSpawnId?: string; x?: number; z?: number; expectedHp?: number; damage?: number; range?: number; additionalTargets?: PlayerView[];
  rewardKey?: string; outcome?: { rewards: unknown[]; coinsTotal: number };
  player?: unknown; cargo?: unknown; state?: any; kills?: unknown[];
  worldState?: MonsterWorldStateSnapshot;
}
const PROTOCOL = 'pirate-original-world/1' as const;

class CaptureSocket implements RealtimeSocket {
  readonly readyState = 1;
  readonly messages: RealtimeServerMessage[] = [];
  send(value: string): void { this.messages.push(JSON.parse(value) as RealtimeServerMessage); }
  close(): void { /* virtual socket */ }
}

/** Pure JSON-lines adapter; importing this module never starts a process. */
export class CentralWorldWorker {
  private readonly sockets = new Map<string, CaptureSocket>();
  private readonly connections = new Map<string, RealtimeConnection>();
  private readonly profiles: CombatProfileProvider;
  private readonly hub: RealtimeHub;
  private readonly service: MonsterWorldService;
  private currentPlayers = new Map<string, CentralPlayer>();
  private clockNow: number;
  private hasStepped = false;
  private readonly pendingRewards = new Map<string, { characterId: string; body: MonsterKillsRequest; resolve: (value: any) => void; reject: (error: Error) => void; }>();
  private readonly deliverySeq = new Map<string, number>();

  constructor(now: () => number = () => Date.now()) {
    this.clockNow = now();
    const clock = () => this.clockNow;
    this.profiles = { profile: async (id) => {
      const player = this.currentPlayers.get(id);
      if (!player) throw new Error('trusted combat profile missing');
      return player.profile;
    } };
    this.hub = new RealtimeHub(undefined, clock, 200, true, false, this.profiles);
    this.service = new MonsterWorldService(this.hub, { now: clock, rewards: {
      grantKills: (characterId, body: MonsterKillsRequest) => new Promise((resolve, reject) => {
        this.pendingRewards.set(body.idempotencyKey, { characterId, body, resolve, reject });
      }),
    } });
    this.hub.attachWorldMonsters(this.service);
  }

  private connectionFor(player: CentralPlayer): RealtimeConnection {
    let connection = this.connections.get(player.characterId);
    if (!connection) {
      const socket = new CaptureSocket();
      const registered = this.hub.register(socket, player.characterId, player.characterId, player.characterId);
      if (!registered) throw new Error('virtual socket registration failed');
      connection = registered;
      this.sockets.set(player.characterId, socket); this.connections.set(player.characterId, connection);
    }
    return connection;
  }

  async handle(request: CentralRequest): Promise<Record<string, unknown>> {
    if (request.op === 'ready') return { id: request.id, ok: true, contract: PROTOCOL };
    if (request.op === 'export-world') return { id: request.id, ok: true, contract: PROTOCOL, worldState: this.service.exportWorldState() };
    if (request.op === 'restore-world') {
      if (!request.worldState) return { id: request.id, ok: false, contract: PROTOCOL, error: 'world-state-required' };
      if (this.hasStepped) return { id: request.id, ok: false, contract: PROTOCOL, error: 'world-state-restore-too-late' };
      this.service.restoreWorldState(request.worldState);
      return { id: request.id, ok: true, contract: PROTOCOL };
    }
    if (request.op === 'normalize-state') {
      if (!request.player) return { id: request.id, ok: false, contract: PROTOCOL, error: 'player-state-required' };
      return { id: request.id, ok: true, contract: PROTOCOL, ...normalizeInitialPlayerState(request.player as any, request.cargo as any) };
    }
    if (request.op === 'serialize-state') {
      if (!request.state) return { id: request.id, ok: false, contract: PROTOCOL, error: 'state-required' };
      return { id: request.id, ok: true, contract: PROTOCOL, persisted: serializePlayerState(request.state) };
    }
    if (request.op === 'state-operation') {
      if (!request.state || !request.characterId) throw new Error('state-and-character-required');
      const player = this.currentPlayers.get(request.characterId);
      const position = player ? { islandId: player.islandId ?? this.islandForPosition(player.x, player.z) ?? '',
        x: player.x, y: player.y ?? 0, z: player.z, heading: player.heading ?? 0 } : null;
      return { id: request.id, ok: true, contract: PROTOCOL,
        ...applyCanonicalStateOperation(request.state, request.operation, position) };
    }
    if (request.op === 'state-profile') {
      if (!request.state) return { id: request.id, ok: false, contract: PROTOCOL, error: 'state-required' };
      return { id: request.id, ok: true, contract: PROTOCOL, profile: deriveCanonicalCombatProfile(request.state) };
    }
    if (request.op === 'reward-preview') {
      if (!request.state || !request.rewardKey || !request.kills) return { id: request.id, ok: false, contract: PROTOCOL, error: 'reward-input-required' };
      return { id: request.id, ok: true, contract: PROTOCOL, ...prepareCanonicalReward(request.state, request.rewardKey, request.kills as any) };
    }
    if (request.op === 'reward-ack') {
      if (!request.rewardKey || !request.outcome) return { id: request.id, ok: false, contract: PROTOCOL, error: 'invalid-reward-ack' };
      const pending = this.pendingRewards.get(request.rewardKey); if (!pending) return { id: request.id, ok: false, contract: PROTOCOL, error: 'unknown-reward' };
      this.pendingRewards.delete(request.rewardKey); pending.resolve(request.outcome);
      return { id: request.id, ok: true, contract: PROTOCOL };
    }
    if (!['step', 'owned-hit', 'reward-ack', 'normalize-state', 'serialize-state', 'state-profile', 'reward-preview'].includes(request.op)) return { id: request.id, ok: false, contract: PROTOCOL, error: 'unsupported-operation' };
    if (request.op === 'owned-hit') {
      if (!request.ownerId || !request.actorId || !request.targetSpawnId || !Number.isFinite(request.x) || !Number.isFinite(request.z) || !Number.isFinite(request.damage)) return { id: request.id, ok: false, contract: PROTOCOL, error: 'invalid-owned-hit' };
      const islandId = this.service.islandForSpawn(request.targetSpawnId);
      if (!islandId) return { id: request.id, ok: false, contract: PROTOCOL, error: 'unknown-spawn' };
      const result = this.service.applyExternalHit({ characterId: request.actorId, creditCharacterId: request.ownerId, islandId, x: request.x!, z: request.z!, spawnId: request.targetSpawnId, damage: request.damage!, range: request.range, expectedHp: request.expectedHp });
      return { id: request.id, ok: !!result, contract: PROTOCOL, result: result ? { hp: result.hp, damage: result.damage, dead: result.dead, spawnId: result.spawnId } : null };
    }
    this.clockNow = request.now;
    this.currentPlayers = new Map((request.players ?? []).map((player) => [player.characterId, player]));
    for (const [characterId, connection] of this.connections) {
      if (!this.currentPlayers.has(characterId)) {
        this.hub.unregister(connection); this.connections.delete(characterId); this.sockets.delete(characterId);
      }
    }
    for (const player of request.players ?? []) {
      const islandId = player.islandId ?? this.islandForPosition(player.x, player.z);
      if (!islandId) continue;
      const connection = this.connectionFor({ ...player, islandId });
      const previousIsland = connection.presence?.islandId;
      connection.presence = { islandId, x: player.x, y: player.y ?? 0, z: player.z, heading: player.heading ?? 0, onBoat: false };
      if (previousIsland !== islandId) this.sockets.get(player.characterId)!.messages.push(this.service.snapshotMessageForIsland(islandId));
    }
    const grouped = new Map<string, CentralIntent>();
    for (const intent of request.intents ?? []) {
      const key = `${intent.characterId}\u0000${intent.kind ?? 'skill'}\u0000${intent.category ?? ''}`;
      const existing = grouped.get(key);
      if (existing) existing.spawnIds = [...new Set([...existing.spawnIds, ...intent.spawnIds])].slice(0, 16);
      else grouped.set(key, { ...intent, spawnIds: [...new Set(intent.spawnIds)].slice(0, 16) });
    }
    for (const intent of grouped.values()) {
      const connection = this.connections.get(intent.characterId); if (!connection || intent.spawnIds.length === 0) continue;
      this.hub.handleClientMessage(connection, JSON.stringify({ type: 'world-monster-hit', intentId: intent.intentId, spawnIds: intent.spawnIds, kind: intent.kind ?? 'skill', category: intent.category }));
    }
    await Promise.resolve();
    const additionalTargets = (request.additionalTargets ?? []).map(target => ({
      ...target, islandId: target.islandId || this.islandForPosition(target.x, target.z) || '',
    })).filter(target => target.islandId && Number.isFinite(target.x) && Number.isFinite(target.z));
    this.service.step(request.now, additionalTargets);
    this.hasStepped = true;
    const islands = [...new Set((request.players ?? []).map((player) => player.islandId ?? this.islandForPosition(player.x, player.z)).filter((value): value is string => !!value))];
    const snapshots = islands.map((islandId) => {
      const message = this.service.snapshotMessageForIsland(islandId);
      return { islandId, monsters: 'monsters' in message ? message.monsters : [] };
    });
    const deliveries: { characterId: string; message: RealtimeServerMessage }[] = [];
    const worldTypes = new Set(['world-monster-snapshot', 'world-monster-delta', 'world-monster-respawn', 'world-monster-attack', 'world-monster-dead']);
    for (const [characterId, socket] of this.sockets) for (const message of socket.messages.splice(0)) if (worldTypes.has(message.type)) {
      const seq = (this.deliverySeq.get(characterId) ?? 0) + 1; this.deliverySeq.set(characterId, seq);
      deliveries.push({ characterId, message: { ...message, seq } });
    }
    return { id: request.id, ok: true, contract: PROTOCOL, snapshots, deliveries, pendingRewards: [...this.pendingRewards.entries()].map(([key, pending]) => ({ key, characterId: pending.characterId, body: pending.body })) };
  }

  private islandForPosition(x: number, z: number): string | null {
    return inferIslandId(x, z);
  }
}

export async function runCentralWorker(input = process.stdin, output = process.stdout): Promise<void> {
  const worker = new CentralWorldWorker(); const lines = createInterface({ input });
  for await (const line of lines) {
    let parsed: CentralRequest | null = null;
    try { parsed = JSON.parse(line) as CentralRequest; output.write(`${JSON.stringify(await worker.handle(parsed))}\n`); }
    catch (error) { output.write(`${JSON.stringify({ id: parsed?.id ?? 'unknown', ok: false, contract: PROTOCOL, error: error instanceof Error ? error.message : 'worker-error' })}\n`); }
  }
}

if (process.argv[1]?.endsWith('centralWorker.js') || process.argv[1]?.endsWith('centralWorker.mjs')) void runCentralWorker();
