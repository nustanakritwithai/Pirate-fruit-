import type { RealtimePresenceSnapshot } from './RealtimeClient';
import type { RemotePlayers } from './RemotePlayers';
import type { PlayerActionSnapshot } from '../animation/PlayerActionAnimator';
import type { RealtimePlayerAnimation, RealtimePlayerPresentation, RealtimePlayerVisual } from '@pirate-fruit/shared';
import type { SharedMonsterActor } from '../monster/SharedMonsterClient';
import type { PirateMonsterIntent } from '../monster/PirateMonsterAuthorityAdapter';
import type { PirateCentralAuthorityCapability } from '../monster/PirateCentralAuthorityRuntimeAdapter';
import { sanitizePresentation, sanitizeVisual } from './PresentationProtocol';

export const POCKET_MONSTER_PIRATE_ZONE = 'pirate-fruit';
export const PIRATE_LOCAL_PRESENCE_MESSAGE = 'pocketmonster:pirate-presence-v1';
export const PIRATE_PRESENCE_SNAPSHOT_MESSAGE = 'pocketmonster:pirate-presence-snapshot-v1';

const MAX_REMOTE_PLAYERS = 100;
const MAX_PLAYER_ID_LENGTH = 80;
const MAX_PLAYER_NAME_LENGTH = 32;
const DEFAULT_PUBLISH_INTERVAL_MS = 100;
const MAX_WORLD_COORDINATE = 10_000;
const MAX_VERTICAL_VELOCITY = 100;
const MAX_ACTION_SEQUENCE = 2_147_483_647;
const MIN_ACTION_DURATION_MS = 80;
const MAX_ACTION_DURATION_MS = 5_000;
// PlayerCombat's current visual timeline is castTime + followThrough. The
// generated skill catalog tops out at 0.3s castTime and 0.6s follow-through,
// so keep one bounded second for the final idle hand-off without replaying an
// action or inventing a new identity mid-cast.
const DEFAULT_ACTION_DURATION_MS = 1_000;
const MIN_TRANSIENT_LATCH_MS = 1_000;
const ACTION_SESSION_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const COMBAT_STATES = new Set<RealtimePlayerAnimation['combatState']>([
  'idle', 'attack1', 'attack2', 'attack3', 'attack4', 'casting',
  'blocking', 'stunned', 'knockback', 'knockdown', 'dead',
]);
const CATEGORIES = new Set<RealtimePlayerAnimation['category']>([
  'style', 'sword', 'gun', 'fruit', 'utility',
]);
const LOCOMOTION_VALUES = new Set<NonNullable<RealtimePresenceSnapshot['locomotion']>>([
  'idle', 'walk', 'run', 'swim',
]);
const SKILL_ANIMATION_TYPES = new Set<NonNullable<RealtimePlayerAnimation['skillAnimationType']>>([
  'projectile', 'beam', 'aoe', 'ground', 'dash',
  'flurry', 'buff', 'summon', 'homing', 'teleport',
]);

interface ShortActionMetadata {
  actionSessionId: string;
  actionSequence: number;
  actionDurationMs: number;
}

export type PiratePresenceAnimation = RealtimePlayerAnimation & Partial<ShortActionMetadata>;

export interface PiratePresencePlayer {
  id: string;
  name: string;
  x: number;
  y?: number;
  z: number;
  dir: number;
  locomotion?: NonNullable<RealtimePresenceSnapshot['locomotion']>;
  animation?: PiratePresenceAnimation;
  presentation?: RealtimePlayerPresentation;
  visual?: RealtimePlayerVisual;
}

export interface PiratePresenceSnapshot {
  zone: typeof POCKET_MONSTER_PIRATE_ZONE;
  players: PiratePresencePlayer[];
  actors?: SharedMonsterActor[];
  centralAuthority?: PirateCentralAuthorityCapability;
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
  /** Same presentation snapshot used by the local player animator. */
  getActionSnapshot?(): PlayerActionSnapshot | null;
  getPresentation?(): RealtimePlayerPresentation | undefined;
  getVisual?(): RealtimePlayerVisual | undefined;
  acknowledgeVisual?(eventCount: number): void;
  /** Deterministic override for tests; production generates one id per runtime. */
  actionSessionId?: string;
  now?: () => number;
  publishIntervalMs?: number;
  onIslandChange?(): void;
  getMonsterActors?(): readonly SharedMonsterActor[];
  drainMonsterIntents?(): readonly PirateMonsterIntent[];
  onMonsterActors?(zone: string, actors: readonly SharedMonsterActor[]): void;
  onCentralAuthority?(capability: PirateCentralAuthorityCapability | null): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function optionalClampedNumber(value: unknown, min: number, max: number): number | undefined {
  return finiteNumber(value) ? clamp(value, min, max) : undefined;
}

function optionalInteger(value: unknown, min: number, max: number): number | undefined {
  return Number.isInteger(value) && typeof value === 'number' && value >= min && value <= max
    ? value
    : undefined;
}

function createActionSessionId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid && ACTION_SESSION_PATTERN.test(uuid)) return uuid;
  const random = Math.random().toString(36).slice(2, 14);
  return `pirate_${Date.now().toString(36)}_${random}`.slice(0, 64);
}

function sanitizeActionSessionId(value: string | undefined): string {
  return value && ACTION_SESSION_PATTERN.test(value) ? value : createActionSessionId();
}

function sanitizeLocomotion(value: unknown): NonNullable<RealtimePresenceSnapshot['locomotion']> | undefined {
  return typeof value === 'string'
    && LOCOMOTION_VALUES.has(value as NonNullable<RealtimePresenceSnapshot['locomotion']>)
    ? value as NonNullable<RealtimePresenceSnapshot['locomotion']>
    : undefined;
}

function sanitizeAnimation(value: unknown): PiratePresenceAnimation | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.combatState !== 'string'
    || !COMBAT_STATES.has(value.combatState as RealtimePlayerAnimation['combatState'])) return undefined;
  if (typeof value.category !== 'string'
    || !CATEGORIES.has(value.category as RealtimePlayerAnimation['category'])) return undefined;
  if (typeof value.onGround !== 'boolean' || typeof value.dashing !== 'boolean'
    || !finiteNumber(value.verticalVelocity)) return undefined;

  const animation: PiratePresenceAnimation = {
    combatState: value.combatState as RealtimePlayerAnimation['combatState'],
    category: value.category as RealtimePlayerAnimation['category'],
    onGround: value.onGround,
    dashing: value.dashing,
    verticalVelocity: clamp(value.verticalVelocity, -MAX_VERTICAL_VELOCITY, MAX_VERTICAL_VELOCITY),
  };
  const attackProgress = optionalClampedNumber(value.attackProgress, 0, 1);
  const hitReactionId = optionalInteger(value.hitReactionId, 0, MAX_ACTION_SEQUENCE);
  const hitReactionAngle = optionalClampedNumber(value.hitReactionAngle, -Math.PI, Math.PI);
  const skillAnimationProgress = optionalClampedNumber(value.skillAnimationProgress, 0, 1);
  const skillAnimationReleaseProgress = optionalClampedNumber(value.skillAnimationReleaseProgress, 0, 1);
  const skillAnimationVariant = optionalInteger(value.skillAnimationVariant, 0, 16);
  if (attackProgress !== undefined) animation.attackProgress = attackProgress;
  if (hitReactionId !== undefined) animation.hitReactionId = hitReactionId;
  if (hitReactionAngle !== undefined) animation.hitReactionAngle = hitReactionAngle;
  if (skillAnimationProgress !== undefined) animation.skillAnimationProgress = skillAnimationProgress;
  if (skillAnimationReleaseProgress !== undefined) {
    animation.skillAnimationReleaseProgress = skillAnimationReleaseProgress;
  }
  if (typeof value.skillAnimationType === 'string'
    && SKILL_ANIMATION_TYPES.has(value.skillAnimationType as NonNullable<RealtimePlayerAnimation['skillAnimationType']>)) {
    animation.skillAnimationType = value.skillAnimationType as NonNullable<RealtimePlayerAnimation['skillAnimationType']>;
  }
  if (skillAnimationVariant !== undefined) animation.skillAnimationVariant = skillAnimationVariant;
  if (typeof value.skillAnimationUltimate === 'boolean') {
    animation.skillAnimationUltimate = value.skillAnimationUltimate;
  }
  if (typeof value.skillAnimationCategory === 'string'
    && CATEGORIES.has(value.skillAnimationCategory as RealtimePlayerAnimation['category'])) {
    animation.skillAnimationCategory = value.skillAnimationCategory as RealtimePlayerAnimation['category'];
  }

  const actionSessionId = typeof value.actionSessionId === 'string' ? value.actionSessionId : undefined;
  const actionSequence = optionalInteger(value.actionSequence, 1, MAX_ACTION_SEQUENCE);
  const actionDurationMs = optionalInteger(value.actionDurationMs, MIN_ACTION_DURATION_MS, MAX_ACTION_DURATION_MS);
  if (isTransientAnimation(animation)
    && actionSessionId && ACTION_SESSION_PATTERN.test(actionSessionId)
    && actionSequence !== undefined && actionDurationMs !== undefined) {
    animation.actionSessionId = actionSessionId;
    animation.actionSequence = actionSequence;
    animation.actionDurationMs = actionDurationMs;
  }
  return animation;
}

function isTransientAnimation(animation: Pick<PiratePresenceAnimation, 'combatState' | 'dashing'>): boolean {
  return animation.dashing
    || animation.combatState === 'attack1'
    || animation.combatState === 'attack2'
    || animation.combatState === 'attack3'
    || animation.combatState === 'attack4'
    || animation.combatState === 'casting'
    || animation.combatState === 'stunned'
    || animation.combatState === 'knockback'
    || animation.combatState === 'knockdown';
}

function transientKey(animation: PiratePresenceAnimation): string | null {
  const skillProgress = animation.skillAnimationProgress;
  const skillTimelineActive = typeof animation.skillAnimationType === 'string'
    && skillProgress !== undefined
    && skillProgress < 1;
  if (skillTimelineActive) {
    return [
      'skill',
      animation.category,
      animation.skillAnimationType ?? '',
      animation.skillAnimationVariant ?? '',
      animation.skillAnimationUltimate === true ? 'ultimate' : '',
    ].join(':');
  }
  if (!isTransientAnimation(animation)) return null;
  if (animation.combatState !== 'idle') {
    return [
      animation.combatState,
      animation.category,
      animation.skillAnimationType ?? '',
      animation.skillAnimationVariant ?? '',
      animation.skillAnimationUltimate === true ? 'ultimate' : '',
    ].join(':');
  }
  return `dash:${animation.category}`;
}

function withoutActionMetadata(animation: PiratePresenceAnimation): PiratePresenceAnimation {
  const {
    actionSessionId: _actionSessionId,
    actionSequence: _actionSequence,
    actionDurationMs: _actionDurationMs,
    ...current
  } = animation;
  return current;
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
    const y = optionalClampedNumber(candidate.y, -MAX_WORLD_COORDINATE, MAX_WORLD_COORDINATE);
    const locomotion = sanitizeLocomotion(candidate.locomotion);
    const animation = sanitizeAnimation(candidate.animation);
    const presentation = sanitizePresentation(candidate.presentation) ?? undefined;
    const visual = sanitizeVisual(candidate.visual) ?? undefined;
    players.push({
      id,
      name: typeof candidate.name === 'string'
        ? candidate.name.trim().slice(0, MAX_PLAYER_NAME_LENGTH) || 'ผู้เล่นออนไลน์'
        : 'ผู้เล่นออนไลน์',
      x: clamp(candidate.x, -MAX_WORLD_COORDINATE, MAX_WORLD_COORDINATE),
      ...(y !== undefined ? { y } : {}),
      z: clamp(candidate.z, -MAX_WORLD_COORDINATE, MAX_WORLD_COORDINATE),
      dir: finiteNumber(candidate.dir) ? candidate.dir : 0,
      ...(locomotion ? { locomotion } : {}),
      ...(animation ? { animation } : {}),
      ...(presentation ? { presentation } : {}),
      ...(visual ? { visual } : {}),
    });
  }
  const actors = Array.isArray(payload.actors)
    ? payload.actors.filter((actor): actor is SharedMonsterActor => isRecord(actor) && actor.kind === 'monster')
    : undefined;
  const authorityGeneration = isRecord(payload.centralAuthority) ? payload.centralAuthority.generation : undefined;
  const authority = isRecord(payload.centralAuthority)
    && payload.centralAuthority.schema === 'pirate-central-authority/1'
    && payload.centralAuthority.identity === 'pirate-central-spatial'
    && typeof payload.centralAuthority.zone === 'string'
    && Number.isSafeInteger(authorityGeneration)
    && (authorityGeneration as number) >= 1
    ? payload.centralAuthority as unknown as PirateCentralAuthorityCapability
    : undefined;
  return { zone: POCKET_MONSTER_PIRATE_ZONE, players, ...(actors ? { actors } : {}), ...(authority ? { centralAuthority: authority } : {}) };
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

interface SampledLocalPresence {
  x: number;
  y?: number;
  z: number;
  dir: number;
  locomotion?: NonNullable<RealtimePresenceSnapshot['locomotion']>;
  animation?: PiratePresenceAnimation;
  presentation?: RealtimePlayerPresentation;
  visual?: RealtimePlayerVisual;
}

interface LatchedLocalAction {
  key: string;
  sequence: number;
  durationMs: number;
  expiresAt: number;
  animation: PiratePresenceAnimation;
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
  private sampledPresence: SampledLocalPresence | null = null;
  private liveTransientKey: string | null = null;
  private latchedAction: LatchedLocalAction | null = null;
  private actionSequence = 0;
  private actionSessionId: string;

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
    this.actionSessionId = sanitizeActionSessionId(options.actionSessionId);
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.options.host.addMessageListener(this.onMessage);
    this.syncIsland();
    this.sampleLocalPresence();
    this.publishLocalPresence(true);
  }

  update(): void {
    if (!this.started) return;
    this.syncIsland();
    this.sampleLocalPresence();
    this.publishLocalPresence(false);
  }

  dispose(): void {
    if (!this.started) return;
    this.started = false;
    this.options.host.removeMessageListener(this.onMessage);
    for (const id of this.visibleIds) this.remotePlayers.remove(id);
    this.visibleIds.clear();
    this.previousPositions.clear();
    this.sampledPresence = null;
    this.liveTransientKey = null;
    this.latchedAction = null;
  }

  private syncIsland(): string {
    const islandId = this.options.getIslandId();
    if (islandId !== this.lastIslandId) {
      this.lastIslandId = islandId;
      this.remotePlayers.setIsland(islandId);
      this.visibleIds.clear();
      this.previousPositions.clear();
      this.liveTransientKey = null;
      this.latchedAction = null;
      this.options.onIslandChange?.();
    }
    return islandId;
  }

  private nextActionSequence(): number {
    if (this.actionSequence >= MAX_ACTION_SEQUENCE) {
      this.actionSessionId = createActionSessionId();
      this.actionSequence = 1;
    } else {
      this.actionSequence += 1;
    }
    return this.actionSequence;
  }

  /** Capture visual state every fixed update, independently from publish cadence. */
  private sampleLocalPresence(): void {
    const position = this.options.getPosition();
    const dir = this.options.getHeading();
    if (!finiteNumber(position?.x) || !finiteNumber(position?.z) || !finiteNumber(dir)) {
      this.sampledPresence = null;
      return;
    }

    const sampled: SampledLocalPresence = {
      x: clamp(position.x, -MAX_WORLD_COORDINATE, MAX_WORLD_COORDINATE),
      ...(finiteNumber(position.y)
        ? { y: clamp(position.y, -MAX_WORLD_COORDINATE, MAX_WORLD_COORDINATE) }
        : {}),
      z: clamp(position.z, -MAX_WORLD_COORDINATE, MAX_WORLD_COORDINATE),
      dir,
    };
    let animation: PiratePresenceAnimation | undefined;
    try {
      const actionSnapshot = this.options.getActionSnapshot?.();
      animation = sanitizeAnimation(actionSnapshot);
      const locomotion = sanitizeLocomotion(actionSnapshot?.locomotion);
      if (locomotion) sampled.locomotion = locomotion;
    } catch {
      // Visual sampling is presentation-only and must not block pose presence.
    }

    if (animation) {
      animation = withoutActionMetadata(animation);
      const now = this.now();
      const key = transientKey(animation);
      if (key) {
        if (key !== this.liveTransientKey) {
          const durationMs = DEFAULT_ACTION_DURATION_MS;
          const sequence = this.nextActionSequence();
          this.latchedAction = {
            key,
            sequence,
            durationMs,
            expiresAt: now + Math.max(durationMs, MIN_TRANSIENT_LATCH_MS),
            animation,
          };
        } else if (this.latchedAction) {
          this.latchedAction.animation = animation;
        }
        this.liveTransientKey = key;
        if (this.latchedAction) {
          animation = {
            ...animation,
            actionSessionId: this.actionSessionId,
            actionSequence: this.latchedAction.sequence,
            actionDurationMs: this.latchedAction.durationMs,
          };
        }
      } else {
        this.liveTransientKey = null;
        const currentStateOverridesLatch = animation.combatState === 'blocking'
          || animation.combatState === 'dead';
        if (currentStateOverridesLatch) this.latchedAction = null;
        if (!currentStateOverridesLatch && animation.combatState === 'idle'
          && this.latchedAction && now < this.latchedAction.expiresAt) {
          animation = {
            ...this.latchedAction.animation,
            actionSessionId: this.actionSessionId,
            actionSequence: this.latchedAction.sequence,
            actionDurationMs: this.latchedAction.durationMs,
          };
        } else if (this.latchedAction && now >= this.latchedAction.expiresAt) {
          this.latchedAction = null;
        }
      }
      sampled.animation = animation;
    }
    sampled.presentation = sanitizePresentation(this.options.getPresentation?.()) ?? undefined;
    sampled.visual = sanitizeVisual(this.options.getVisual?.()) ?? undefined;
    this.sampledPresence = sampled;
  }

  private publishLocalPresence(force: boolean): void {
    const now = this.now();
    if (!force && now - this.lastPublishedAt < this.publishIntervalMs) return;
    const presence = this.sampledPresence;
    if (!presence) return;
    this.lastPublishedAt = now;
    try {
      this.options.host.postToParent({
      type: PIRATE_LOCAL_PRESENCE_MESSAGE,
      zone: POCKET_MONSTER_PIRATE_ZONE,
      x: presence.x,
      ...(presence.y !== undefined ? { y: presence.y } : {}),
      z: presence.z,
      dir: presence.dir,
      ...(presence.locomotion ? { locomotion: presence.locomotion } : {}),
      ...(presence.animation ? { animation: presence.animation } : {}),
      ...(presence.presentation ? { presentation: presence.presentation } : {}),
      ...(presence.visual ? { visual: presence.visual } : {}),
      ...(this.options.getMonsterActors ? { actors: this.options.getMonsterActors().slice(0, 128) } : {}),
      ...(this.options.drainMonsterIntents ? { monsterIntents: this.options.drainMonsterIntents().slice(0, 32) } : {}),
      }, this.options.targetOrigin);
      if (presence.visual) this.options.acknowledgeVisual?.(presence.visual.events.length);
    } catch {
      this.lastPublishedAt = Number.NEGATIVE_INFINITY;
    }
  }

  private applySnapshot(snapshot: PiratePresenceSnapshot): void {
    const islandId = this.syncIsland();
    this.options.onCentralAuthority?.(snapshot.centralAuthority ?? null);
    const seen = new Set<string>();
    for (const player of snapshot.players) {
      seen.add(player.id);
      const previous = this.previousPositions.get(player.id);
      const moved = previous ? Math.hypot(player.x - previous.x, player.z - previous.z) : 0;
      this.previousPositions.set(player.id, { x: player.x, z: player.z });
      const y = player.y ?? this.options.heightAt(player.x, player.z);
      this.remotePlayers.applyPresence({
        playerId: player.id,
        name: player.name,
        islandId,
        x: player.x,
        y,
        z: player.z,
        heading: player.dir,
        onBoat: false,
        locomotion: player.locomotion ?? (moved > 0.15 ? 'run' : 'idle'),
        ...(player.animation ? { animation: player.animation } : {}),
        ...(player.presentation ? { presentation: player.presentation } : {}),
        ...(player.visual ? { visual: player.visual } : {}),
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
    if (snapshot.actors) this.options.onMonsterActors?.(islandId, snapshot.actors);
  }
}
