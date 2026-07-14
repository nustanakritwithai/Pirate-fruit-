import type { EconomyCellId, LivingCommodityId } from './types';
import { recipesForCell } from './ProductionRecipes';

export interface FactoryRecipeMeta {
  requiredWorkers: number;
  baseMaintenanceCost: number;
}

/** ข้อมูลโรงงานต่อสูตร — workers + maintenance */
export const FACTORY_RECIPE_META: Record<LivingCommodityId, FactoryRecipeMeta> = {
  'fresh-fish': { requiredWorkers: 0, baseMaintenanceCost: 0 },
  'dried-fish': { requiredWorkers: 3, baseMaintenanceCost: 4 },
  hardwood: { requiredWorkers: 0, baseMaintenanceCost: 0 },
  'iron-ore': { requiredWorkers: 0, baseMaintenanceCost: 0 },
  'iron-ingot': { requiredWorkers: 4, baseMaintenanceCost: 6 },
  tools: { requiredWorkers: 5, baseMaintenanceCost: 8 },
  'sun-silk': { requiredWorkers: 0, baseMaintenanceCost: 0 },
  rope: { requiredWorkers: 3, baseMaintenanceCost: 5 },
  'luxury-cloth': { requiredWorkers: 6, baseMaintenanceCost: 10 },
  'healing-herb': { requiredWorkers: 0, baseMaintenanceCost: 0 },
  'herbal-medicine': { requiredWorkers: 3, baseMaintenanceCost: 5 },
  sailcloth: { requiredWorkers: 8, baseMaintenanceCost: 12 },
  'repair-kit': { requiredWorkers: 5, baseMaintenanceCost: 7 },
  'trade-crate': { requiredWorkers: 2, baseMaintenanceCost: 3 },
};

export function recipeMeta(id: LivingCommodityId): FactoryRecipeMeta {
  return FACTORY_RECIPE_META[id] ?? { requiredWorkers: 3, baseMaintenanceCost: 5 };
}

/** สูตรทางเลือกบนเกาะเดียวกัน (ยกเว้นตัวเอง) */
export function alternativeRecipeIds(
  cellId: EconomyCellId,
  recipeId: LivingCommodityId,
): LivingCommodityId[] {
  return recipesForCell(cellId)
    .map((r) => r.id)
    .filter((id) => id !== recipeId);
}
