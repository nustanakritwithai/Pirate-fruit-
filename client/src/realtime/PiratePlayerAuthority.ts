export type PiratePlayerLifeState = 'alive' | 'dead';

export interface PiratePlayerAuthorityEntry {
  playerId: string;
  generation: number;
  stateSequence: number;
  hp: { current: number; max: number; revision: number };
  resultRevision: number;
  lifeState: PiratePlayerLifeState;
}

export interface PiratePlayerAuthoritySnapshot {
  schemaVersion: 1;
  serverTimeUtc: string;
  players: PiratePlayerAuthorityEntry[];
  results?: PiratePlayerAuthorityResult[];
  pendingServer?: boolean;
}

export interface PiratePlayerAuthorityResult {
  attackerId: string;
  targetId: string;
  attackId: string;
  generation: number;
  resultRevision: number;
  authoritativeFinalHp: number;
  serverTimeUtc: string;
}

export interface AppliedPiratePlayerAuthority {
  self?: PiratePlayerAuthorityEntry;
  acceptedPlayers: PiratePlayerAuthorityEntry[];
  acceptedResults: PiratePlayerAuthorityResult[];
  authoritativeModeValid: boolean;
}

const MAX_PLAYERS = 100;
const MAX_ID_LENGTH = 80;
const MAX_SEQUENCE = Number.MAX_SAFE_INTEGER;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeSequence(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= MAX_SEQUENCE;
}

function safeId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= MAX_ID_LENGTH;
}

function safeTime(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 64 && Number.isFinite(Date.parse(value));
}

/** Strictly accepts the new server-owned player state; legacy payloads return null. */
export function sanitizePiratePlayerAuthority(value: unknown): PiratePlayerAuthoritySnapshot | null {
  if (!record(value) || value.schemaVersion !== 1 || !safeTime(value.serverTimeUtc)
    || !Array.isArray(value.players) || value.players.length > MAX_PLAYERS) return null;
  const players: PiratePlayerAuthorityEntry[] = [];
  const seen = new Set<string>();
  for (const candidate of value.players) {
    if (!record(candidate)) return null;
    const playerId = typeof candidate.playerId === 'string' ? candidate.playerId.trim() : '';
    const hp = candidate.hp;
    if (!safeId(playerId) || seen.has(playerId.toLowerCase())
      || !safeSequence(candidate.generation) || candidate.generation < 1
      || !safeSequence(candidate.stateSequence) || !safeSequence(candidate.resultRevision)
      || (candidate.lifeState !== 'alive' && candidate.lifeState !== 'dead') || !record(hp)
      || typeof hp.current !== 'number' || !Number.isFinite(hp.current)
      || typeof hp.max !== 'number' || !Number.isFinite(hp.max) || hp.max <= 0
      || hp.current < 0 || hp.current > hp.max || !safeSequence(hp.revision)) return null;
    seen.add(playerId.toLowerCase());
    players.push({
      playerId,
      generation: candidate.generation,
      stateSequence: candidate.stateSequence,
      hp: { current: hp.current, max: hp.max, revision: hp.revision },
      resultRevision: candidate.resultRevision,
      lifeState: candidate.lifeState,
    });
  }
  let results: PiratePlayerAuthorityResult[] | undefined;
  if (value.results !== undefined) {
    if (!Array.isArray(value.results) || value.results.length > 64) return null;
    results = [];
    const seenResults = new Set<string>();
    for (const candidate of value.results) {
      if (!record(candidate) || !safeId(candidate.attackerId) || !safeId(candidate.targetId)
        || !safeId(candidate.attackId) || !safeSequence(candidate.generation) || candidate.generation < 1
        || !safeSequence(candidate.resultRevision) || typeof candidate.authoritativeFinalHp !== 'number'
        || !Number.isFinite(candidate.authoritativeFinalHp) || candidate.authoritativeFinalHp < 0
        || !safeTime(candidate.serverTimeUtc)) return null;
      const attackerId = candidate.attackerId.trim();
      const targetId = candidate.targetId.trim();
      const attackId = candidate.attackId.trim();
      const key = `${attackerId.toLowerCase()}\u0000${targetId.toLowerCase()}\u0000${candidate.generation}\u0000${attackId}`;
      if (seenResults.has(key)) return null;
      seenResults.add(key);
      results.push({ attackerId, targetId, attackId, generation: candidate.generation,
        resultRevision: candidate.resultRevision, authoritativeFinalHp: candidate.authoritativeFinalHp,
        serverTimeUtc: candidate.serverTimeUtc });
    }
  }
  return { schemaVersion: 1, serverTimeUtc: value.serverTimeUtc, players,
    ...(results ? { results } : {}),
    ...(typeof value.pendingServer === 'boolean' ? { pendingServer: value.pendingServer } : {}) };
}

export function newerPiratePlayerAuthority(
  previous: PiratePlayerAuthorityEntry | undefined,
  next: PiratePlayerAuthorityEntry,
): boolean {
  if (!previous || next.generation > previous.generation) return true;
  if (next.generation < previous.generation) return false;
  if (next.stateSequence < previous.stateSequence || next.hp.revision < previous.hp.revision
    || next.resultRevision < previous.resultRevision) return false;
  return next.stateSequence > previous.stateSequence || next.hp.revision > previous.hp.revision
    || next.resultRevision > previous.resultRevision;
}

/** Applies server state once, monotonically. Missing players never heal or reset local state. */
export class PiratePlayerAuthorityReceiver {
  private readonly players = new Map<string, PiratePlayerAuthorityEntry>();
  private readonly results = new Map<string, PiratePlayerAuthorityResult>();

  apply(value: unknown, selfPlayerId: string): AppliedPiratePlayerAuthority | null {
    const snapshot = sanitizePiratePlayerAuthority(value);
    if (!snapshot) return null;
    const acceptedPlayers: PiratePlayerAuthorityEntry[] = [];
    for (const next of snapshot.players) {
      const key = next.playerId.toLowerCase();
      const previous = this.players.get(key);
      if (previous && !newerPiratePlayerAuthority(previous, next)) {
        if (next.generation === previous.generation && next.stateSequence === previous.stateSequence
          && next.hp.revision === previous.hp.revision && next.resultRevision === previous.resultRevision
          && (next.hp.current !== previous.hp.current || next.hp.max !== previous.hp.max || next.lifeState !== previous.lifeState)) return null;
        continue;
      }
      this.players.set(key, next);
      acceptedPlayers.push(next);
    }
    const acceptedResults: PiratePlayerAuthorityResult[] = [];
    for (const result of snapshot.results ?? []) {
      const key = `${result.attackerId.toLowerCase()}\u0000${result.targetId.toLowerCase()}\u0000${result.generation}\u0000${result.attackId}`;
      const previous = this.results.get(key);
      if (previous && result.resultRevision <= previous.resultRevision) continue;
      this.results.set(key, result);
      acceptedResults.push(result);
    }
    const self = this.players.get(selfPlayerId.trim().toLowerCase());
    return { self, acceptedPlayers, acceptedResults, authoritativeModeValid: Boolean(self) };
  }

  get(playerId: string): PiratePlayerAuthorityEntry | undefined {
    return this.players.get(playerId.trim().toLowerCase());
  }
}
