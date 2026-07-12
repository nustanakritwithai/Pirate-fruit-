import type { MaxEnergyScenario } from '../types';

/**
 * สถานการณ์ Energy สูงสุดจาก Energy wiki trivia
 * สูตรฐาน: (MaxLevel × 5) + 95 = 14,095 ที่ Melee 2800
 */
export const MAX_ENERGY_SCENARIOS: readonly MaxEnergyScenario[] = [
  {
    id: 'base-max',
    name: 'Max Melee (no buffs)',
    nameTh: 'Melee สูงสุด (ไม่มีบัฟ)',
    meleePoints: 2800,
    bonusEnergy: 0,
    totalEnergy: 14_095,
    requirements: '2800 Melee stat points, no accessories or buffs',
    requirementsTh: '2800 แต้ม Melee ไม่มีอุปกรณ์หรือบัฟ',
  },
  {
    id: 'kitsune-ribbon',
    name: 'Kitsune Ribbon',
    nameTh: 'Kitsune Ribbon',
    meleePoints: 2800,
    bonusEnergy: 2500,
    totalEnergy: 16_595,
    requirements: '2800 Melee + Kitsune Ribbon accessory',
    requirementsTh: '2800 Melee + อุปกรณ์ Kitsune Ribbon',
  },
  {
    id: 'kitsune-ribbon-awakened-race',
    name: 'Kitsune Ribbon + Awakened Race',
    nameTh: 'Kitsune Ribbon + Race Awakening',
    meleePoints: 2800,
    bonusEnergy: 4085,
    totalEnergy: 18_180,
    requirements:
      '2800 Melee + Kitsune Ribbon + awakened race form',
    requirementsTh: '2800 Melee + Kitsune Ribbon + Race Awakening',
  },
] as const;
