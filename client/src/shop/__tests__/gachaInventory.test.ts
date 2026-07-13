import { describe, expect, it } from 'vitest';
import { drawGacha, GACHA_POOL, RARITY_WEIGHT, STARTER_STYLE_ID, type GachaEntry } from '../GachaData';
import { ItemInventory } from '../ItemInventory';
import type { EconomyWallet } from '../../progression/ProgressionTypes';

function makeWallet(start = 5000): EconomyWallet & { spent: number } {
  let coins = start;
  let spent = 0;
  return {
    get coins() {
      return coins;
    },
    get spent() {
      return spent;
    },
    spendCoins(amount: number) {
      if (coins < amount) return false;
      coins -= amount;
      spent += amount;
      return true;
    },
    addCoins(amount: number) {
      coins += amount;
    },
  };
}

describe('Gacha draw weighting (databook)', () => {
  const pool: GachaEntry[] = [
    { kind: 'sword', id: 'a', name: 'A', rarity: 'common' },
    { kind: 'fruit', id: 'b', name: 'B', rarity: 'mythical' },
  ];

  it('rng=0 returns the first entry', () => {
    expect(drawGacha(() => 0, pool).id).toBe('a');
  });

  it('rng near 1 returns the rarest (last) entry', () => {
    expect(drawGacha(() => 0.999, pool).id).toBe('b');
  });

  it('rarity weights are strictly ordered common → mythical', () => {
    expect(RARITY_WEIGHT.common).toBeGreaterThan(RARITY_WEIGHT.uncommon);
    expect(RARITY_WEIGHT.uncommon).toBeGreaterThan(RARITY_WEIGHT.rare);
    expect(RARITY_WEIGHT.rare).toBeGreaterThan(RARITY_WEIGHT.legendary);
    expect(RARITY_WEIGHT.legendary).toBeGreaterThan(RARITY_WEIGHT.mythical);
  });

  it('pool draws from all four item kinds and excludes the starter style', () => {
    const kinds = new Set(GACHA_POOL.map((e) => e.kind));
    expect(kinds.has('sword')).toBe(true);
    expect(kinds.has('gun')).toBe(true);
    expect(kinds.has('fighting-style')).toBe(true);
    expect(kinds.has('fruit')).toBe(true);
    expect(GACHA_POOL.some((e) => e.id === STARTER_STYLE_ID)).toBe(false);
  });
});

describe('ItemInventory ownership + equip + toggle', () => {
  it('starts with only the fist style equipped and no fruit', () => {
    const inv = new ItemInventory(makeWallet());
    expect(inv.ownedOf('fighting-style')).toEqual([STARTER_STYLE_ID]);
    expect(inv.ownedOf('fruit')).toEqual([]);
    expect(inv.loadout.equippedWeaponKind).toBe('fighting-style');
    expect(inv.loadout.snapshot.equippedFightingStyleId).toBe(STARTER_STYLE_ID);
    expect(inv.loadout.snapshot.equippedFruitId).toBeNull();
    expect(inv.loadout.activeSet).toBe('weapon');
  });

  it('spends coins on a draw and records the item as owned', () => {
    const wallet = makeWallet(5000);
    const inv = new ItemInventory(wallet);
    const result = inv.draw(() => 0);
    expect(result).not.toBeNull();
    expect(wallet.spent).toBe(inv.drawCost);
    expect(inv.ownedOf(result!.entry.kind)).toContain(result!.entry.id);
  });

  it('refuses to draw when coins are insufficient', () => {
    const wallet = makeWallet(10);
    const inv = new ItemInventory(wallet);
    expect(inv.draw(() => 0)).toBeNull();
    expect(wallet.spent).toBe(0);
  });

  it('equips a drawn sword and fruit and can toggle skill sets', () => {
    const inv = new ItemInventory(makeWallet(500000));
    for (let i = 0; i < 600 && (inv.ownedOf('sword').length < 1 || inv.ownedOf('fruit').length < 1); i++) {
      inv.draw(() => (i % 89) / 89);
    }
    const sword = inv.ownedOf('sword')[0];
    const fruit = inv.ownedOf('fruit')[0];
    expect(sword).toBeTruthy();
    expect(fruit).toBeTruthy();

    expect(inv.equip('sword', sword!)).toBe(true);
    expect(inv.loadout.equippedWeaponKind).toBe('sword');
    expect(inv.loadout.snapshot.equippedSwordId).toBe(sword);

    expect(inv.equip('fruit', fruit!)).toBe(true);
    expect(inv.loadout.snapshot.equippedFruitId).toBe(fruit);

    expect(inv.loadout.activeSet).toBe('weapon');
    expect(inv.loadout.toggle()).toBe('fruit');
    expect(inv.loadout.toggle()).toBe('weapon');
  });

  it('cannot equip an item that is not owned', () => {
    const inv = new ItemInventory(makeWallet());
    expect(inv.equip('fruit', 'flame')).toBe(false);
    expect(inv.loadout.snapshot.equippedFruitId).toBeNull();
  });
});
