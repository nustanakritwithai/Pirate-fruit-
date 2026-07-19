import type { MusicObservation, MusicState } from './types';

export interface MusicTransition {
  from: MusicState;
  to: MusicState;
  changed: boolean;
}
export function resolveMusicState(observation: MusicObservation): MusicState {
  if (observation.dead) return 'death';
  if (observation.boss) return 'boss';
  if (observation.combat) return 'combat';
  if (observation.onBoat) return 'sailing';
  if (observation.onFoot && !observation.loading) return 'island';
  return 'silence';
}

export class MusicStateMachine {
  private currentState: MusicState = 'silence';

  get state(): MusicState {
    return this.currentState;
  }

  transition(observation: MusicObservation): MusicTransition {
    const next = resolveMusicState(observation);
    const transition = { from: this.currentState, to: next, changed: next !== this.currentState };
    this.currentState = next;
    return transition;
  }
}
