export interface PirateCentralAuthorityCapability {
  schema: 'pirate-central-authority/1';
  identity: 'pirate-central-spatial';
  zone: string;
  generation: number;
}

export const PIRATE_CENTRAL_TRANSPORT_ZONE = 'pirate-fruit';

function valid(value: unknown): value is PirateCentralAuthorityCapability {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PirateCentralAuthorityCapability>;
  return candidate.schema === 'pirate-central-authority/1'
    && candidate.identity === 'pirate-central-spatial'
    && typeof candidate.zone === 'string'
    && candidate.zone.length > 0 && candidate.zone.length <= 40
    && typeof candidate.generation === 'number'
    && Number.isSafeInteger(candidate.generation) && candidate.generation >= 1;
}

/** Fail-closed gate for the Parent-forwarded central NPC authority capability. */
export class PirateCentralAuthorityRuntimeAdapter {
  private capability: PirateCentralAuthorityCapability | null = null;

  update(candidate: unknown, transportZone = PIRATE_CENTRAL_TRANSPORT_ZONE): boolean {
    if (!valid(candidate) || candidate.zone !== transportZone) {
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
