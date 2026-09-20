import type { PocketOperationExecutor } from '../persistence/PocketOperationExecutor';

export interface PirateVitalsInput {
  blocking: boolean;
  mounted: boolean;
  sprinting: boolean;
}

function key(prefix: string): string {
  const id = typeof globalThis.crypto?.randomUUID === 'function' ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}:${id}`;
}

function acceptedOutcome(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const outcome = value as Record<string, unknown>;
  return outcome.ok === true || outcome.accepted === true || outcome.changed === true;
}

/** Parent RPC adapter: bounded vitals input and atomic server heal requests. */
export class PirateVitalsEmitter {
  private inputInFlight = false;
  private lastInputAt = 0;

  constructor(private readonly executor: PocketOperationExecutor) {}

  /** ล้าง debounce เมื่อออกจากฉาก โดยไม่ยกเลิกคำขอที่กำลังรอผลจาก Server */
  reset(): void {
    this.lastInputAt = 0;
  }

  async sendInput(input: PirateVitalsInput): Promise<boolean> {
    const now = Date.now();
    if (this.inputInFlight || (this.lastInputAt > 0 && now - this.lastInputAt < 500)) return false;
    this.inputInFlight = true;
    this.lastInputAt = now;
    try {
      const reply = await this.executor.request({ type: 'vitalsInput', contract: 'pirate-vitals/1', ...input });
      return acceptedOutcome(reply.outcome);
    } finally {
      this.inputInFlight = false;
    }
  }

  async potion(potionId: string): Promise<boolean> {
    const reply = await this.executor.request({ type: 'vitalsPotion', contract: 'pirate-vitals/1', potionId, idempotencyKey: key('vitals-potion') });
    return acceptedOutcome(reply.outcome);
  }

  async buff(skillId: string): Promise<boolean> {
    const reply = await this.executor.request({ type: 'vitalsBuff', contract: 'pirate-vitals/1', skillId, idempotencyKey: key('vitals-buff') });
    return acceptedOutcome(reply.outcome);
  }

  async skill(skillId: string): Promise<boolean> {
    const reply = await this.executor.request({ type: 'vitalsSkill', contract: 'pirate-vitals/1', skillId, idempotencyKey: key('vitals-skill') });
    return acceptedOutcome(reply.outcome);
  }

  async respawn(): Promise<boolean> {
    const reply = await this.executor.request({ type: 'vitalsRespawn', contract: 'pirate-vitals/1', idempotencyKey: key('vitals-respawn') });
    return acceptedOutcome(reply.outcome);
  }
}
