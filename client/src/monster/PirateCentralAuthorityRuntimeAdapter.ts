export interface PirateCentralAuthorityCapability {
  contract: 'pirate-central-spatial/1';
  schemaVersion: 1;
  contentRevision: 'pirate-monster-catalog-2026-09-07-ai-v2-transport-v2';
  contentHash: 'fnv1a-236acf41';
  transportZone: 'pirate-fruit';
  generation: number;
}

export const PIRATE_CENTRAL_TRANSPORT_ZONE = 'pirate-fruit';
export const PIRATE_CENTRAL_CONTRACT = 'pirate-central-spatial/1';
export const PIRATE_CENTRAL_SCHEMA_VERSION = 1;
export const PIRATE_CENTRAL_CONTENT_REVISION = 'pirate-monster-catalog-2026-09-07-ai-v2-transport-v2';
export const PIRATE_CENTRAL_CONTENT_HASH = 'fnv1a-236acf41';

function valid(value: unknown): value is PirateCentralAuthorityCapability {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PirateCentralAuthorityCapability>;
  return candidate.contract === PIRATE_CENTRAL_CONTRACT
    && candidate.schemaVersion === PIRATE_CENTRAL_SCHEMA_VERSION
    && candidate.contentRevision === PIRATE_CENTRAL_CONTENT_REVISION
    && candidate.contentHash === PIRATE_CENTRAL_CONTENT_HASH
    && candidate.transportZone === PIRATE_CENTRAL_TRANSPORT_ZONE
    && typeof candidate.generation === 'number'
    && Number.isSafeInteger(candidate.generation) && candidate.generation >= 1;
}

/** Fail-closed gate for the Parent-forwarded central NPC authority capability. */
export class PirateCentralAuthorityRuntimeAdapter {
  private capability: PirateCentralAuthorityCapability | null = null;

  update(candidate: unknown, transportZone = PIRATE_CENTRAL_TRANSPORT_ZONE): boolean {
    if (!valid(candidate) || candidate.transportZone !== transportZone) {
      this.capability = null;
      return false;
    }
    const generation = candidate.generation;
    if (this.capability && generation < this.capability.generation) return false;
    this.capability = Object.freeze({ ...candidate });
    return true;
  }

  reset(): void { this.capability = null; }

  accepts(zone: string): boolean {
    return this.capability !== null && typeof zone === 'string' && zone.length > 0;
  }

  get active(): boolean { return this.capability !== null; }
  get generation(): number | null { return this.capability?.generation ?? null; }
}
