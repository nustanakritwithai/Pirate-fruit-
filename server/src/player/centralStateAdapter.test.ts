import { describe, expect, it, vi } from 'vitest';
import {
  applyCanonicalKills,
  createCanonicalKillRequest,
  deriveCanonicalCombatProfile,
  normalizeInitialPlayerState,
  applyCanonicalStateOperation,
} from './centralStateAdapter.js';
import type { MonsterRewardAuthority } from './centralStateAdapter.js';
import { defaultPlayerState, serializePlayerState } from './playerState.js';

describe('central state adapter', () => {
  it('ใช้แต้มเดิมและไม่รับเงินหรือ XP จาก operation', () => {
    const state = defaultPlayerState(); state.progression.statPoints = 3;
    const updated = applyCanonicalStateOperation(state, { type: 'statAllocation', allocations: { combat: 2 } });
    expect(updated.state.progression.stats.combat).toBe(state.progression.stats.combat + 2);
    expect(updated.state.progression.statPoints).toBe(1);
    expect(state.progression.statPoints).toBe(3);
    expect(() => applyCanonicalStateOperation(state, { type: 'statAllocation', allocations: { combat: 4 } })).toThrow();
    expect(() => applyCanonicalStateOperation(state, { type: 'statAllocation', allocations: { combat: 1 }, coins: 99 })).toThrow();
  });

  it('บันทึกตำแหน่งจาก server และไม่ฟื้นเลือดผ่าน checkpoint', () => {
    const state = defaultPlayerState(); state.checkpoint.hp = 1;
    const document = JSON.parse(serializePlayerState(state).player.checkpoint!); document.hp = 9999;
    const updated = applyCanonicalStateOperation(state, { type: 'checkpoint', checkpoint: JSON.stringify(document) },
      { islandId: 'starter-island', x: 10, y: 2, z: 11, heading: 0.5 });
    expect(updated.state.checkpoint.hp).toBe(1);
    expect(updated.state.checkpoint.position).toEqual({ x: 10, y: 2, z: 11 });
  });

  it('ใช้อุปกรณ์ที่มีจริงและเก็บ reward receipts หลังเปลี่ยนอุปกรณ์', () => {
    const state = Object.assign(defaultPlayerState(), { rewardReceipts: [{ key: 'existing' }] });
    const operation = { type: 'loadout', inventoryLoadout: state.inventory.loadout, loadout: state.loadout };
    expect(applyCanonicalStateOperation(state, operation).state).toMatchObject({ rewardReceipts: [{ key: 'existing' }] });
    expect(() => applyCanonicalStateOperation(state, { ...operation,
      inventoryLoadout: { ...state.inventory.loadout, equippedSwordId: 'unowned' } })).toThrow('equipped-item-not-owned');
  });
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
