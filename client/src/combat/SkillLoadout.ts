import type { ResolvedSkillSlot, SkillLoadoutState, SkillSetKind, SkillSlotIndex } from './types';
import { listUnlockedSwordSkills } from '../swords/skills/SwordSkillRegistry';
import { listUnlockedSkills } from '../fruit/skills/FruitSkillRegistry';

export const DEFAULT_SKILL_LOADOUT: SkillLoadoutState = {
  activeSet: 'weapon',
  equippedSwordId: 'katana',
  equippedFruitId: null,
  swordMastery: 1,
  fruitMastery: 1,
  fruitAwakened: false,
};

const WEAPON_SLOTS: SkillSlotIndex[] = [1, 2, 3, 'ultimate'];
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
    this.state.equippedSwordId = swordId;
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
    const swordId = this.state.equippedSwordId;
    if (!swordId) {
      return WEAPON_SLOTS.map((slot) => ({
        slot, skillId: null, label: '—', locked: true, lockReason: 'ไม่มีดาบ',
      }));
    }
    const byKey = new Map(listUnlockedSwordSkills(swordId, this.state.swordMastery).map((s) => [s.key, s]));
    const z = byKey.get('Z');
    const x = byKey.get('X');
    return [
      { slot: 1, skillId: z?.id ?? null, label: z?.name ?? 'Z', locked: !z, lockReason: z ? undefined : 'ยังไม่ปลดล็อก Z' },
      { slot: 2, skillId: x?.id ?? null, label: x?.name ?? 'X', locked: !x, lockReason: x ? undefined : 'ยังไม่ปลดล็อก X' },
      { slot: 3, skillId: null, label: '—', locked: true, lockReason: 'ดาบไม่มีสกิล 3' },
      { slot: 'ultimate', skillId: null, label: '—', locked: true, lockReason: 'ดาบไม่มีไม้ตาย' },
    ];
  }

  private resolveFruitSlots(): ResolvedSkillSlot[] {
    const fruitId = this.state.equippedFruitId;
    if (!fruitId) {
      return FRUIT_SLOT_MAP.map(({ slot }) => ({
        slot, skillId: null, label: '—', locked: true, lockReason: 'ไม่มีผลไม้',
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
