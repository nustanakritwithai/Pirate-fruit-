/**
 * Phase 7 — สะพานเชื่อม SkillLoadout (databook) → ชุดสกิลที่ยิงได้ในเกม
 * รวมข้อมูลไอเทม (ชื่อ/ไอคอน) + สกิลที่ปลดล็อก แล้วแปลงผ่าน SkillCasting
 */

import type { SkillLoadout } from './SkillLoadout';
import type { SkillSlotIndex } from './types';
import type { LoadoutCategory } from './CombatData';
import type { ActiveLoadoutItem } from '../progression/ProgressionTypes';
import {
  toCastable,
  WEAPON_M1,
  type CastableSkill,
  type M1Profile,
  type RawSkill,
} from './SkillCasting';
import { getFruitSkill } from '../fruit/skills/FruitSkillRegistry';
import { getSwordSkill } from '../swords/skills/SwordSkillRegistry';
import { getGunSkill } from '../guns/skills/GunSkillRegistry';
import { getFightingStyleSkill } from '../fighting-styles/skills/FightingStyleSkillRegistry';
import { getFruit } from '../fruit/FruitRegistry';
import { getSword } from '../swords/SwordRegistry';
import { getGun } from '../guns/GunRegistry';
import { getFightingStyle } from '../fighting-styles/FightingStyleRegistry';

export interface ActiveSkillSet {
  kind: 'weapon' | 'fruit';
  category: LoadoutCategory;
  itemId: string | null;
  itemName: string;
  itemIcon: string;
  /** 4 สลอต: [Z, X, C, ไม้ตาย] — null = ล็อก/ไม่มี */
  slots: (CastableSkill | null)[];
  m1: M1Profile;
  /** อาวุธที่ถือ (M1 ใช้เสมอ ไม่ขึ้นกับชุดสกิลที่ active) */
  weaponId: string | null;
  weaponCategory: LoadoutCategory;
}

/** meta ของอาวุธที่ถือ (สำหรับ M1 + reward source) */
function weaponMeta(loadout: SkillLoadout): { id: string | null; category: LoadoutCategory } {
  const state = loadout.snapshot;
  switch (loadout.equippedWeaponKind) {
    case 'sword':
      return { id: state.equippedSwordId, category: 'sword' };
    case 'gun':
      return { id: state.equippedGunId, category: 'gun' };
    default:
      return { id: state.equippedFightingStyleId, category: 'style' };
  }
}

const SLOT_TO_INDEX: Record<SkillSlotIndex, number> = { 1: 0, 2: 1, 3: 2, ultimate: 3 };

function lookupRawSkill(kind: 'weapon' | 'fruit', weaponKind: string, skillId: string): RawSkill | undefined {
  if (kind === 'fruit') return getFruitSkill(skillId);
  if (weaponKind === 'sword') return getSwordSkill(skillId);
  if (weaponKind === 'gun') return getGunSkill(skillId);
  return getFightingStyleSkill(skillId);
}

/** ข้อมูลไอเทมที่ active (อาวุธหรือผลไม้) — ชื่อ + ไอคอน */
function activeItemMeta(loadout: SkillLoadout): {
  category: LoadoutCategory;
  itemId: string | null;
  name: string;
  icon: string;
} {
  const state = loadout.snapshot;
  if (loadout.activeSet === 'fruit') {
    const fruit = state.equippedFruitId ? getFruit(state.equippedFruitId) : undefined;
    return { category: 'fruit', itemId: state.equippedFruitId, name: fruit?.nameTh ?? 'ไม่มีผลไม้', icon: '🍎' };
  }
  switch (loadout.equippedWeaponKind) {
    case 'sword': {
      const sword = state.equippedSwordId ? getSword(state.equippedSwordId) : undefined;
      return { category: 'sword', itemId: state.equippedSwordId, name: sword?.nameTh ?? 'ไม่มีดาบ', icon: '🗡️' };
    }
    case 'gun': {
      const gun = state.equippedGunId ? getGun(state.equippedGunId) : undefined;
      return { category: 'gun', itemId: state.equippedGunId, name: gun?.nameTh ?? 'ไม่มีปืน', icon: '🔫' };
    }
    default: {
      const style = state.equippedFightingStyleId ? getFightingStyle(state.equippedFightingStyleId) : undefined;
      return { category: 'style', itemId: state.equippedFightingStyleId, name: style?.nameTh ?? 'มือเปล่า', icon: '👊' };
    }
  }
}

/** สร้างชุดสกิลที่ active จาก SkillLoadout ปัจจุบัน */
export function resolveActiveSet(loadout: SkillLoadout): ActiveSkillSet {
  const meta = activeItemMeta(loadout);
  const slots: (CastableSkill | null)[] = [null, null, null, null];

  for (const resolved of loadout.resolveSlots()) {
    const index = SLOT_TO_INDEX[resolved.slot];
    if (resolved.locked || !resolved.skillId) continue;
    const raw = lookupRawSkill(loadout.activeSet, loadout.equippedWeaponKind, resolved.skillId);
    if (!raw) continue;
    slots[index] = toCastable(raw, resolved.slot, meta.category);
  }

  const weapon = weaponMeta(loadout);
  return {
    kind: loadout.activeSet,
    category: meta.category,
    itemId: meta.itemId,
    itemName: meta.name,
    itemIcon: meta.icon,
    slots,
    m1: WEAPON_M1[loadout.equippedWeaponKind],
    weaponId: weapon.id,
    weaponCategory: weapon.category,
  };
}

/**
 * ไอเทมที่ผู้เล่นติดตั้งแยกต่อชิ้น (อาวุธที่ถือ + ผลไม้) สำหรับโชว์ mastery ต่อชิ้น
 * ไม่ขึ้นกับชุดสกิลที่ active — เห็น mastery ของทั้งสองพร้อมกัน
 */
export function resolveEquippedItems(loadout: SkillLoadout): {
  weapon: ActiveLoadoutItem;
  fruit: ActiveLoadoutItem | null;
} {
  const state = loadout.snapshot;
  let weapon: ActiveLoadoutItem;
  switch (loadout.equippedWeaponKind) {
    case 'sword': {
      const s = state.equippedSwordId ? getSword(state.equippedSwordId) : undefined;
      weapon = { itemId: state.equippedSwordId ?? 'sword', category: 'sword', name: s?.nameTh ?? 'ดาบ' };
      break;
    }
    case 'gun': {
      const g = state.equippedGunId ? getGun(state.equippedGunId) : undefined;
      weapon = { itemId: state.equippedGunId ?? 'gun', category: 'gun', name: g?.nameTh ?? 'ปืน' };
      break;
    }
    default: {
      const st = state.equippedFightingStyleId ? getFightingStyle(state.equippedFightingStyleId) : undefined;
      weapon = { itemId: state.equippedFightingStyleId ?? 'combat', category: 'style', name: st?.nameTh ?? 'มือเปล่า' };
    }
  }
  const fruit: ActiveLoadoutItem | null = state.equippedFruitId
    ? { itemId: state.equippedFruitId, category: 'fruit', name: getFruit(state.equippedFruitId)?.nameTh ?? 'ผลไม้' }
    : null;
  return { weapon, fruit };
}
