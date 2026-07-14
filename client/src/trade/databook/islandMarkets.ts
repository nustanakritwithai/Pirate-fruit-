import type { IslandMarketDefinition } from '../types';

/**
 * ตลาด Living Trade — ราคาจาก Economic CA (ไม่ใช้ multiplier คงที่)
 * role ใช้แสดง UI เท่านั้น
 */
export const ISLAND_MARKETS: readonly IslandMarketDefinition[] = [
  {
    id: 'starter-market',
    islandId: 'starter-island',
    name: 'Leaf Island Market',
    nameTh: 'ตลาดเกาะใบไม้',
    harborDockId: 'starter-harbor',
    entries: [
      { commodityId: 'fresh-fish', role: 'export', buyMultiplier: 1, sellMultiplier: 1, stockLimit: -1 },
      { commodityId: 'hardwood', role: 'export', buyMultiplier: 1, sellMultiplier: 1, stockLimit: -1 },
      { commodityId: 'iron-ore', role: 'import', buyMultiplier: 1, sellMultiplier: 1, stockLimit: -1 },
      { commodityId: 'sun-silk', role: 'import', buyMultiplier: 1, sellMultiplier: 1, stockLimit: -1 },
    ],
  },
  {
    id: 'starter-shipyard-market',
    islandId: 'starter-island',
    name: 'Shipyard Exchange',
    nameTh: 'ตลาดอู่เรือ',
    harborDockId: 'starter-harbor',
    entries: [
      { commodityId: 'sailcloth', role: 'export', buyMultiplier: 1, sellMultiplier: 1, stockLimit: -1 },
      { commodityId: 'hardwood', role: 'import', buyMultiplier: 1, sellMultiplier: 1, stockLimit: -1 },
      { commodityId: 'iron-ore', role: 'import', buyMultiplier: 1, sellMultiplier: 1, stockLimit: -1 },
      { commodityId: 'sun-silk', role: 'import', buyMultiplier: 1, sellMultiplier: 1, stockLimit: -1 },
    ],
  },
  {
    id: 'mist-jungle-market',
    islandId: 'mist-jungle',
    name: 'Mine Island Exchange',
    nameTh: 'ตลาดเกาะเหมือง',
    harborDockId: 'mist-jungle-harbor',
    entries: [
      { commodityId: 'iron-ore', role: 'export', buyMultiplier: 1, sellMultiplier: 1, stockLimit: -1 },
      { commodityId: 'fresh-fish', role: 'import', buyMultiplier: 1, sellMultiplier: 1, stockLimit: -1 },
      { commodityId: 'hardwood', role: 'import', buyMultiplier: 1, sellMultiplier: 1, stockLimit: -1 },
      { commodityId: 'sun-silk', role: 'import', buyMultiplier: 1, sellMultiplier: 1, stockLimit: -1 },
    ],
  },
  {
    id: 'sunscar-desert-market',
    islandId: 'sunscar-desert',
    name: 'Cloth Island Bazaar',
    nameTh: 'ตลาดเกาะทอผ้า',
    harborDockId: 'sunscar-desert-harbor',
    entries: [
      { commodityId: 'sun-silk', role: 'export', buyMultiplier: 1, sellMultiplier: 1, stockLimit: -1 },
      { commodityId: 'fresh-fish', role: 'import', buyMultiplier: 1, sellMultiplier: 1, stockLimit: -1 },
      { commodityId: 'hardwood', role: 'import', buyMultiplier: 1, sellMultiplier: 1, stockLimit: -1 },
      { commodityId: 'iron-ore', role: 'import', buyMultiplier: 1, sellMultiplier: 1, stockLimit: -1 },
      { commodityId: 'sailcloth', role: 'import', buyMultiplier: 1, sellMultiplier: 1, stockLimit: -1 },
    ],
  },
] as const;
