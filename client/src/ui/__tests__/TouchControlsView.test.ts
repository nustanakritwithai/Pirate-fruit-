import { describe, expect, it } from 'vitest';
import { formatCooldownText } from '../TouchControls';

describe('desktop combat HUD cooldown text', () => {
  it('shows tenths of a second for active skill cooldowns', () => {
    expect(formatCooldownText(3.24)).toBe('3.2s');
    expect(formatCooldownText(0.04)).toBe('0.1s');
  });

  it('uses whole seconds for long cooldowns', () => {
    expect(formatCooldownText(12.1)).toBe('13s');
  });

  it('hides the label when the skill is ready', () => {
    expect(formatCooldownText(0)).toBe('');
    expect(formatCooldownText(undefined)).toBe('');
    expect(formatCooldownText(Number.NaN)).toBe('');
  });
});
