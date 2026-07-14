import type { SimulationSnapshot } from './SimulationInspectorTypes';

/** Ring buffer of simulation snapshots for 30–60s time scrubbing */
export class SimulationTimeMachine {
  private readonly buffer: SimulationSnapshot[] = [];
  private readonly maxSeconds: number;
  private readonly intervalMs: number;
  private lastCaptureAt = 0;
  private scrubIndex: number | null = null;

  constructor(maxSeconds = 60, intervalMs = 1000) {
    this.maxSeconds = maxSeconds;
    this.intervalMs = intervalMs;
  }

  get length(): number {
    return this.buffer.length;
  }

  get isScrubbing(): boolean {
    return this.scrubIndex !== null;
  }

  get activeSnapshot(): SimulationSnapshot | null {
    if (this.scrubIndex === null) return this.buffer[0] ?? null;
    return this.buffer[this.scrubIndex] ?? null;
  }

  capture(snapshot: SimulationSnapshot, now = Date.now()): boolean {
    if (this.buffer.length > 0 && now - this.lastCaptureAt < this.intervalMs) return false;
    this.lastCaptureAt = now;
    this.buffer.unshift(snapshot);
    const maxLen = Math.ceil((this.maxSeconds * 1000) / this.intervalMs);
    if (this.buffer.length > maxLen) {
      this.buffer.length = maxLen;
    }
    if (this.scrubIndex !== null && this.scrubIndex >= this.buffer.length) {
      this.scrubIndex = this.buffer.length - 1;
    }
    return true;
  }

  /** 0 = newest, 1 = oldest */
  setScrubPosition(ratio: number): SimulationSnapshot | null {
    if (this.buffer.length === 0) {
      this.scrubIndex = null;
      return null;
    }
    const clamped = Math.max(0, Math.min(1, ratio));
    const idx = Math.round(clamped * (this.buffer.length - 1));
    this.scrubIndex = idx;
    return this.buffer[idx] ?? null;
  }

  clearScrub(): void {
    this.scrubIndex = null;
  }

  getTimelineLabels(): { at: number; label: string }[] {
    return this.buffer.map((s) => ({
      at: s.at,
      label: formatTimeLabel(s.at),
    }));
  }

  clear(): void {
    this.buffer.length = 0;
    this.scrubIndex = null;
    this.lastCaptureAt = 0;
  }
}

export function formatTimeLabel(at: number): string {
  const d = new Date(at);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}
