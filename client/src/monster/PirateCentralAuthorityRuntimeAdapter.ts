export interface PirateCentralAuthorityCapability {
  contract: 'pirate-central-spatial/1';
  schemaVersion: 1;
  contentRevision: 'pirate-monster-catalog-2026-09-07-ai-v2-transport-v2';
  contentHash: 'fnv1a-236acf41';
  manifestSha256: '7D0B9E054B4D9F7669EC0EB34E4F93EE3ADF46E655E4FC7D30EFBBE8C4DD83A0';
  vectorsSha256: 'A3571B1D11E8EBFF68F9B1A027EF847E74D33B93B861D083D450910ADB4B4DF7';
  transportZone: 'pirate-fruit';
  generation: number;
}

export const PIRATE_CENTRAL_TRANSPORT_ZONE = 'pirate-fruit';
export const PIRATE_CENTRAL_CONTRACT = 'pirate-central-spatial/1';
export const PIRATE_CENTRAL_SCHEMA_VERSION = 1;
export const PIRATE_CENTRAL_CONTENT_REVISION = 'pirate-monster-catalog-2026-09-07-ai-v2-transport-v2';
export const PIRATE_CENTRAL_CONTENT_HASH = 'fnv1a-236acf41';
export const PIRATE_CENTRAL_MANIFEST_SHA256 = '7D0B9E054B4D9F7669EC0EB34E4F93EE3ADF46E655E4FC7D30EFBBE8C4DD83A0';
export const PIRATE_CENTRAL_VECTORS_SHA256 = 'A3571B1D11E8EBFF68F9B1A027EF847E74D33B93B861D083D450910ADB4B4DF7';

function valid(value: unknown): value is PirateCentralAuthorityCapability {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PirateCentralAuthorityCapability>;
  return candidate.contract === PIRATE_CENTRAL_CONTRACT
    && candidate.schemaVersion === PIRATE_CENTRAL_SCHEMA_VERSION
    && candidate.contentRevision === PIRATE_CENTRAL_CONTENT_REVISION
    && candidate.contentHash === PIRATE_CENTRAL_CONTENT_HASH
    && candidate.manifestSha256 === PIRATE_CENTRAL_MANIFEST_SHA256
    && candidate.vectorsSha256 === PIRATE_CENTRAL_VECTORS_SHA256
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
  get sessionKey(): string | null {
    const capability = this.capability;
    if (!capability) return null;
    return [capability.transportZone, capability.generation, capability.manifestSha256, capability.vectorsSha256].join(':');
  }
}
