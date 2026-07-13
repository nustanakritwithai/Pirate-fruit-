import type {
  ResolvedSkillSlot,
  SkillLoadoutState,
  SkillSetKind,
  SkillSlotIndex,
  WeaponKind,
} from './types';
import { listUnlockedFightingStyleSkills } from '../fighting-styles/skills/FightingStyleSkillRegistry';
import { listUnlockedGunSkills } from '../guns/skills/GunSkillRegistry';
import { listUnlockedSwordSkills } from '../swords/skills/SwordSkillRegistry';
import { listUnlockedSkills } from '../fruit/skills/FruitSkillRegistry';

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
  constructor(private state: SkillLoadoutState = { ...DEFAULT_SKILL_LOADOUT }) {}

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
          listUnlockedGunSkills,
          MELEE_RANGED_SLOT_MAP,
          'ไม่มีปืน',
          'ปืน',
        );
      case 'fighting-style':
        return this.resolveKeyedWeaponSlots(
          this.state.equippedFightingStyleId,
          this.state.fightingStyleMastery,
          listUnlockedFightingStyleSkills,
          FIGHTING_STYLE_SLOT_MAP,
          'ไม่มีสไตล์ต่อสู้',
          'สไตล์',
        );
      default:
        return this.resolveKeyedWeaponSlots(
          this.state.equippedSwordId,
          this.state.swordMastery,
          listUnlockedSwordSkills,
          MELEE_RANGED_SLOT_MAP,
          'ไม่มีดาบ',
          'ดาบ',
        );
    }
  }

  private resolveKeyedWeaponSlots<T extends { id: string; name: string; key: string }>(
    weaponId: string | null,
    mastery: number,
    listUnlocked: (id: string, mastery: number) => T[],
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
        lockReason: emptyReason,
      }));
    }

    const byKey = new Map(listUnlocked(weaponId, mastery).map((s) => [s.key, s]));

    return slotMap.map(({ slot, key }) => {
      const skill = byKey.get(key);
      const missingLabel =
        slot === 'ultimate' ? `${weaponLabel}ไม่มีไม้ตาย` : `${weaponLabel}ไม่มีสกิล ${key}`;
      return {
        slot,
        skillId: skill?.id ?? null,
        label: skill?.name ?? key,
        locked: !skill,
        lockReason: skill ? undefined : skill === undefined && !byKey.has(key) ? missingLabel : `ยังไม่ปลดล็อก ${key}`,
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
        lockReason: 'ไม่มีผลไม้',
      }));
    }
    const unlocked = listUnlockedSkills(fruitId, this.state.fruitMastery, this.state.fruitAwakened);
    const byKey = new Map<string, (typeof unlocked)[number]>();
    for (const s of unlocked) {
      if (!byKey.has(s.key)) byKey.set(s.key, s);
    }
    return FRUIT_SLOT_MAP.map(({ slot, key }) => {
      const skill = byKey.get(key);
      return {
        slot,
        skillId: skill?.id ?? null,
        label: skill?.name ?? key,
        locked: !skill,
        lockReason: skill ? undefined : `ยังไม่ปลดล็อก ${key}`,
      };
    });
  }
}
