/**
 * Generator — สร้าง src/combat/skillGameplay/generated.ts จากตาราง Wiki ทั้ง 4 หมวด
 *
 * รัน: npm run gen:skills   (ใช้ vite-node ที่มากับ vitest)
 * - วนทุกสกิล (429 ท่า) → deriveSkillGameplay() → merge SKILL_OVERRIDES
 * - เขียนไฟล์ผลลัพธ์แบบ deterministic (รันซ้ำ diff ต้องว่าง)
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { FRUIT_SKILLS } from '../src/fruit/skills/databook/skills';
import { SWORD_SKILLS } from '../src/swords/skills/databook/skills';
import { GUN_SKILLS } from '../src/guns/skills/databook/skills';
import { FIGHTING_STYLE_SKILLS } from '../src/fighting-styles/skills/databook/skills';
import { DEVIL_FRUIT_BY_ID } from '../src/fruit/databook/fruits';
import { SWORD_BY_ID } from '../src/swords/databook/swords';
import { GUN_BY_ID } from '../src/guns/databook/guns';
import { FIGHTING_STYLE_BY_ID } from '../src/fighting-styles/databook/styles';
import type { FightingStyleSeaTier } from '../src/fighting-styles/types';

import {
  deriveSkillGameplay,
  type DeriveContext,
  type ItemRarity,
  type RawDatabookSkill,
} from '../src/combat/skillGameplay/derive';
import { SKILL_OVERRIDES } from '../src/combat/skillGameplay/overrides';
import type { SkillGameplay } from '../src/combat/skillGameplay/types';

// ---------- บริบทต่อไอเทม ----------

const STYLE_TIER_RARITY: Record<FightingStyleSeaTier, ItemRarity> = {
  starter: 'common',
  'first-sea': 'uncommon',
  'second-sea': 'rare',
  'third-sea': 'legendary',
};

function fruitContext(fruitId: string): DeriveContext {
  const fruit = DEVIL_FRUIT_BY_ID[fruitId];
  return {
    category: 'fruit',
    rarity: (fruit?.rarity ?? 'common') as ItemRarity,
    fruitType: fruit?.type,
  };
}

function swordContext(swordId: string): DeriveContext {
  return { category: 'sword', rarity: (SWORD_BY_ID[swordId]?.rarity ?? 'common') as ItemRarity };
}

function gunContext(gunId: string): DeriveContext {
  return { category: 'gun', rarity: (GUN_BY_ID[gunId]?.rarity ?? 'common') as ItemRarity };
}

function styleContext(styleId: string): DeriveContext {
  const tier = FIGHTING_STYLE_BY_ID[styleId]?.seaTier ?? 'starter';
  return { category: 'style', rarity: STYLE_TIER_RARITY[tier] };
}

// ---------- derive + merge override ----------

interface SourceEntry {
  raw: RawDatabookSkill;
  ctx: DeriveContext;
}

const sources: SourceEntry[] = [
  ...FRUIT_SKILLS.map((s) => ({ raw: s, ctx: fruitContext(s.fruitId) })),
  ...SWORD_SKILLS.map((s) => ({ raw: s, ctx: swordContext(s.swordId) })),
  ...GUN_SKILLS.map((s) => ({ raw: s, ctx: gunContext(s.gunId) })),
  ...FIGHTING_STYLE_SKILLS.map((s) => ({ raw: s, ctx: styleContext(s.styleId) })),
];

const records: SkillGameplay[] = sources.map(({ raw, ctx }) => {
  const derived = deriveSkillGameplay(raw, ctx);
  const override = SKILL_OVERRIDES[raw.id];
  if (!override) return derived;
  return { ...derived, ...override, id: raw.id, source: 'override' };
});

// กัน id ซ้ำ (ตารางต้นทางต้อง unique)
const seen = new Set<string>();
for (const record of records) {
  if (seen.has(record.id)) throw new Error(`duplicate skill id: ${record.id}`);
  seen.add(record.id);
}

// ---------- serialize แบบ deterministic ----------

function hex(n: number): string {
  return `0x${n.toString(16).padStart(6, '0')}`;
}

function num(n: number): string {
  // ตัดทศนิยมส่วนเกินให้คงที่ (กัน floating noise ระหว่างรัน)
  return String(Math.round(n * 100) / 100);
}

function serializeCc(cc: SkillGameplay['cc']): string {
  if (cc.length === 0) return '[]';
  return `[${cc
    .map((c) => `{ type: '${c.type}', power: ${num(c.power)}, duration: ${num(c.duration)} }`)
    .join(', ')}]`;
}

function serializeRecord(r: SkillGameplay): string {
  const fields = [
    `id: '${r.id}'`,
    `slot: '${r.slot}'`,
    `archetype: '${r.archetype}'`,
    `damage: ${num(r.damage)}`,
    `hitCount: ${r.hitCount}`,
    `range: ${num(r.range)}`,
    `radius: ${num(r.radius)}`,
    ...(r.projectileSpeed !== undefined ? [`projectileSpeed: ${num(r.projectileSpeed)}`] : []),
    `castTime: ${num(r.castTime)}`,
    `cc: ${serializeCc(r.cc)}`,
    ...(r.dot ? [`dot: { dps: ${num(r.dot.dps)}, duration: ${num(r.dot.duration)} }`] : []),
    `vfxColor: ${hex(r.vfxColor)}`,
    `cooldown: ${num(r.cooldown)}`,
    `energy: ${num(r.energy)}`,
    `source: '${r.source}'`,
  ];
  return `  '${r.id}': { ${fields.join(', ')} },`;
}

const body = records.map(serializeRecord).join('\n');

const output = `/**
 * AUTO-GENERATED โดย scripts/gen-skill-gameplay.ts — ห้ามแก้ไฟล์นี้ด้วยมือ
 * จูนท่าเด่นที่ overrides.ts / ปรับสูตรที่ derive.ts แล้วรัน \`npm run gen:skills\`
 *
 * ${records.length} สกิลจากตาราง Wiki (fruit ${FRUIT_SKILLS.length} · sword ${SWORD_SKILLS.length} · gun ${GUN_SKILLS.length} · style ${FIGHTING_STYLE_SKILLS.length})
 */

import type { SkillGameplay } from './types';

export const SKILL_GAMEPLAY: Record<string, SkillGameplay> = {
${body}
};
`;

const here = dirname(fileURLToPath(import.meta.url));
const target = resolve(here, '../src/combat/skillGameplay/generated.ts');
writeFileSync(target, output, 'utf8');
console.log(`เขียน ${records.length} สกิล → ${target}`);
