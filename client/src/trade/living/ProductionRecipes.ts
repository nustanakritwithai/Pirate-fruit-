import type { EconomyCellId, LivingCommodityId } from './types';

export type LivingBadge =
  | 'raw'
  | 'processed'
  | 'food'
  | 'tool'
  | 'ship-supply'
  | 'luxury'
  | 'perishable';

export interface ProductionRecipe {
  id: LivingCommodityId;
  outputAmount: number;
  inputs: Partial<Record<LivingCommodityId, number>>;
  productionTicks: number;
  /** ต่ำ = สำคัญกว่า */
  priority: number;
  cells: readonly EconomyCellId[];
}

/** สต็อกสำรอง — โรงงานจะไม่ใช้วัตถุดิบต่ำกว่านี้ */
export const COMMODITY_RESERVE: Partial<Record<LivingCommodityId, number>> = {
  'fresh-fish': 15,
  hardwood: 10,
  'iron-ore': 8,
  'sun-silk': 6,
  'healing-herb': 5,
};

export const LIVING_COMMODITY_META: Record<
  LivingCommodityId,
  { label: string; badge: LivingBadge; reserveStock?: number }
> = {
  'fresh-fish': { label: 'ปลาสด', badge: 'perishable' },
  'dried-fish': { label: 'ปลาแห้ง', badge: 'food' },
  hardwood: { label: 'ไม้เนื้อแข็ง', badge: 'raw', reserveStock: 10 },
  'iron-ore': { label: 'แร่เหล็ก', badge: 'raw', reserveStock: 8 },
  'iron-ingot': { label: 'แท่งเหล็ก', badge: 'processed' },
  tools: { label: 'เครื่องมือช่าง', badge: 'tool' },
  'sun-silk': { label: 'ผ้าไหม', badge: 'raw', reserveStock: 6 },
  rope: { label: 'เชือกเดินเรือ', badge: 'ship-supply' },
  'luxury-cloth': { label: 'ผ้าหรู', badge: 'luxury' },
  'healing-herb': { label: 'สมุนไพร', badge: 'raw', reserveStock: 5 },
  'herbal-medicine': { label: 'ยาสมุนไพร', badge: 'processed' },
  sailcloth: { label: 'ชิ้นส่วนเรือ', badge: 'ship-supply' },
  'repair-kit': { label: 'ชุดซ่อมเรือ', badge: 'ship-supply' },
  'trade-crate': { label: 'หีบสินค้า', badge: 'ship-supply' },
};

export const PRODUCTION_RECIPES: readonly ProductionRecipe[] = [
  {
    id: 'dried-fish',
    inputs: { 'fresh-fish': 3 },
    outputAmount: 2,
    productionTicks: 2,
    priority: 10,
    cells: ['leaf-island'],
  },
  {
    id: 'herbal-medicine',
    inputs: { 'healing-herb': 3 },
    outputAmount: 2,
    productionTicks: 3,
    priority: 11,
    cells: ['mine-island'],
  },
  {
    id: 'iron-ingot',
    inputs: { 'iron-ore': 3 },
    outputAmount: 2,
    productionTicks: 2,
    priority: 20,
    cells: ['mine-island'],
  },
  {
    id: 'tools',
    inputs: { 'iron-ingot': 2, hardwood: 1 },
    outputAmount: 1,
    productionTicks: 3,
    priority: 25,
    cells: ['mine-island', 'shipyard-island'],
  },
  {
    id: 'rope',
    inputs: { 'sun-silk': 2 },
    outputAmount: 2,
    productionTicks: 2,
    priority: 30,
    cells: ['cloth-island'],
  },
  {
    id: 'repair-kit',
    inputs: { hardwood: 2, 'iron-ingot': 1, rope: 1 },
    outputAmount: 1,
    productionTicks: 3,
    priority: 35,
    cells: ['shipyard-island'],
  },
  {
    id: 'trade-crate',
    inputs: { hardwood: 2, rope: 1 },
    outputAmount: 1,
    productionTicks: 2,
    priority: 40,
    cells: ['leaf-island', 'shipyard-island'],
  },
  {
    id: 'sailcloth',
    inputs: { hardwood: 4, 'iron-ingot': 2, rope: 2 },
    outputAmount: 1,
    productionTicks: 4,
    priority: 50,
    cells: ['shipyard-island'],
  },
  {
    id: 'luxury-cloth',
    inputs: { 'sun-silk': 4 },
    outputAmount: 1,
    productionTicks: 4,
    priority: 90,
    cells: ['cloth-island'],
  },
] as const;

export function recipesForCell(cellId: EconomyCellId): ProductionRecipe[] {
  return [...PRODUCTION_RECIPES]
    .filter((r) => r.cells.includes(cellId))
    .sort((a, b) => a.priority - b.priority);
}

export function recipeForOutput(id: LivingCommodityId): ProductionRecipe | undefined {
  return PRODUCTION_RECIPES.find((r) => r.id === id);
}

export function inputLabel(id: LivingCommodityId, amount: number): string {
  return `${LIVING_COMMODITY_META[id].label} ${amount}`;
}
