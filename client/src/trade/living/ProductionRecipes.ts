import type { EconomyCellId, LivingCommodityId } from './types';

export type LivingBadge =
  | 'raw'
  | 'processed'
  | 'food'
  | 'tool'
  | 'ship-supply'
  | 'luxury'
  | 'perishable';

/** รูปแบบการลดสต็อก — ป้องกันประชากรกินวัตถุดิบโรงงานทุกชนิดทุก tick */
export type ConsumptionModel =
  | 'food'
  | 'household'
  | 'industrial'
  | 'luxury'
  | 'event'
  | 'trade-good';

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
  {
    label: string;
    badge: LivingBadge;
    reserveStock?: number;
    consumptionModel: ConsumptionModel;
    /** สัดส่วน consumption เดิมที่หักเป็นกิจวัตร (0 = ใช้ผ่านสูตร/เหตุการณ์เท่านั้น) */
    routineUseMultiplier?: number;
  }
> = {
  'fresh-fish': { label: 'ปลาสด', badge: 'perishable', consumptionModel: 'food' },
  'dried-fish': { label: 'ปลาแห้ง', badge: 'food', consumptionModel: 'food' },
  hardwood: {
    label: 'ไม้เนื้อแข็ง', badge: 'raw', reserveStock: 10,
    consumptionModel: 'household', routineUseMultiplier: 1,
  },
  'iron-ore': {
    label: 'แร่เหล็ก', badge: 'raw', reserveStock: 8,
    consumptionModel: 'industrial', routineUseMultiplier: 0,
  },
  'iron-ingot': {
    label: 'แท่งเหล็ก', badge: 'processed',
    consumptionModel: 'household', routineUseMultiplier: 1,
  },
  tools: {
    label: 'เครื่องมือช่าง', badge: 'tool',
    // เครื่องมือเสื่อมช้า ไม่ควรถูกประชากรกินหมดเหมือนของใช้รายวัน
    consumptionModel: 'household', routineUseMultiplier: 0.05,
  },
  'sun-silk': {
    label: 'ผ้าไหม', badge: 'raw', reserveStock: 6,
    consumptionModel: 'industrial', routineUseMultiplier: 0,
  },
  rope: {
    label: 'เชือกเดินเรือ', badge: 'ship-supply',
    consumptionModel: 'industrial', routineUseMultiplier: 0,
  },
  'luxury-cloth': {
    label: 'ผ้าหรู', badge: 'luxury',
    consumptionModel: 'luxury', routineUseMultiplier: 0.2,
  },
  'healing-herb': {
    label: 'สมุนไพร', badge: 'raw', reserveStock: 5,
    consumptionModel: 'industrial', routineUseMultiplier: 0,
  },
  'herbal-medicine': {
    label: 'ยาสมุนไพร', badge: 'processed',
    consumptionModel: 'household', routineUseMultiplier: 0.35,
  },
  sailcloth: {
    label: 'ชิ้นส่วนเรือ', badge: 'ship-supply',
    consumptionModel: 'event', routineUseMultiplier: 0,
  },
  'repair-kit': {
    label: 'ชุดซ่อมเรือ', badge: 'ship-supply',
    consumptionModel: 'event', routineUseMultiplier: 0,
  },
  'trade-crate': {
    label: 'หีบสินค้า', badge: 'ship-supply',
    consumptionModel: 'event', routineUseMultiplier: 0,
  },
  'frost-crystal': {
    label: 'ผลึกเหมันต์', badge: 'raw', reserveStock: 8,
    consumptionModel: 'trade-good', routineUseMultiplier: 0.3,
  },
  'storm-core': {
    label: 'แกนพายุ', badge: 'raw', reserveStock: 6,
    consumptionModel: 'trade-good', routineUseMultiplier: 0.3,
  },
  'volcanic-ore': {
    label: 'แร่อัคคี', badge: 'raw', reserveStock: 8,
    consumptionModel: 'trade-good', routineUseMultiplier: 0.3,
  },
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
