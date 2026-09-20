import { describe, expect, it, vi } from 'vitest';
import {
  applyCanonicalKills,
  createCanonicalKillRequest,
  deriveCanonicalCombatProfile,
  normalizeInitialPlayerState,
} from './centralStateAdapter.js';
import type { MonsterRewardAuthority } from './centralStateAdapter.js';
import { defaultPlayerState, serializePlayerState } from './playerState.js';

describe('central state adapter', () => {
  it('normalizes and serializes the same canonical state without resetting progress', () => {
    const source = serializePlayerState(defaultPlayerState());
    const normalized = normalizeInitialPlayerState(source.player, source.cargo);
    expect(normalized.persisted.player.progression).toBe(source.player.progression);
    expect(normalized.state.progression.level).toBe(1);
  });

  it('derives combat resources and categories from canonical state', () => {
    const state = defaultPlayerState();
    state.progression.level = 12;
    state.progression.stats.vitality = 20;
    state.inventory.loadout.equippedFruitId = 'flame';
    state.loadout.activeCategory = 'fruit';
    const profile = deriveCanonicalCombatProfile(state);
    expect(profile.level).toBe(12);
    expect(profile.activeSkillCategory).toBe('fruit');
    expect(profile.allowedSkillCategories).toEqual(['style', 'fruit']);
    expect(profile.maxHp).toBeGreaterThan(0);
  });

  it('delegates rewards using the original idempotent MonsterService request shape', async () => {
    const grantKills = vi.fn(async (_characterId: string, body: Parameters<MonsterRewardAuthority['grantKills']>[1]) => ({
      ok: true as const,
      schemaVersion: 1 as const,
      rewards: [{ monsterId: body.kills[0].monsterId, count: body.kills[0].count, playerExp: 10, coins: 2, masteryExp: 1 }],
      totals: { playerExp: 10, coins: 2, masteryExp: 1 },
      coinsTotal: 42,
      idempotentReplay: false,
    }));
    const request = createCanonicalKillRequest('central-kill:1', [{ monsterId: 'crab', count: 1 }]);
    expect(request.schemaVersion).toBeGreaterThan(0);
    const authority: MonsterRewardAuthority = { grantKills };
    await applyCanonicalKills(authority, 'character-1', 'central-kill:1', [{ monsterId: 'crab', count: 1 }]);
    expect(grantKills).toHaveBeenCalledWith('character-1', request);
  });
});
