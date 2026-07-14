import type { SimulationEvent, SimulationEventCategory } from './SimulationInspectorTypes';

let eventCounter = 0;

export function resetSimulationEventCounter(): void {
  eventCounter = 0;
}

/** Unified timeline event bus for all simulation subsystems */
export class SimulationEventBus {
  private readonly events: SimulationEvent[] = [];
  private readonly maxEvents: number;

  constructor(maxEvents = 500) {
    this.maxEvents = maxEvents;
  }

  emit(category: SimulationEventCategory, message: string, tick?: number): SimulationEvent {
    const event: SimulationEvent = {
      id: `sim-${++eventCounter}`,
      at: Date.now(),
      category,
      message,
      tick,
    };
    this.events.unshift(event);
    if (this.events.length > this.maxEvents) {
      this.events.length = this.maxEvents;
    }
    return event;
  }

  getEvents(filter?: SimulationEventCategory | 'all'): readonly SimulationEvent[] {
    if (!filter || filter === 'all') return this.events;
    return this.events.filter((e) => e.category === filter);
  }

  clear(): void {
    this.events.length = 0;
  }

  get size(): number {
    return this.events.length;
  }
}
