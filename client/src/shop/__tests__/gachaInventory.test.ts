import { describe, expect, it } from 'vitest';
import { drawGacha, GACHA_POOL, RARITY_WEIGHT, STARTER_STYLE_ID, type GachaEntry } from '../GachaData';
import { ItemInventory } from '../ItemInventory';
import { POTIONS } from '../PotionData';
import type { EconomyWallet } from '../../progression/ProgressionTypes';
import type { RemoteShopExecutor } from '../RemoteShopClient';

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

  it('applies only the authoritative draw and exact coin balance from Server', async () => {
    const wallet = makeWallet(9_999);
    const inv = new ItemInventory(wallet);
    const remote: RemoteShopExecutor = {
      purchase: async () => ({
        ok: true,
        schemaVersion: 1,
        action: 'draw',
        coins: 350,
        item: { kind: 'sword', id: 'bisento', rarity: 'legendary' },
        quantity: 1,
        isNew: true,
        idempotentReplay: false,
      }),
    };
    inv.setRemoteExecutor(remote);

    const result = await inv.drawAsync();

    expect(result?.entry.id).toBe('bisento');
    expect(inv.ownedOf('sword')).toContain('bisento');
    expect(wallet.coins).toBe(350);
  });
});

describe('ItemInventory potions + quickslots', () => {
  it('buys a potion: spends coins and increments count', () => {
    const wallet = makeWallet(1000);
    const inv = new ItemInventory(wallet);
    expect(inv.getConsumableCount('potion-hp')).toBe(0);
    expect(inv.buyPotion('potion-hp')).toBe(true);
    expect(inv.getConsumableCount('potion-hp')).toBe(1);
    expect(wallet.spent).toBe(POTIONS['potion-hp'].price);
    inv.buyPotion('potion-hp');
    expect(inv.getConsumableCount('potion-hp')).toBe(2);
  });

  it('refuses to buy without enough coins', () => {
    const wallet = makeWallet(10);
    const inv = new ItemInventory(wallet);
    expect(inv.buyPotion('potion-hp')).toBe(false);
    expect(inv.getConsumableCount('potion-hp')).toBe(0);
  });

  it('uses a consumable: decrements, fails when empty', () => {
    const inv = new ItemInventory(makeWallet(1000));
    inv.buyPotion('potion-mp');
    expect(inv.useConsumable('potion-mp')).toBe(true);
    expect(inv.getConsumableCount('potion-mp')).toBe(0);
    expect(inv.useConsumable('potion-mp')).toBe(false);
  });

  it('assigns and reads quickslots (ignores out-of-range / invalid id)', () => {
    const inv = new ItemInventory(makeWallet());
    inv.buyPotion('potion-hp');
    inv.buyPotion('potion-mp');
    inv.assignQuickslot(0, 'potion-hp');
    inv.assignQuickslot(1, 'potion-mp');
    expect(inv.getQuickslot(0)).toBe('potion-hp');
    expect(inv.getQuickslot(1)).toBe('potion-mp');
    inv.assignQuickslot(0, null);
    expect(inv.getQuickslot(0)).toBeNull();
    inv.assignQuickslot(5, 'potion-hp'); // นอกช่วง → ไม่ทำอะไร
    inv.assignQuickslot(0, 'not-a-potion'); // id ไม่มีจริง → ไม่ทำอะไร
    expect(inv.getQuickslot(0)).toBeNull();
  });

  it('listConsumables returns only owned potions with count > 0', () => {
    const inv = new ItemInventory(makeWallet(1000));
    expect(inv.listConsumables()).toEqual([]);
    inv.buyPotion('potion-hp');
    inv.buyPotion('potion-hp');
    expect(inv.listConsumables()).toEqual([{ id: 'potion-hp', count: 2 }]);
  });

  it('uses the authoritative potion quantity and coin balance from Server', async () => {
    const wallet = makeWallet(1_000);
    const inv = new ItemInventory(wallet);
    inv.setRemoteExecutor({
      purchase: async () => ({
        ok: true,
        schemaVersion: 1,
        action: 'potion',
        coins: 40,
        item: { kind: 'consumable', id: 'potion-hp', rarity: 'common' },
        quantity: 2,
        isNew: false,
        idempotentReplay: true,
      }),
    });

    expect(await inv.buyPotionAsync('potion-hp')).toBe(true);
    expect(inv.getConsumableCount('potion-hp')).toBe(2);
    expect(wallet.coins).toBe(40);
  });
});
