/**
 * Phase 7 — ตัวแปลงสกิลจาก databook (Blox Fruits Wiki) → สกิลที่ยิงได้จริงในเกม
 *
 * databook เก็บ name/key/mastery/cooldown/energy/description แต่ไม่มีค่าดาเมจ/ระยะ/ชนิดการยิง
 * ไฟล์นี้เติมค่าที่ใช้ต่อสู้ได้ (renderType/damage/range/radius) แบบ heuristic —
 * ปรับจูนได้ง่ายที่เดียว ไม่ต้องแก้ core combat
 */

import { LOADOUT_ITEMS, type ComboHit, type LoadoutCategory } from './CombatData';
import type { SkillSlotIndex, WeaponKind } from './types';
import { getSkillGameplay, type SkillArchetype, type SkillGameplay } from './skillGameplay';

/** สกิลดิบจาก databook (รูปแบบร่วมของทุกหมวด) */
export interface RawSkill {
  id: string;
  name: string;
  mastery: number | null;
  cooldown: number | null;
  energy: number | null;
  description: string;
}

export type SkillRenderType = 'projectile' | 'aoe' | 'dash';

/** สกิลที่พร้อมยิงในเกม */
export interface CastableSkill {
  id: string;
  name: string;
  icon: string;
  cooldown: number;
  energyCost: number;
  castTime: number;
  damage: number;
  range: number;
  radius: number;
  renderType: SkillRenderType;
  isUltimate: boolean;
  category: LoadoutCategory;
  color: number;
}

/** โปรไฟล์ M1 (คอมโบโจมตีปกติ) ต่อชนิดอาวุธที่ถือ */
export interface M1Profile {
  damage: number;
  range: number;
  arcDeg: number;
  color: number;
  combo: ComboHit[];
  icon: string;
}

const FIST_ITEM = LOADOUT_ITEMS['basic-brawl'];
const SWORD_ITEM = LOADOUT_ITEMS['training-sword'];

/** คอมโบ M1 ต่อชนิดอาวุธ (ใช้ combo ที่มีอยู่ของ CombatData + โปรไฟล์ปืน) */
export const WEAPON_M1: Record<WeaponKind, M1Profile> = {
  'fighting-style': {
    damage: FIST_ITEM.damage,
    range: FIST_ITEM.range,
    arcDeg: FIST_ITEM.arcDeg,
    color: FIST_ITEM.color,
    combo: FIST_ITEM.combo,
    icon: '👊',
  },
  sword: {
    damage: SWORD_ITEM.damage,
    range: SWORD_ITEM.range,
    arcDeg: SWORD_ITEM.arcDeg,
    color: SWORD_ITEM.color,
    combo: SWORD_ITEM.combo,
    icon: '🗡️',
  },
  gun: {
    damage: 26,
    range: 5.5,
    arcDeg: 70,
    color: 0xd9c27a,
    icon: '🔫',
    combo: [
      { multiplier: 1.0, windup: 0.1, recovery: 0.34, movementLock: 0.6, knockback: 1 },
      { multiplier: 1.1, windup: 0.1, recovery: 0.36, movementLock: 0.6, knockback: 1 },
      { multiplier: 1.6, windup: 0.14, recovery: 0.5, movementLock: 0.4, knockback: 4 },
    ],
  },
};

export function weaponKindToCategory(kind: WeaponKind): LoadoutCategory {
  return kind === 'fighting-style' ? 'style' : kind;
}

const CATEGORY_COLOR: Record<LoadoutCategory, number> = {
  style: 0xffcf8e,
  sword: 0x9fdcff,
  gun: 0xd9c27a,
  fruit: 0xff8a3c,
  utility: 0xcccccc,
};

const DASH_RE = /\b(dash|dashes|rush|charge|charges|lunge|lunges|leap|leaps|teleport|flash step|blitz|zoom)\b/i;
const AOE_RE =
  /\b(explo|explodes?|explosion|around|surround|burst|nova|slam|slams|shockwave|ground|nearby|all enemies|aura|storm|rain|spin|spins|circle|radius|erupt|eruption|wave of|area)\b/i;

/** เดาชนิดการยิงจากคำอธิบายของสกิล */
export function inferRenderType(raw: RawSkill, slot: SkillSlotIndex): SkillRenderType {
  const text = `${raw.name} ${raw.description}`;
  if (DASH_RE.test(text)) return 'dash';
  if (AOE_RE.test(text)) return 'aoe';
  // ไม้ตายเน้นพื้นที่กว้างถ้าไม่ใช่ท่าพุ่ง
  if (slot === 'ultimate') return 'aoe';
  return 'projectile';
}

const SLOT_INDEX: Record<Exclude<SkillSlotIndex, 'ultimate'>, number> = { 1: 0, 2: 1, 3: 2 };

/** map archetype ของ Skill Gameplay Databook → ชนิดการยิงที่ combat core รองรับ */
export function archetypeToRenderType(archetype: SkillArchetype): SkillRenderType {
  switch (archetype) {
    case 'projectile':
      return 'projectile';
    case 'dash':
    case 'mobility':
      return 'dash';
    // ground/melee/summon/buff → ปล่อยผลรอบตัว (โซนใกล้ตัวละคร) ไปก่อน
    default:
      return 'aoe';
  }
}

function iconFor(renderType: SkillRenderType, isUltimate: boolean): string {
  if (isUltimate) return '🌟';
  return renderType === 'projectile' ? '🌀' : renderType === 'aoe' ? '💥' : '⚡';
}

/** สร้าง CastableSkill จาก record ของ Skill Gameplay Databook (Phase 8) */
function fromGameplay(
  raw: RawSkill,
  gameplay: SkillGameplay,
  isUltimate: boolean,
  category: LoadoutCategory,
): CastableSkill {
  const renderType = archetypeToRenderType(gameplay.archetype);
  let range = gameplay.range;
  let radius = gameplay.radius;
  if (renderType === 'aoe') {
    // ground/melee มี range หน้าตัว — ประมาณเป็นวงรอบตัวที่ใหญ่ขึ้น
    radius = Math.min(7.5, gameplay.radius + gameplay.range * 0.5);
    range = 0;
  } else if (renderType === 'dash' && range <= 0) {
    // mobility ที่ไม่มีระยะระบุ → วาร์ปสั้นไปข้างหน้า
    range = 6;
  }
  return {
    id: gameplay.id,
    name: raw.name,
    icon: iconFor(renderType, isUltimate),
    cooldown: gameplay.cooldown,
    energyCost: gameplay.energy,
    castTime: gameplay.castTime,
    damage: gameplay.damage,
    range,
    radius,
    renderType,
    isUltimate,
    category,
    color: gameplay.vfxColor,
  };
}

/** แปลงสกิลดิบ → สกิลที่ยิงได้ (อ่าน Skill Gameplay Databook ก่อน, ไม่มีค่อย fallback heuristic) */
export function toCastable(
  raw: RawSkill,
  slot: SkillSlotIndex,
  category: LoadoutCategory,
): CastableSkill {
  const isUltimate = slot === 'ultimate';
  const gameplay = getSkillGameplay(raw.id);
  if (gameplay) return fromGameplay(raw, gameplay, isUltimate, category);

  const idx = isUltimate ? 3 : SLOT_INDEX[slot];
  const renderType = inferRenderType(raw, slot);
  const cooldown = raw.cooldown ?? [5, 8, 11, 20][idx];
  const energyCost = raw.energy ?? [16, 22, 28, 45][idx];
  const castTime = [0.15, 0.2, 0.22, 0.3][idx];

  // ดาเมจฐานต่อสลอต + โบนัสตามคูลดาวน์ (คูลดาวน์สูง = แรงกว่า)
  const base = [40, 52, 66, 110][idx];
  const damage = Math.round(base + cooldown * 3);

  let range = 0;
  let radius = 3;
  if (renderType === 'projectile') {
    range = isUltimate ? 22 : 18;
    radius = isUltimate ? 2.6 : 2.0;
  } else if (renderType === 'aoe') {
    range = 0;
    radius = isUltimate ? 6.5 : 4.8;
  } else {
    range = isUltimate ? 10 : 8;
    radius = 2.3;
  }

  const icon = isUltimate
    ? '🌟'
    : renderType === 'projectile'
      ? '🌀'
      : renderType === 'aoe'
        ? '💥'
        : '⚡';

  return {
    id: raw.id,
    name: raw.name,
    icon,
    cooldown,
    energyCost,
    castTime,
    damage,
    range,
    radius,
    renderType,
    isUltimate,
    category,
    color: CATEGORY_COLOR[category],
  };
}
