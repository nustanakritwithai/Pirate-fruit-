import { describe, expect, it, vi } from 'vitest';
import { PlayerCombat } from '../../combat/PlayerCombat';

const fixture = () => Object.assign(Object.create(PlayerCombat.prototype), {
  controller: { applyProgressionCaps: vi.fn(), applyStun: vi.fn() },
  combatState: 'attack1', stateTimer: 1, swing: {}, pendingCast: null,
  activeChannel: {}, skillVisualDuration: 1, skillVisualElapsed: 0,
});
const snapshot = { hp: 90, maxHp: 100, energy: 100, maxEnergy: 100, mp: 100, maxMp: 100,
  guard: 100, guardBroken: false, serverTimeMs: 1000, hitstunUntil: 1350, dead: false };

describe('ท่าโจมตีตอบสนองต่อ hitstun จาก server เดิม', () => {
  it('updates HP immediately and interrupts attack/channel for the original remaining stun', () => {
    const combat = fixture();
    combat.applyServerVitals(snapshot);
    expect(combat.controller.hp).toBe(90);
    expect(combat.controller.applyStun).toHaveBeenCalledWith(.35);
    expect(combat.combatState).toBe('stunned');
    expect(combat.stateTimer).toBe(.35);
    expect(combat.swing).toBeNull();
    expect(combat.activeChannel).toBeNull();
  });
  it('does not shorten existing knockdown or restart expired hitstun', () => {
    const combat = fixture();
    combat.combatState = 'knockdown'; combat.stateTimer = 1.6;
    combat.applyServerVitals(snapshot);
    expect(combat.combatState).toBe('knockdown');
    expect(combat.stateTimer).toBe(1.6);
    combat.controller.applyStun.mockClear();
    combat.applyServerVitals({ ...snapshot, serverTimeMs: 1400 });
    expect(combat.controller.applyStun).not.toHaveBeenCalled();
  });
});
