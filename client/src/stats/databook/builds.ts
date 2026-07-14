import type { StatBuildPreset } from '../types';

const MAX = 2800;
const MIN = 1;

/** บิลด์สเตตัสแนะนำจาก Blox Fruits Wiki */
export const STAT_BUILD_PRESETS: readonly StatBuildPreset[] = [
  // --- Max Level ---
  {
    id: 'max-sword-main',
    name: 'Sword Main',
    nameTh: 'บิลด์ดาบหลัก',
    tier: 'max-level',
    description: 'Max Melee + Defense + Sword — เหมาะ PvP ดาบ, ใช้ผล Elemental เสริมความเร็ว',
    allocation: { melee: MAX, defense: MAX, sword: MAX, gun: MIN, fruit: MIN, mana: MIN },
    tags: ['pvp', 'sword', 'late-game'],
  },
  {
    id: 'max-gun-main',
    name: 'Gun Main',
    nameTh: 'บิลด์ปืนหลัก',
    tier: 'max-level',
    description: 'Max Melee + Defense + Gun — ต้องเล็งแม่น, แนะนำผลสตันเสริมคอมโบ',
    allocation: { melee: MAX, defense: MAX, sword: MIN, gun: MAX, fruit: MIN, mana: MIN },
    tags: ['pvp', 'gun', 'late-game'],
  },
  {
    id: 'max-fruit-main',
    name: 'Blox Fruit Main',
    nameTh: 'บิลด์ผลไม้หลัก',
    tier: 'max-level',
    description: 'Max Melee + Defense + Fruit — เหมาะ Raid/Grinding/PvP, AoE สูง',
    allocation: { melee: MAX, defense: MAX, sword: MIN, gun: MIN, fruit: MAX, mana: MIN },
    tags: ['pvp', 'grinding', 'raid', 'fruit', 'late-game'],
  },
  {
    id: 'max-hybrid-fruit-sword',
    name: 'Hybrid (Fruit + Sword)',
    nameTh: 'ไฮบริด (ผลไม้ + ดาบ)',
    tier: 'max-level',
    description: 'Defense max, Fruit 2000, Sword 2000, Melee 801 — ยืดหยุ่นแต่ดาเมจต่ำกว่า main',
    allocation: { melee: 801, defense: MAX, sword: 2000, gun: MIN, fruit: 2000, mana: MIN },
    tags: ['hybrid', 'versatile'],
  },
  {
    id: 'max-glass-cannon-fruit',
    name: 'Glass Cannon (Fruit)',
    nameTh: 'แก้วปืน (ผลไม้)',
    tier: 'max-level',
    description: 'Fruit + Melee max, Defense 1400 — ดาเมจสูงแต่ HP ต่ำ, เสี่ยงใน PvP',
    allocation: { melee: MAX, defense: 1400, sword: MIN, gun: MIN, fruit: MAX, mana: MIN },
    tags: ['glass-cannon', 'pvp', 'grinding'],
  },
  {
    id: 'max-dps-fruit',
    name: 'DPS (Fruit)',
    nameTh: 'DPS (ผลไม้)',
    tier: 'max-level',
    description: 'Fruit + Defense max, Melee 1400 — HP สูงแต่ Energy ต่ำ',
    allocation: { melee: 1400, defense: MAX, sword: MIN, gun: MIN, fruit: MAX, mana: MIN },
    tags: ['dps', 'grinding'],
  },
  // --- Level 1300 ---
  {
    id: 'lv1300-melee-main',
    name: 'Melee Main',
    nameTh: 'บิลด์มือเปล่าหลัก',
    tier: 'level-1300',
    description: 'Melee 2600 + Defense 1300 — เริ่มต้น/กลางเกม, ฟาร์มเร็ว',
    allocation: { melee: 2600, defense: 1300, sword: MIN, gun: MIN, fruit: MIN, mana: MIN },
    tags: ['early-game', 'fighting-style', 'grinding'],
  },
  {
    id: 'lv1300-sword-main',
    name: 'Sword Main',
    nameTh: 'บิลด์ดาบหลัก',
    tier: 'level-1300',
    description: 'Sword 2250 + Defense 1300 + Melee 350',
    allocation: { melee: 350, defense: 1300, sword: 2250, gun: MIN, fruit: MIN, mana: MIN },
    tags: ['sword', 'mid-game'],
  },
  {
    id: 'lv1300-gun-main',
    name: 'Gun Main',
    nameTh: 'บิลด์ปืนหลัก',
    tier: 'level-1300',
    description: 'Gun 2250 + Defense 1300 + Melee 350',
    allocation: { melee: 350, defense: 1300, sword: MIN, gun: 2250, fruit: MIN, mana: MIN },
    tags: ['gun', 'mid-game'],
  },
  {
    id: 'lv1300-fruit-main',
    name: 'Blox Fruit Main',
    nameTh: 'บิลด์ผลไม้หลัก',
    tier: 'level-1300',
    description: 'Fruit 2350 + Defense 1300 + Melee 350',
    allocation: { melee: 350, defense: 1300, sword: MIN, gun: MIN, fruit: 2350, mana: MIN },
    tags: ['fruit', 'mid-game', 'grinding'],
  },
  {
    id: 'lv1300-hybrid-even',
    name: 'Hybrid (Even)',
    nameTh: 'ไฮบริด (เท่ากันทุกสเตตัส)',
    tier: 'level-1300',
    description: 'ทุกสเตตัส 780 — ยืดหยุ่นแต่ไม่ max อะไรเลย',
    allocation: { melee: 780, defense: 780, sword: 780, gun: 780, fruit: 780, mana: MIN },
    tags: ['hybrid', 'versatile'],
  },
  {
    id: 'lv1300-three-even',
    name: '3 Even Stats',
    nameTh: '3 สเตตัสเท่ากัน',
    tier: 'level-1300',
    description: 'Melee + Defense + main damage 1300 — สมดุลสามด้าน',
    allocation: { melee: 1300, defense: 1300, sword: 1300, gun: MIN, fruit: MIN, mana: MIN },
    tags: ['balanced'],
  },
] as const;

export const BUILD_BY_ID: Readonly<Record<string, StatBuildPreset>> = Object.fromEntries(
  STAT_BUILD_PRESETS.map((b) => [b.id, b]),
);
