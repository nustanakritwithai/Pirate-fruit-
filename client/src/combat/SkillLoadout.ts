import type {
  ResolvedSkillSlot,
  SkillLoadoutState,
  SkillSetKind,
  SkillSlotIndex,
  WeaponKind,
} from './types';
import { listSkillsForFightingStyle } from '../fighting-styles/skills/FightingStyleSkillRegistry';
import { listSkillsForGun } from '../guns/skills/GunSkillRegistry';
import { listSkillsForSword } from '../swords/skills/SwordSkillRegistry';
import { listSkillsForFruit } from '../fruit/skills/FruitSkillRegistry';

/** provider ให้ mastery ต่อชิ้นจริง (จาก ProgressionManager) — ไม่มี → ใช้ค่าใน state */
export type MasteryProvider = (itemId: string) => number;

/**
 * ระบบล็อกสกิลตาม mastery (Blox Fruits style) — ปิดชั่วคราวตามคำขอ
 * เปิดคืน = เปลี่ยนเป็น true ที่เดียว (masteryRequired ยังคำนวณไว้เผื่อเปิด)
 */
export const SKILL_LOCK_ENABLED = false;

/** เลือกสกิล "ตัวแทน" ต่อ key จาก moveset เต็ม = ท่าที่ mastery ต่ำสุด (ท่าฐาน) */
function baseSkillByKey<T extends { key: string; mastery: number | null }>(all: T[]): Map<string, T> {
  const byKey = new Map<string, T>();
  for (const s of all) {
    const existing = byKey.get(s.key);
    if (!existing || (s.mastery ?? 0) < (existing.mastery ?? 0)) byKey.set(s.key, s);
  }
  return byKey;
}

/** เกณฑ์ปลดล็อกสกิลหนึ่งช่องของไอเทม (สำหรับแผงสถิติ) */
export interface SkillGate {
  key: string;
  name: string;
  masteryRequired: number;
}

const CATEGORY_SLOT_KEYS: Record<string, string[]> = {
  style: ['Z', 'X', 'C', 'V'],
  fruit: ['Z', 'X', 'C', 'V'],
  sword: ['Z', 'X'],
  gun: ['Z', 'X'],
};

const CATEGORY_MOVESET: Record<string, (id: string) => { key: string; name: string; mastery: number | null }[]> = {
  style: listSkillsForFightingStyle,
  fruit: (id) => listSkillsForFruit(id),
  sword: listSkillsForSword,
  gun: listSkillsForGun,
};

/**
 * เกณฑ์ mastery ต่อสกิล (Z/X/C/V) ของไอเทมหนึ่ง — StatsPanel ใช้โชว้ ✓ ปลดแล้ว / 🔒 ต้องการ N
 * (fruit ใช้ moveset ฐานที่ไม่ตื่น — awakening แสดงแยกภายหลัง)
 */
export function listSkillGates(category: string, itemId: string): SkillGate[] {
  const keys = CATEGORY_SLOT_KEYS[category];
  const lister = CATEGORY_MOVESET[category];
  if (!keys || !lister) return [];
  const byKey = baseSkillByKey(lister(itemId));
  const gates: SkillGate[] = [];
  for (const key of keys) {
    const skill = byKey.get(key);
    if (skill) gates.push({ key, name: skill.name, masteryRequired: skill.mastery ?? 1 });
  }
  return gates;
}

export const DEFAULT_SKILL_LOADOUT: SkillLoadoutState = {
  activeSet: 'weapon',
  equippedWeaponKind: 'fighting-style',
  equippedSwordId: null,
  equippedGunId: null,
  equippedFightingStyleId: 'combat',
  equippedFruitId: null,
  swordMastery: 1,
  gunMastery: 1,
  fightingStyleMastery: 1,
  fruitMastery: 1,
  fruitAwakened: false,
};

const WEAPON_SLOTS: SkillSlotIndex[] = [1, 2, 3, 'ultimate'];

/** ดาบ / ปืน: Z, X เท่านั้น */
const MELEE_RANGED_SLOT_MAP: { slot: SkillSlotIndex; key: string }[] = [
  { slot: 1, key: 'Z' },
  { slot: 2, key: 'X' },
];

/** สไตล์ต่อสู้: Z, X, C และบางสไตล์มี V */
const FIGHTING_STYLE_SLOT_MAP: { slot: SkillSlotIndex; key: string }[] = [
  { slot: 1, key: 'Z' },
  { slot: 2, key: 'X' },
  { slot: 3, key: 'C' },
  { slot: 'ultimate', key: 'V' },
];

const FRUIT_SLOT_MAP: { slot: SkillSlotIndex; key: string }[] = [
  { slot: 1, key: 'Z' },
  { slot: 2, key: 'X' },
  { slot: 3, key: 'C' },
  { slot: 'ultimate', key: 'V' },
];

export class SkillLoadout {
  constructor(
    private state: SkillLoadoutState = { ...DEFAULT_SKILL_LOADOUT },
    /** ดึง mastery ต่อชิ้นจริง — ถ้าไม่ส่ง ใช้ค่าในตัว state (พฤติกรรมเดิม) */
    private masteryOf?: MasteryProvider,
  ) {}

  /** ตั้ง provider mastery ต่อชิ้นภายหลัง (main.ts ผูก ProgressionManager) */
  setMasteryProvider(provider: MasteryProvider): void {
    this.masteryOf = provider;
  }

  /** mastery ปัจจุบันของไอเทม — provider ก่อน, ไม่มีค่อย fallback ค่าใน state */
  private masteryFor(itemId: string | null, fallback: number): number {
    if (itemId && this.masteryOf) return this.masteryOf(itemId);
    return fallback;
  }

  get activeSet(): SkillSetKind {
    return this.state.activeSet;
  }

  get equippedWeaponKind(): WeaponKind {
    return this.state.equippedWeaponKind;
  }

  get snapshot(): Readonly<SkillLoadoutState> {
    return this.state;
  }

  toggle(): SkillSetKind {
    this.state.activeSet = this.state.activeSet === 'weapon' ? 'fruit' : 'weapon';
    return this.state.activeSet;
  }

  setActiveSet(kind: SkillSetKind): void {
    this.state.activeSet = kind;
  }

  equipSword(swordId: string | null): void {
    this.state.equippedWeaponKind = 'sword';
    this.state.equippedSwordId = swordId;
  }

  equipGun(gunId: string | null): void {
    this.state.equippedWeaponKind = 'gun';
    this.state.equippedGunId = gunId;
  }

  equipFightingStyle(styleId: string | null): void {
    this.state.equippedWeaponKind = 'fighting-style';
    this.state.equippedFightingStyleId = styleId;
  }

  equipFruit(fruitId: string | null, awakened = false): void {
    this.state.equippedFruitId = fruitId;
    this.state.fruitAwakened = awakened;
  }

  resolveSlots(): ResolvedSkillSlot[] {
    return this.state.activeSet === 'weapon'
      ? this.resolveWeaponSlots()
      : this.resolveFruitSlots();
  }

  private resolveWeaponSlots(): ResolvedSkillSlot[] {
    switch (this.state.equippedWeaponKind) {
      case 'gun':
        return this.resolveKeyedWeaponSlots(
          this.state.equippedGunId,
          this.state.gunMastery,
          listSkillsForGun,
          MELEE_RANGED_SLOT_MAP,
          'ไม่มีปืน',
          'ปืน',
        );
      case 'fighting-style':
        return this.resolveKeyedWeaponSlots(
          this.state.equippedFightingStyleId,
          this.state.fightingStyleMastery,
          listSkillsForFightingStyle,
          FIGHTING_STYLE_SLOT_MAP,
          'ไม่มีสไตล์ต่อสู้',
          'สไตล์',
        );
      default:
        return this.resolveKeyedWeaponSlots(
          this.state.equippedSwordId,
          this.state.swordMastery,
          listSkillsForSword,
          MELEE_RANGED_SLOT_MAP,
          'ไม่มีดาบ',
          'ดาบ',
        );
    }
  }

  private resolveKeyedWeaponSlots<T extends { id: string; name: string; key: string; mastery: number | null }>(
    weaponId: string | null,
    fallbackMastery: number,
    listAll: (id: string) => T[],
    slotMap: { slot: SkillSlotIndex; key: string }[],
    emptyReason: string,
    weaponLabel: string,
  ): ResolvedSkillSlot[] {
    if (!weaponId) {
      return WEAPON_SLOTS.map((slot) => ({
        slot,
        skillId: null,
        label: '—',
        locked: true,
        masteryRequired: 0,
        lockReason: emptyReason,
      }));
    }

    const byKey = baseSkillByKey(listAll(weaponId));
    const currentMastery = this.masteryFor(weaponId, fallbackMastery);

    return slotMap.map(({ slot, key }) => {
      const skill = byKey.get(key);
      if (!skill) {
        const missingLabel =
          slot === 'ultimate' ? `${weaponLabel}ไม่มีไม้ตาย` : `${weaponLabel}ไม่มีสกิล ${key}`;
        return { slot, skillId: null, label: key, locked: true, masteryRequired: 0, lockReason: missingLabel };
      }
      const req = skill.mastery ?? 1;
      const locked = SKILL_LOCK_ENABLED && currentMastery < req;
      return {
        slot,
        // เก็บ id ไว้แม้ล็อก เพื่อให้ปุ่มโชว์ไอคอนจริงพร้อมป้าย 🔒
        skillId: skill.id,
        label: skill.name,
        locked,
        masteryRequired: req,
        lockReason: locked ? `ต้องการ Mastery ${req}` : undefined,
      };
    });
  }

  private resolveFruitSlots(): ResolvedSkillSlot[] {
    const fruitId = this.state.equippedFruitId;
    if (!fruitId) {
      return FRUIT_SLOT_MAP.map(({ slot }) => ({
        slot,
        skillId: null,
        label: '—',
        locked: true,
        masteryRequired: 0,
        lockReason: 'ไม่มีผลไม้',
      }));
    }
    const awakened = this.state.fruitAwakened;
    // moveset ตาม awakening ที่ active (ก่อนกรอง mastery) แล้วเลือกท่าฐานต่อ key
    const moveset = listSkillsForFruit(fruitId).filter((s) => {
      const isAwakened =
        s.version.includes('V2') || s.version.includes('Transformed') || s.awakeningFragmentCost != null;
      if (isAwakened && !awakened) return false;
      if (!isAwakened && awakened && s.version.includes('V1')) return false;
      return true;
    });
    const byKey = baseSkillByKey(moveset);
    const currentMastery = this.masteryFor(fruitId, this.state.fruitMastery);

    return FRUIT_SLOT_MAP.map(({ slot, key }) => {
      const skill = byKey.get(key);
      if (!skill) {
        return { slot, skillId: null, label: key, locked: true, masteryRequired: 0, lockReason: `ไม่มีสกิล ${key}` };
      }
      const req = skill.mastery ?? 1;
      const locked = SKILL_LOCK_ENABLED && currentMastery < req;
      return {
        slot,
        skillId: skill.id,
        label: skill.name,
        locked,
        masteryRequired: req,
        lockReason: locked ? `ต้องการ Mastery ${req}` : undefined,
      };
    });
  }
}
