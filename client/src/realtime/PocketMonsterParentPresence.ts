import type { RealtimePresenceSnapshot } from './RealtimeClient';
import type { RemotePlayers } from './RemotePlayers';

export const POCKET_MONSTER_PIRATE_ZONE = 'pirate-fruit';
export const PIRATE_LOCAL_PRESENCE_MESSAGE = 'pocketmonster:pirate-presence-v1';
export const PIRATE_PRESENCE_SNAPSHOT_MESSAGE = 'pocketmonster:pirate-presence-snapshot-v1';

const MAX_REMOTE_PLAYERS = 100;
const MAX_PLAYER_ID_LENGTH = 80;
const MAX_PLAYER_NAME_LENGTH = 32;
const DEFAULT_PUBLISH_INTERVAL_MS = 100;

/**
 * Shared Pocket Monster relay vocabulary. The parent transport sanitizes to
 * exactly these values, so the Pirate client maps its richer combat/locomotion
 * state to/from this coarse contract instead of leaking it across the iframe.
 */
export const PARENT_PRESENCE_LOCOMOTION_VALUES = ['idle', 'walk', 'run', 'swim', 'jump', 'dash'] as const;
export type ParentPresenceLocomotion = typeof PARENT_PRESENCE_LOCOMOTION_VALUES[number];
export const PARENT_PRESENCE_COMBAT_STATES = ['idle', 'attack', 'skill', 'hurt', 'dead', 'guard'] as const;
export type ParentPresenceCombatState = typeof PARENT_PRESENCE_COMBAT_STATES[number];

export interface ParentPresenceAnimation {
  combatState: ParentPresenceCombatState;
  onGround: boolean;
  dashing: boolean;
  attackProgress?: number;
  skillAnimationProgress?: number;
}

/** Local per-frame visual state the bridge publishes to the parent. */
export interface ParentPresenceLocalVisual {
  locomotion: 'idle' | 'walk' | 'run' | 'swim';
  onGround: boolean;
  dashing: boolean;
  combatState: string;
  attackProgress?: number;
  skillAnimationProgress?: number;
}

export interface PiratePresencePlayer {
  id: string;
  name: string;
  x: number;
  z: number;
  dir: number;
  locomotion?: ParentPresenceLocomotion;
  animation?: ParentPresenceAnimation;
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
  /** Optional local action/locomotion state; absent keeps the legacy pose-only contract. */
  getActionVisual?(): ParentPresenceLocalVisual | null;
  now?: () => number;
  publishIntervalMs?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Visible hop height while a remote player is airborne between presence frames. */
export const PARENT_PRESENCE_AIRBORNE_LIFT = 1.1;

export function toParentPresenceLocomotion(
  visual: Pick<ParentPresenceLocalVisual, 'locomotion' | 'onGround' | 'dashing'>,
): ParentPresenceLocomotion {
  if (!visual.onGround) return 'jump';
  if (visual.dashing) return 'dash';
  return visual.locomotion;
}

export function mapCombatStateToParent(state: string): ParentPresenceCombatState {
  if (state === 'attack1' || state === 'attack2' || state === 'attack3' || state === 'attack4') return 'attack';
  if (state === 'casting') return 'skill';
  if (state === 'blocking') return 'guard';
  if (state === 'stunned' || state === 'knockback' || state === 'knockdown') return 'hurt';
  if (state === 'dead') return 'dead';
  return 'idle';
}

function mapParentCombatStateToRemote(state: ParentPresenceCombatState):
  'idle' | 'attack1' | 'casting' | 'blocking' | 'stunned' | 'dead' {
  if (state === 'attack') return 'attack1';
  if (state === 'skill') return 'casting';
  if (state === 'guard') return 'blocking';
  if (state === 'hurt') return 'stunned';
  if (state === 'dead') return 'dead';
  return 'idle';
}

/**
 * Omits the animation payload while the player is simply standing grounded, so
 * typical presence frames stay minimal.
 */
export function toParentPresenceAnimation(visual: ParentPresenceLocalVisual): ParentPresenceAnimation | null {
  const combatState = mapCombatStateToParent(visual.combatState);
  if (combatState === 'idle' && visual.onGround && !visual.dashing) return null;
  const animation: ParentPresenceAnimation = {
    combatState,
    onGround: visual.onGround === true,
    dashing: visual.dashing === true,
  };
  if (combatState === 'attack' && finiteNumber(visual.attackProgress)) {
    animation.attackProgress = clamp01(visual.attackProgress);
  }
  if (combatState === 'skill' && finiteNumber(visual.skillAnimationProgress)) {
    animation.skillAnimationProgress = clamp01(visual.skillAnimationProgress);
  }
  return animation;
}

function parseParentPresenceLocomotion(value: unknown): ParentPresenceLocomotion | undefined {
  return typeof value === 'string'
    && (PARENT_PRESENCE_LOCOMOTION_VALUES as readonly string[]).includes(value)
    ? value as ParentPresenceLocomotion
    : undefined;
}

function parseParentPresenceAnimation(value: unknown): ParentPresenceAnimation | undefined {
  if (!isRecord(value)) return undefined;
  const combatState = typeof value.combatState === 'string'
    && (PARENT_PRESENCE_COMBAT_STATES as readonly string[]).includes(value.combatState)
    ? value.combatState as ParentPresenceCombatState
    : undefined;
  if (!combatState) return undefined;
  const animation: ParentPresenceAnimation = {
    combatState,
    onGround: value.onGround !== false,
    dashing: value.dashing === true,
  };
  if (combatState === 'attack' && finiteNumber(value.attackProgress)) {
    animation.attackProgress = clamp01(value.attackProgress);
  }
  if (combatState === 'skill' && finiteNumber(value.skillAnimationProgress)) {
    animation.skillAnimationProgress = clamp01(value.skillAnimationProgress);
  }
  return animation;
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
      locomotion: parseParentPresenceLocomotion(candidate.locomotion),
      animation: parseParentPresenceAnimation(candidate.animation),
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
    const message: Record<string, unknown> = {
      type: PIRATE_LOCAL_PRESENCE_MESSAGE,
      zone: POCKET_MONSTER_PIRATE_ZONE,
      x: position.x,
      z: position.z,
      dir,
    };
    try {
      const visual = this.options.getActionVisual?.();
      if (visual && typeof visual.locomotion === 'string' && typeof visual.onGround === 'boolean') {
        message.locomotion = toParentPresenceLocomotion(visual);
        const animation = toParentPresenceAnimation(visual);
        if (animation) message.animation = animation;
      }
    } catch {
      // A broken visual provider must never block the pose-only presence contract.
    }
    this.options.host.postToParent(message, this.options.targetOrigin);
  }

  private applySnapshot(snapshot: PiratePresenceSnapshot): void {
    const islandId = this.syncIsland();
    const seen = new Set<string>();
    for (const player of snapshot.players) {
      seen.add(player.id);
      const previous = this.previousPositions.get(player.id);
      const moved = previous ? Math.hypot(player.x - previous.x, player.z - previous.z) : 0;
      this.previousPositions.set(player.id, { x: player.x, z: player.z });
      const groundY = this.options.heightAt(player.x, player.z);
      const hasAction = player.locomotion !== undefined || player.animation !== undefined;
      const airborne = player.animation !== undefined
        ? player.animation.onGround === false
        : player.locomotion === 'jump';
      const dashing = player.animation?.dashing === true || player.locomotion === 'dash';
      const baseLocomotion: 'idle' | 'walk' | 'run' | 'swim' = player.locomotion === 'walk'
        || player.locomotion === 'run'
        || player.locomotion === 'swim'
        ? player.locomotion
        : player.locomotion === undefined ? (moved > 0.15 ? 'run' : 'idle') : 'idle';
      const locomotion: 'idle' | 'walk' | 'run' | 'swim' = airborne ? 'idle' : dashing ? 'run' : baseLocomotion;
      let animation: NonNullable<RealtimePresenceSnapshot['animation']> | undefined;
      if (hasAction) {
        animation = {
          combatState: mapParentCombatStateToRemote(player.animation?.combatState ?? 'idle'),
          category: 'style',
          onGround: !airborne,
          dashing,
          verticalVelocity: 0,
        };
        if (player.animation?.attackProgress !== undefined) {
          animation.attackProgress = player.animation.attackProgress;
        }
        if (player.animation?.skillAnimationProgress !== undefined) {
          animation.skillAnimationProgress = player.animation.skillAnimationProgress;
        }
      }
      this.remotePlayers.applyPresence({
        playerId: player.id,
        name: player.name,
        islandId,
        x: player.x,
        y: groundY + (airborne ? PARENT_PRESENCE_AIRBORNE_LIFT : 0),
        z: player.z,
        heading: player.dir,
        onBoat: false,
        locomotion,
        ...(animation ? { animation } : {}),
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
