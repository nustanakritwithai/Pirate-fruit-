import type { BloxStatId, StatDefinition } from '../types';

const WIKI = 'https://blox-fruits.fandom.com/wiki/Stats';

/** สเตตัส 5 แบบ — ข้อมูลจาก Blox Fruits Wiki */
export const STAT_DEFINITIONS: readonly StatDefinition[] = [
  {
    id: 'melee',
    name: 'Melee',
    nameTh: 'มือเปล่า',
    wikiUrl: WIKI,
    internalId: 'combat',
    description:
      'เพิ่มดาเมจ Fighting Styles (+0.5 ต่อแต้ม) และ Energy (+5 ต่อแต้ม) — แนะนำให้ max เกือบทุกบิลด์',
    effects: [
      { kind: 'damage', perPoint: 0.5, appliesTo: ['fighting-style'] },
      { kind: 'energy', perPoint: 5 },
    ],
  },
  {
    id: 'defense',
    name: 'Defense',
    nameTh: 'พลังป้องกัน',
    wikiUrl: WIKI,
    internalId: 'vitality',
    description: 'เพิ่ม HP (+5 ต่อแต้ม) — แนะนำให้ max เป็นอันดับสองในบิลด์หลัก',
    effects: [{ kind: 'health', perPoint: 5 }],
  },
  {
    id: 'sword',
    name: 'Sword',
    nameTh: 'ดาบ',
    wikiUrl: WIKI,
    internalId: 'blade',
    description: 'เพิ่มดาเมจดาบ (+0.5 ต่อแต้ม, สเกลแบบ 2.795% ต่อแต้มสำหรับตัวคูณรวม)',
    effects: [{ kind: 'damage', perPoint: 0.5, appliesTo: ['sword'] }],
  },
  {
    id: 'gun',
    name: 'Gun',
    nameTh: 'ปืน',
    wikiUrl: WIKI,
    internalId: 'ranged',
    description: 'เพิ่มดาเมจปืน (+0.5 ต่อแต้ม, สเกลแบบ 2.795% ต่อแต้มสำหรับตัวคูณรวม)',
    effects: [{ kind: 'damage', perPoint: 0.5, appliesTo: ['gun'] }],
  },
  {
    id: 'fruit',
    name: 'Blox Fruit',
    nameTh: 'ผลไม้ปีศาจ',
    wikiUrl: WIKI,
    internalId: 'fruitPower',
    description: 'เพิ่มดาเมจผลไม้ (+0.5 ต่อแต้ม, สเกลแบบ 2.795% ต่อแต้มสำหรับตัวคูณรวม)',
    effects: [{ kind: 'damage', perPoint: 0.5, appliesTo: ['fruit'] }],
  },
  {
    id: 'mana',
    name: 'Mana',
    nameTh: 'พลังเวท',
    wikiUrl: WIKI,
    internalId: 'mana',
    description: 'เพิ่ม MP (+5 ต่อแต้ม) — พลังเวทที่ใช้ร่ายสกิลทุกชนิด',
    effects: [{ kind: 'mana', perPoint: 5 }],
  },
] as const;

export const STAT_BY_ID: Readonly<Record<BloxStatId, StatDefinition>> = Object.fromEntries(
  STAT_DEFINITIONS.map((s) => [s.id, s]),
) as Record<BloxStatId, StatDefinition>;

export const INTERNAL_TO_BLOX: Record<string, BloxStatId> = {
  combat: 'melee',
  vitality: 'defense',
  blade: 'sword',
  ranged: 'gun',
  fruitPower: 'fruit',
  mana: 'mana',
};

export const BLOX_TO_INTERNAL: Record<BloxStatId, string> = {
  melee: 'combat',
  defense: 'vitality',
  sword: 'blade',
  gun: 'ranged',
  fruit: 'fruitPower',
  mana: 'mana',
};
