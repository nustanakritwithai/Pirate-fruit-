import type { IslandMarketDefinition } from '../types';

/**
 * ตลาด Living Trade — ราคาจาก Economic CA (ไม่ใช้ multiplier คงที่)
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
      { commodityId: 'dried-fish', role: 'export', buyMultiplier: 1, sellMultiplier: 1, stockLimit: -1 },
      { commodityId: 'hardwood', role: 'export', buyMultiplier: 1, sellMultiplier: 1, stockLimit: -1 },
      { commodityId: 'trade-crate', role: 'export', buyMultiplier: 1, sellMultiplier: 1, stockLimit: -1 },
      { commodityId: 'iron-ingot', role: 'import', buyMultiplier: 1, sellMultiplier: 1, stockLimit: -1 },
      { commodityId: 'tools', role: 'import', buyMultiplier: 1, sellMultiplier: 1, stockLimit: -1 },
      { commodityId: 'sun-silk', role: 'import', buyMultiplier: 1, sellMultiplier: 1, stockLimit: -1 },
      { commodityId: 'rope', role: 'import', buyMultiplier: 1, sellMultiplier: 1, stockLimit: -1 },
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
      { commodityId: 'repair-kit', role: 'export', buyMultiplier: 1, sellMultiplier: 1, stockLimit: -1 },
      { commodityId: 'trade-crate', role: 'export', buyMultiplier: 1, sellMultiplier: 1, stockLimit: -1 },
      { commodityId: 'tools', role: 'neutral', buyMultiplier: 1, sellMultiplier: 1, stockLimit: -1 },
      { commodityId: 'hardwood', role: 'import', buyMultiplier: 1, sellMultiplier: 1, stockLimit: -1 },
      { commodityId: 'iron-ingot', role: 'import', buyMultiplier: 1, sellMultiplier: 1, stockLimit: -1 },
      { commodityId: 'rope', role: 'import', buyMultiplier: 1, sellMultiplier: 1, stockLimit: -1 },
      { commodityId: 'dried-fish', role: 'import', buyMultiplier: 1, sellMultiplier: 1, stockLimit: -1 },
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
      { commodityId: 'iron-ingot', role: 'export', buyMultiplier: 1, sellMultiplier: 1, stockLimit: -1 },
      { commodityId: 'healing-herb', role: 'export', buyMultiplier: 1, sellMultiplier: 1, stockLimit: -1 },
      { commodityId: 'herbal-medicine', role: 'export', buyMultiplier: 1, sellMultiplier: 1, stockLimit: -1 },
      { commodityId: 'tools', role: 'export', buyMultiplier: 1, sellMultiplier: 1, stockLimit: -1 },
      { commodityId: 'fresh-fish', role: 'import', buyMultiplier: 1, sellMultiplier: 1, stockLimit: -1 },
      { commodityId: 'dried-fish', role: 'import', buyMultiplier: 1, sellMultiplier: 1, stockLimit: -1 },
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
      { commodityId: 'rope', role: 'export', buyMultiplier: 1, sellMultiplier: 1, stockLimit: -1 },
      { commodityId: 'luxury-cloth', role: 'export', buyMultiplier: 1, sellMultiplier: 1, stockLimit: -1 },
      { commodityId: 'fresh-fish', role: 'import', buyMultiplier: 1, sellMultiplier: 1, stockLimit: -1 },
      { commodityId: 'dried-fish', role: 'import', buyMultiplier: 1, sellMultiplier: 1, stockLimit: -1 },
      { commodityId: 'hardwood', role: 'import', buyMultiplier: 1, sellMultiplier: 1, stockLimit: -1 },
      { commodityId: 'iron-ingot', role: 'import', buyMultiplier: 1, sellMultiplier: 1, stockLimit: -1 },
      { commodityId: 'tools', role: 'import', buyMultiplier: 1, sellMultiplier: 1, stockLimit: -1 },
      { commodityId: 'sailcloth', role: 'import', buyMultiplier: 1, sellMultiplier: 1, stockLimit: -1 },
      { commodityId: 'repair-kit', role: 'import', buyMultiplier: 1, sellMultiplier: 1, stockLimit: -1 },
    ],
  },
] as const;
