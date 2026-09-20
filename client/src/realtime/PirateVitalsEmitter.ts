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

/** Parent RPC adapter: bounded vitals input and atomic server heal requests. */
export class PirateVitalsEmitter {
  private inputInFlight = false;
  private lastInputAt = 0;
  private lastInputSignature = '';

  constructor(private readonly executor: PocketOperationExecutor) {}

  /** ล้าง debounce เมื่อออกจากฉาก โดยไม่ยกเลิกคำขอที่กำลังรอผลจาก Server */
  reset(): void {
    this.lastInputSignature = '';
    this.lastInputAt = 0;
  }

  async sendInput(input: PirateVitalsInput): Promise<boolean> {
    const signature = `${input.blocking ? 1 : 0}:${input.mounted ? 1 : 0}:${input.sprinting ? 1 : 0}`;
    const now = Date.now();
    if (this.inputInFlight || (signature === this.lastInputSignature && now - this.lastInputAt < 500)) return false;
    this.inputInFlight = true;
    this.lastInputSignature = signature;
    this.lastInputAt = now;
    try {
      const reply = await this.executor.request({ type: 'vitalsInput', contract: 'pirate-vitals/1', ...input });
      return Boolean((reply.outcome as { ok?: unknown } | null)?.ok);
    } finally {
      this.inputInFlight = false;
    }
  }

  async potion(potionId: string): Promise<boolean> {
    const reply = await this.executor.request({ type: 'vitalsPotion', contract: 'pirate-vitals/1', potionId, idempotencyKey: key('vitals-potion') });
    return Boolean((reply.outcome as { ok?: unknown } | null)?.ok);
  }

  async buff(skillId: string): Promise<boolean> {
    const reply = await this.executor.request({ type: 'vitalsBuff', contract: 'pirate-vitals/1', skillId, idempotencyKey: key('vitals-buff') });
    return Boolean((reply.outcome as { ok?: unknown } | null)?.ok);
  }

  async respawn(): Promise<boolean> {
    const reply = await this.executor.request({ type: 'vitalsRespawn', contract: 'pirate-vitals/1', idempotencyKey: key('vitals-respawn') });
    return Boolean((reply.outcome as { ok?: unknown } | null)?.ok);
  }
}
