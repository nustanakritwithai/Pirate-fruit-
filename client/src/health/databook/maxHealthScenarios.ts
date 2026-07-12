import type { MaxHealthScenario } from '../types';

/**
 * สถานการณ์ HP สูงสุดจาก Health wiki trivia
 * สูตรฐาน: (MaxLevel × 5) + 95 = 14,095 ที่ Defense 2800
 */
export const MAX_HEALTH_SCENARIOS: readonly MaxHealthScenario[] = [
  {
    id: 'base-max',
    name: 'Max Defense (no buffs)',
    nameTh: 'Defense สูงสุด (ไม่มีบัฟ)',
    defensePoints: 2800,
    bonusHp: 0,
    totalHp: 14_095,
    requirements: '2800 Defense stat points, no accessories or buffs',
    requirementsTh: '2800 แต้ม Defense ไม่มีอุปกรณ์หรือบัฟ',
  },
  {
    id: 'leviathan-shield',
    name: 'Leviathan Shield',
    nameTh: 'Leviathan Shield',
    defensePoints: 2800,
    bonusHp: 1000,
    totalHp: 15_095,
    requirements: '2800 Defense + Leviathan Shield accessory',
    requirementsTh: '2800 Defense + อุปกรณ์ Leviathan Shield',
  },
  {
    id: 'leviathan-shield-draco-v3',
    name: 'Leviathan Shield + Draco v3',
    nameTh: 'Leviathan Shield + Draco v3',
    defensePoints: 2800,
    bonusHp: 2667,
    totalHp: 16_762,
    requirements: '2800 Defense + Leviathan Shield + at least Draco v3',
    requirementsTh: '2800 Defense + Leviathan Shield + Draco v3 ขึ้นไป',
  },
  {
    id: 'leviathan-shield-shark-v4-armor',
    name: 'Leviathan Shield + Shark V4 Leviathan Armor',
    nameTh: 'Leviathan Shield + Shark V4 Leviathan Armor',
    defensePoints: 2800,
    bonusHp: 6638,
    totalHp: 20_733,
    requirements:
      '2800 Defense + Leviathan Shield + Shark V4 upgraded Leviathan Armor ability',
    requirementsTh:
      '2800 Defense + Leviathan Shield + Shark V4 Leviathan Armor (อัปเกรด)',
  },
] as const;
