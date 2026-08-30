import type { RealtimePresenceSnapshot } from './RealtimeClient';
import type { RemotePlayers } from './RemotePlayers';

export const POCKET_MONSTER_PIRATE_ZONE = 'pirate-fruit';
export const PIRATE_LOCAL_PRESENCE_MESSAGE = 'pocketmonster:pirate-presence-v1';
export const PIRATE_PRESENCE_SNAPSHOT_MESSAGE = 'pocketmonster:pirate-presence-snapshot-v1';

const MAX_REMOTE_PLAYERS = 100;
const MAX_PLAYER_ID_LENGTH = 80;
const MAX_PLAYER_NAME_LENGTH = 32;
const DEFAULT_PUBLISH_INTERVAL_MS = 100;

export interface PiratePresencePlayer {
  id: string;
  name: string;
  x: number;
  z: number;
  dir: number;
}

export interface PiratePresenceSnapshot {
  zone: typeof POCKET_MONSTER_PIRATE_ZONE;
  players: PiratePresencePlayer[];
}

export interface ParentPresenceEvent {
  data: unknown;
  origin: string;
  source: unknown;
}

type ParentPresenceListener = (event: ParentPresenceEvent) => void;

export interface ParentPresenceHost {
  addMessageListener(listener: ParentPresenceListener): void;
  removeMessageListener(listener: ParentPresenceListener): void;
  postToParent(message: unknown, targetOrigin: string): void;
  isParentSource(source: unknown): boolean;
}

interface RemotePresenceSink {
  setIsland(islandId: string): void;
  applyPresence(snapshot: RealtimePresenceSnapshot): void;
  remove(playerId: string): void;
}

export interface PocketMonsterParentPresenceOptions {
  targetOrigin: string;
  host: ParentPresenceHost;
  remotePlayers: Pick<RemotePlayers, 'setIsland' | 'applyPresence' | 'remove'> | RemotePresenceSink;
  getPosition(): { x: number; y: number; z: number };
  getHeading(): number;
  getIslandId(): string;
  heightAt(x: number, z: number): number;
  now?: () => number;
  publishIntervalMs?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Presence is enabled only for an actual iframe with an explicit origin-only
 * parentOrigin parameter. Standalone/offline builds remain completely local.
 */
export function resolvePocketMonsterParentOrigin(
  search: string,
  ownOrigin: string,
  embedded: boolean,
): string | null {
  if (!embedded) return null;
  const raw = new URLSearchParams(search).get('parentOrigin');
  if (!raw) return null;
  try {
    const parsed = new URL(raw, ownOrigin);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    if (raw.replace(/\/$/, '') !== parsed.origin) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

/** Accept only the read-only Pocket Monster snapshot contract for Pirate Fruit. */
export function parsePiratePresenceSnapshotMessage(data: unknown): PiratePresenceSnapshot | null {
  if (!isRecord(data) || data.type !== PIRATE_PRESENCE_SNAPSHOT_MESSAGE) return null;
  const payload = data.payload;
  if (!isRecord(payload) || payload.zone !== POCKET_MONSTER_PIRATE_ZONE) return null;
  if (!Array.isArray(payload.players)) return null;

  const players: PiratePresencePlayer[] = [];
  const seen = new Set<string>();
  for (const candidate of payload.players) {
    if (players.length >= MAX_REMOTE_PLAYERS) break;
    if (!isRecord(candidate)) continue;
    const id = typeof candidate.id === 'string'
      ? candidate.id.trim().slice(0, MAX_PLAYER_ID_LENGTH)
      : '';
    if (!id || seen.has(id) || !finiteNumber(candidate.x) || !finiteNumber(candidate.z)) continue;
    seen.add(id);
    players.push({
      id,
      name: typeof candidate.name === 'string'
        ? candidate.name.trim().slice(0, MAX_PLAYER_NAME_LENGTH) || 'ผู้เล่นออนไลน์'
        : 'ผู้เล่นออนไลน์',
      x: candidate.x,
      z: candidate.z,
      dir: finiteNumber(candidate.dir) ? candidate.dir : 0,
    });
  }
  return { zone: POCKET_MONSTER_PIRATE_ZONE, players };
}

export function createBrowserParentPresenceHost(): ParentPresenceHost {
  const wrappers = new Map<ParentPresenceListener, (event: MessageEvent) => void>();
  return {
    addMessageListener(listener) {
      const wrapped = (event: MessageEvent) => listener(event);
      wrappers.set(listener, wrapped);
      window.addEventListener('message', wrapped);
    },
    removeMessageListener(listener) {
      const wrapped = wrappers.get(listener);
      if (!wrapped) return;
      window.removeEventListener('message', wrapped);
      wrappers.delete(listener);
    },
    postToParent(message, targetOrigin) {
      window.parent.postMessage(message, targetOrigin);
    },
    isParentSource(source) {
      return source === window.parent;
    },
  };
}

/**
 * Bridges presentation-only presence through the already-authenticated parent
 * socket. This class never opens a socket and never mutates save/gameplay state.
 */
export class PocketMonsterParentPresence {
  private readonly remotePlayers: RemotePresenceSink;
  private readonly now: () => number;
  private readonly publishIntervalMs: number;
  private readonly visibleIds = new Set<string>();
  private readonly previousPositions = new Map<string, { x: number; z: number }>();
  private lastIslandId: string | null = null;
  private lastPublishedAt = Number.NEGATIVE_INFINITY;
  private started = false;

  private readonly onMessage = (event: ParentPresenceEvent): void => {
    if (event.origin !== this.options.targetOrigin || !this.options.host.isParentSource(event.source)) return;
    const snapshot = parsePiratePresenceSnapshotMessage(event.data);
    if (!snapshot) return;
    this.applySnapshot(snapshot);
  };

  constructor(private readonly options: PocketMonsterParentPresenceOptions) {
    this.remotePlayers = options.remotePlayers;
    this.now = options.now ?? (() => Date.now());
    this.publishIntervalMs = Math.max(50, options.publishIntervalMs ?? DEFAULT_PUBLISH_INTERVAL_MS);
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.options.host.addMessageListener(this.onMessage);
    this.syncIsland();
    this.publishLocalPresence(true);
  }

  update(): void {
    if (!this.started) return;
    this.syncIsland();
    this.publishLocalPresence(false);
  }

  dispose(): void {
    if (!this.started) return;
    this.started = false;
    this.options.host.removeMessageListener(this.onMessage);
    for (const id of this.visibleIds) this.remotePlayers.remove(id);
    this.visibleIds.clear();
    this.previousPositions.clear();
  }

  private syncIsland(): string {
    const islandId = this.options.getIslandId();
    if (islandId !== this.lastIslandId) {
      this.lastIslandId = islandId;
      this.remotePlayers.setIsland(islandId);
      this.visibleIds.clear();
      this.previousPositions.clear();
    }
    return islandId;
  }

  private publishLocalPresence(force: boolean): void {
    const now = this.now();
    if (!force && now - this.lastPublishedAt < this.publishIntervalMs) return;
    const position = this.options.getPosition();
    const dir = this.options.getHeading();
    if (!finiteNumber(position?.x) || !finiteNumber(position?.z) || !finiteNumber(dir)) return;
    this.lastPublishedAt = now;
    this.options.host.postToParent({
      type: PIRATE_LOCAL_PRESENCE_MESSAGE,
      zone: POCKET_MONSTER_PIRATE_ZONE,
      x: position.x,
      z: position.z,
      dir,
    }, this.options.targetOrigin);
  }

  private applySnapshot(snapshot: PiratePresenceSnapshot): void {
    const islandId = this.syncIsland();
    const seen = new Set<string>();
    for (const player of snapshot.players) {
      seen.add(player.id);
      const previous = this.previousPositions.get(player.id);
      const moved = previous ? Math.hypot(player.x - previous.x, player.z - previous.z) : 0;
      this.previousPositions.set(player.id, { x: player.x, z: player.z });
      this.remotePlayers.applyPresence({
        playerId: player.id,
        name: player.name,
        islandId,
        x: player.x,
        y: this.options.heightAt(player.x, player.z),
        z: player.z,
        heading: player.dir,
        onBoat: false,
        locomotion: moved > 0.15 ? 'run' : 'idle',
      });
    }
    for (const id of this.visibleIds) {
      if (!seen.has(id)) {
        this.remotePlayers.remove(id);
        this.previousPositions.delete(id);
      }
    }
    this.visibleIds.clear();
    for (const id of seen) this.visibleIds.add(id);
  }
}
