export const PIRATE_VITALS_CONTRACT = 'pirate-vitals/1' as const;

export interface PirateVitalsSnapshot {
  contract: typeof PIRATE_VITALS_CONTRACT;
  revision: number;
  serverTimeMs: number;
  hp: number;
  maxHp: number;
  guard: number;
  guardMax: number;
  guardBroken: boolean;
  hitstunUntil: number;
  energy: number;
  maxEnergy: number;
  mp: number;
  maxMp: number;
  dead: boolean;
  respawn?: { spawnId: string; islandId: string; x: number; y: number; z: number; heading: number; atRevision: number };
}

function finiteBounded(value: unknown, max: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && typeof max === 'number'
    && Number.isFinite(max) && value >= 0 && value <= max;
}

export function isPirateVitalsSnapshot(value: unknown): value is PirateVitalsSnapshot {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Record<string, unknown>;
  if (snapshot.contract !== PIRATE_VITALS_CONTRACT || typeof snapshot.revision !== 'number' || !Number.isSafeInteger(snapshot.revision) || snapshot.revision < 0
    || typeof snapshot.serverTimeMs !== 'number' || !Number.isFinite(snapshot.serverTimeMs) || snapshot.serverTimeMs < 0
    || !finiteBounded(snapshot.hp, snapshot.maxHp) || typeof snapshot.maxHp !== 'number' || snapshot.maxHp <= 0
    || !finiteBounded(snapshot.guard, snapshot.guardMax) || typeof snapshot.guardMax !== 'number' || snapshot.guardMax < 0
    || !finiteBounded(snapshot.energy, snapshot.maxEnergy) || typeof snapshot.maxEnergy !== 'number' || snapshot.maxEnergy < 0
    || !finiteBounded(snapshot.mp, snapshot.maxMp) || typeof snapshot.maxMp !== 'number' || snapshot.maxMp < 0
    || typeof snapshot.guardBroken !== 'boolean' || typeof snapshot.hitstunUntil !== 'number'
    || !Number.isFinite(snapshot.hitstunUntil) || snapshot.hitstunUntil < 0
    || typeof snapshot.dead !== 'boolean' || snapshot.dead !== (snapshot.hp <= 0)) return false;
  if (snapshot.respawn !== undefined) {
    const respawn = snapshot.respawn;
    if (!respawn || typeof respawn !== 'object') return false;
    const value = respawn as Record<string, unknown>;
    if (typeof value.spawnId !== 'string' || value.spawnId.length === 0 || typeof value.islandId !== 'string'
      || value.islandId.length === 0 || !Number.isFinite(value.x) || !Number.isFinite(value.y) || !Number.isFinite(value.z)
      || !Number.isFinite(value.heading) || !Number.isSafeInteger(value.atRevision)
      || value.atRevision < 1 || value.atRevision > snapshot.revision) return false;
  }
  return true;
}

/** Fail-closed receiver: once the server claims vitals, malformed/stale packets never restore local authority. */
export class PirateVitalsAuthority {
  private claimed = false;
  private lastRevision = -1;
  private current: PirateVitalsSnapshot | null = null;

  get active(): boolean { return this.claimed; }
  get revision(): number { return this.lastRevision; }
  get snapshot(): PirateVitalsSnapshot | null { return this.current ? { ...this.current, respawn: this.current.respawn && { ...this.current.respawn } } : null; }

  apply(value: unknown): boolean {
    if (!isPirateVitalsSnapshot(value) || value.revision <= this.lastRevision) return false;
    this.claimed = true;
    this.lastRevision = value.revision;
    this.current = { ...value, respawn: value.respawn && { ...value.respawn } };
    return true;
  }
}
