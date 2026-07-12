import { describe, expect, it } from 'vitest';
import {
  getMaxEnergy,
  getMaxHp,
  getStatDamageMultiplier,
  spendStatPoint,
} from '../StatSystem';
import { createDefaultProgressionState } from '../ProgressionSave';
import type { PlayerStatId } from '../ProgressionTypes';

describe('StatSystem', () => {
  it('does not count the initial stat point above base HP/Energy', () => {
    const stats = createDefaultProgressionState().player.stats;
    expect(getMaxHp(stats)).toBe(100);
    expect(getMaxEnergy(stats)).toBe(100);
    stats.vitality = 10;
    stats.combat = 10;
    expect(getMaxHp(stats)).toBe(172);
    expect(getMaxEnergy(stats)).toBe(136);
  });

  it('maps damage scaling to the correct equipment category', () => {
    const stats = createDefaultProgressionState().player.stats;
    stats.blade = 50;
    expect(getStatDamageMultiplier(stats, 'sword')).toBeCloseTo(1.588);
    expect(getStatDamageMultiplier(stats, 'style')).toBe(1);
    expect(getStatDamageMultiplier(stats, 'utility')).toBe(1);
  });

  it('spends only valid whole positive amounts within balance caps', () => {
    const player = createDefaultProgressionState().player;
    player.statPoints = 5;
    expect(spendStatPoint(player, 'vitality', 2)).toBe(true);
    expect(player.stats.vitality).toBe(3);
    expect(player.statPoints).toBe(3);
    expect(spendStatPoint(player, 'vitality', -1)).toBe(false);
    expect(spendStatPoint(player, 'vitality', Number.POSITIVE_INFINITY)).toBe(false);
    expect(spendStatPoint(player, 'invalid' as PlayerStatId)).toBe(false);
  });
});
