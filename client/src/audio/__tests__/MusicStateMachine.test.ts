import { describe, expect, it } from 'vitest';
import { MusicStateMachine, resolveMusicState } from '../MusicStateMachine';
import type { MusicObservation } from '../types';

const observation = (patch: Partial<MusicObservation> = {}): MusicObservation => ({
  dead: false,
  boss: false,
  combat: false,
  onBoat: false,
  onFoot: true,
  loading: false,
  ...patch,
});
describe('MusicStateMachine', () => {
  it('uses the required priority order', () => {
    expect(resolveMusicState(observation({ dead: true, boss: true, combat: true, onBoat: true }))).toBe('death');
    expect(resolveMusicState(observation({ boss: true, combat: true, onBoat: true }))).toBe('boss');
    expect(resolveMusicState(observation({ combat: true, onBoat: true }))).toBe('combat');
    expect(resolveMusicState(observation({ onBoat: true }))).toBe('sailing');
    expect(resolveMusicState(observation())).toBe('island');
    expect(resolveMusicState(observation({ loading: true }))).toBe('silence');
  });

  it('does not report a transition for repeated state updates', () => {
    const machine = new MusicStateMachine();
    expect(machine.transition(observation()).changed).toBe(true);
    expect(machine.transition(observation()).changed).toBe(false);
    expect(machine.state).toBe('island');
  });
});
