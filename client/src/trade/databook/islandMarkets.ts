import type { IslandMarketDefinition } from '../types';

/**
 * ตลาดต่อเกาะ — แต่ละเกาะมีสินค้าส่งออก (export) ถูก
 * และสินค้านำเข้า (import) แพงเมื่อซื้อ แต่ขายได้ราคาดี
 */
export const ISLAND_MARKETS: readonly IslandMarketDefinition[] = [
  {
    id: 'starter-market',
    islandId: 'starter-island',
    name: 'Starter Village Market',
    nameTh: 'ตลาดหมู่บ้านโจรสลัด',
    harborDockId: 'starter-harbor',
    entries: [
      { commodityId: 'fresh-fish', role: 'export', buyMultiplier: 0.7, sellMultiplier: 0.5, stockLimit: -1 },
      { commodityId: 'hardwood', role: 'export', buyMultiplier: 0.75, sellMultiplier: 0.55, stockLimit: -1 },
      { commodityId: 'iron-ore', role: 'import', buyMultiplier: 1.35, sellMultiplier: 0.85, stockLimit: 30 },
      { commodityId: 'sun-silk', role: 'import', buyMultiplier: 1.5, sellMultiplier: 0.9, stockLimit: 15 },
      { commodityId: 'sailcloth', role: 'neutral', buyMultiplier: 1.0, sellMultiplier: 0.65, stockLimit: 50 },
      { commodityId: 'jungle-herb', role: 'import', buyMultiplier: 1.4, sellMultiplier: 0.9, stockLimit: 20 },
      { commodityId: 'mist-spice', role: 'import', buyMultiplier: 1.5, sellMultiplier: 0.95, stockLimit: 15 },
      { commodityId: 'desert-gem', role: 'import', buyMultiplier: 1.8, sellMultiplier: 1.1, stockLimit: 5 },
      { commodityId: 'cactus-water', role: 'import', buyMultiplier: 1.3, sellMultiplier: 0.85, stockLimit: 25 },
    ],
  },
  {
    id: 'mist-jungle-market',
    islandId: 'mist-jungle',
    name: 'Expedition Camp Exchange',
    nameTh: 'ตลาดค่ายนักสำรวจ',
    harborDockId: 'mist-jungle-harbor',
    entries: [
      { commodityId: 'iron-ore', role: 'export', buyMultiplier: 0.68, sellMultiplier: 0.48, stockLimit: -1 },
      { commodityId: 'jungle-herb', role: 'export', buyMultiplier: 0.65, sellMultiplier: 0.45, stockLimit: -1 },
      { commodityId: 'ancient-relic', role: 'export', buyMultiplier: 0.8, sellMultiplier: 0.6, stockLimit: 8 },
      { commodityId: 'mist-spice', role: 'export', buyMultiplier: 0.7, sellMultiplier: 0.5, stockLimit: -1 },
      { commodityId: 'fresh-fish', role: 'import', buyMultiplier: 1.35, sellMultiplier: 0.85, stockLimit: 30 },
      { commodityId: 'hardwood', role: 'import', buyMultiplier: 1.25, sellMultiplier: 0.8, stockLimit: 40 },
      { commodityId: 'sailcloth', role: 'import', buyMultiplier: 1.2, sellMultiplier: 0.75, stockLimit: 25 },
      { commodityId: 'desert-salt', role: 'import', buyMultiplier: 1.3, sellMultiplier: 0.9, stockLimit: 20 },
      { commodityId: 'sun-silk', role: 'import', buyMultiplier: 1.45, sellMultiplier: 0.95, stockLimit: 12 },
    ],
  },
  {
    id: 'sunscar-desert-market',
    islandId: 'sunscar-desert',
    name: 'Caravan City Bazaar',
    nameTh: 'ตลาดนครคาราวาน',
    harborDockId: 'sunscar-desert-harbor',
    entries: [
      { commodityId: 'sun-silk', role: 'export', buyMultiplier: 0.75, sellMultiplier: 0.55, stockLimit: -1 },
      { commodityId: 'desert-salt', role: 'export', buyMultiplier: 0.7, sellMultiplier: 0.5, stockLimit: -1 },
      { commodityId: 'iron-ore', role: 'import', buyMultiplier: 1.3, sellMultiplier: 0.88, stockLimit: 35 },
      { commodityId: 'desert-gem', role: 'export', buyMultiplier: 0.85, sellMultiplier: 0.65, stockLimit: 6 },
      { commodityId: 'cactus-water', role: 'export', buyMultiplier: 0.8, sellMultiplier: 0.6, stockLimit: -1 },
      { commodityId: 'fresh-fish', role: 'import', buyMultiplier: 1.4, sellMultiplier: 0.9, stockLimit: 25 },
      { commodityId: 'hardwood', role: 'import', buyMultiplier: 1.35, sellMultiplier: 0.85, stockLimit: 35 },
      { commodityId: 'jungle-herb', role: 'import', buyMultiplier: 1.5, sellMultiplier: 1.0, stockLimit: 15 },
      { commodityId: 'ancient-relic', role: 'import', buyMultiplier: 1.7, sellMultiplier: 1.15, stockLimit: 4 },
      { commodityId: 'mist-spice', role: 'import', buyMultiplier: 1.4, sellMultiplier: 0.95, stockLimit: 18 },
    ],
  },
] as const;
