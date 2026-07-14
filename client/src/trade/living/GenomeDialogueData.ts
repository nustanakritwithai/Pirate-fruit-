import type { EconomicStage } from './EconomyGenomeTypes';
import type { LivingCommodityId } from './types';
import { LIVING_COMMODITY_META } from './ProductionRecipes';

export const GENOME_DIALOGUE_BY_COMMODITY: Partial<Record<LivingCommodityId, string>> = {
  hardwood: 'เมืองเราเริ่มพึ่งอุตสาหกรรมไม้มากขึ้นทุกวัน',
  'fresh-fish': 'ช่วงนี้เรือประมงออกทะเลกันมากกว่าสมัยก่อน',
  'dried-fish': 'การแปรรูปปลากำลังเป็นหัวใจของเกาะเรา',
  'iron-ore': 'เหมืองและโลหะกำลังขับเคลื่อนเศรษฐกิจเรา',
  rope: 'เส้นทางค้าเชือกกำลังเชื่อมเรากับโลกภายนอก',
  sailcloth: 'อู่เรือและผ้าใบกำลังขยายตัวอย่างต่อเนื่อง',
};

export const GENOME_DIALOGUE_BY_STAGE: Record<EconomicStage, string> = {
  primitive: 'เรายังพึ่งพาทรัพยากรธรรมชาติเป็นหลัก',
  specializing: 'เกาะเราเริ่มเชี่ยวชาญสินค้าบางอย่างมากขึ้น',
  industrial: 'โรงงานกำลังกลายเป็นหัวใจของเกาะนี้',
  advanced: 'เทคโนโลยีและการค้ากำลังผลักดันเมืองเราไปข้างหน้า',
};

export const GENOME_DIALOGUE_DECLINING = 'ช่วงนี้กิจการหลายแห่งดูไม่ค่อยมั่นคง';

export function getGenomeDialogue(
  dominantIndustry: LivingCommodityId | null,
  stage: EconomicStage,
  fitnessEma: number,
): string {
  if (fitnessEma < 0.35) return GENOME_DIALOGUE_DECLINING;
  if (dominantIndustry && GENOME_DIALOGUE_BY_COMMODITY[dominantIndustry]) {
    return GENOME_DIALOGUE_BY_COMMODITY[dominantIndustry]!;
  }
  return GENOME_DIALOGUE_BY_STAGE[stage];
}

export function dominantIndustryLabel(id: LivingCommodityId | null): string {
  if (!id) return 'ยังไม่ชัดเจน';
  return LIVING_COMMODITY_META[id].label;
}
