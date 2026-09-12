import { describe, expect, it } from 'vitest';
import { shouldSkipCharacterGateForPocketMonsterParent } from '../CharacterGate';

describe('CharacterGate PocketMonster shell', () => {
  it('skips the Pirate name gate when already hosted by PocketMonster', () => {
    expect(shouldSkipCharacterGateForPocketMonsterParent(
      '?parentOrigin=https%3A%2F%2Fnustanakritwithai.github.io',
      'https://pirate-fruit-u555.onrender.com',
      true,
    )).toBe(true);
  });

  it('keeps the standalone Pirate landing when not embedded', () => {
    expect(shouldSkipCharacterGateForPocketMonsterParent(
      '?parentOrigin=https%3A%2F%2Fnustanakritwithai.github.io',
      'https://pirate-fruit-u555.onrender.com',
      false,
    )).toBe(false);
    expect(shouldSkipCharacterGateForPocketMonsterParent(
      '',
      'https://pirate-fruit-u555.onrender.com',
      true,
    )).toBe(false);
  });
});
