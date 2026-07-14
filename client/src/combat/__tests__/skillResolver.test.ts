import { describe, expect, it } from 'vitest';
import { SkillLoadout, DEFAULT_SKILL_LOADOUT } from '../SkillLoadout';
import { resolveActiveSet } from '../SkillResolver';
import { inferRenderType, toCastable, WEAPON_M1, type RawSkill } from '../SkillCasting';

const FULL = {
  swordMastery: 600,
  gunMastery: 600,
  fightingStyleMastery: 600,
  fruitMastery: 600,
};

describe('SkillCasting adapter', () => {
  const raw = (over: Partial<RawSkill>): RawSkill => ({
    id: 's',
    name: 'Skill',
    mastery: 1,
    cooldown: 7.5,
    energy: 15,
    description: '',
    ...over,
  });

  it('classifies dash / aoe / projectile from description', () => {
    expect(inferRenderType(raw({ description: 'The user dashes forward at high speed' }), 1)).toBe('dash');
    expect(inferRenderType(raw({ description: 'creates an explosion around them' }), 1)).toBe('aoe');
    expect(inferRenderType(raw({ description: 'fires a beam at the cursor' }), 1)).toBe('projectile');
  });

  it('treats the ultimate slot as AoE unless it is a dash', () => {
    expect(inferRenderType(raw({ description: 'a powerful finishing move' }), 'ultimate')).toBe('aoe');
    expect(inferRenderType(raw({ description: 'rush toward the enemy' }), 'ultimate')).toBe('dash');
  });

  it('derives positive damage and preserves databook cooldown/energy', () => {
    const skill = toCastable(raw({ cooldown: 7.5, energy: 15 }), 1, 'fruit');
    expect(skill.damage).toBeGreaterThan(0);
    expect(skill.cooldown).toBe(7.5);
    expect(skill.energyCost).toBe(15);
    expect(skill.isUltimate).toBe(false);
    expect(skill.category).toBe('fruit');
  });

  it('makes ultimates hit harder than normal slots', () => {
    const normal = toCastable(raw({ cooldown: 8 }), 1, 'fruit');
    const ult = toCastable(raw({ cooldown: 8 }), 'ultimate', 'fruit');
    expect(ult.isUltimate).toBe(true);
    expect(ult.damage).toBeGreaterThan(normal.damage);
  });

  it('falls back to defaults when cooldown/energy are missing', () => {
    const skill = toCastable(raw({ cooldown: null, energy: null }), 2, 'sword');
    expect(skill.cooldown).toBeGreaterThan(0);
    expect(skill.energyCost).toBeGreaterThan(0);
  });
});

describe('resolveActiveSet', () => {
  it('weapon set defaults to the fist (fighting-style) M1', () => {
    const loadout = new SkillLoadout({ ...DEFAULT_SKILL_LOADOUT, ...FULL });
    const set = resolveActiveSet(loadout);
    expect(set.kind).toBe('weapon');
    expect(set.category).toBe('style');
    expect(set.weaponCategory).toBe('style');
    expect(set.m1).toBe(WEAPON_M1['fighting-style']);
    expect(set.m1.damage).toBeGreaterThan(0);
  });

  it('resolves a fruit skill set when a fruit is equipped and active', () => {
    const loadout = new SkillLoadout({
      ...DEFAULT_SKILL_LOADOUT,
      ...FULL,
      equippedFruitId: 'rocket',
      activeSet: 'fruit',
    });
    const set = resolveActiveSet(loadout);
    expect(set.kind).toBe('fruit');
    expect(set.category).toBe('fruit');
    expect(set.itemId).toBe('rocket');
    // rocket มีสกิล Z/X/C อย่างน้อย 3 ท่า
    expect(set.slots.filter(Boolean).length).toBeGreaterThanOrEqual(3);
    // M1 ยังใช้อาวุธที่ถือ (มือเปล่า) ไม่ใช่ผลไม้
    expect(set.weaponCategory).toBe('style');
  });

  it('exposes the equipped weapon id for M1 even when the fruit set is active', () => {
    const loadout = new SkillLoadout({
      ...DEFAULT_SKILL_LOADOUT,
      ...FULL,
      equippedFruitId: 'rocket',
      activeSet: 'fruit',
    });
    const set = resolveActiveSet(loadout);
    expect(set.weaponId).toBe(DEFAULT_SKILL_LOADOUT.equippedFightingStyleId);
  });
});

describe('per-item mastery gating (Blox Fruits style)', () => {
  // หมัดเริ่มต้น 'combat': Z@1, X@20, C@50, V@150 (จาก databook)
  it('locks skills above the item mastery and reports the requirement', () => {
    const loadout = new SkillLoadout({ ...DEFAULT_SKILL_LOADOUT }, () => 1);
    const slots = loadout.resolveSlots();
    const z = slots.find((s) => s.slot === 1)!;
    const x = slots.find((s) => s.slot === 2)!;
    const v = slots.find((s) => s.slot === 'ultimate')!;
    expect(z.locked).toBe(false); // Z ปลดตั้งแต่ mastery 1
    expect(x.locked).toBe(true);
    expect(x.masteryRequired).toBe(20);
    expect(v.locked).toBe(true);
    expect(v.masteryRequired).toBe(150);
    // slotInfo ยังมีไอคอน/ชื่อไว้โชว์แม้ล็อก
    const set = resolveActiveSet(loadout);
    expect(set.slots[1]).toBeNull(); // ยิงไม่ได้
    expect(set.slotInfo[1].hasSkill).toBe(true);
    expect(set.slotInfo[1].locked).toBe(true);
    expect(set.slotInfo[1].masteryRequired).toBe(20);
  });

  it('unlocks more slots as the item mastery rises', () => {
    const at50 = new SkillLoadout({ ...DEFAULT_SKILL_LOADOUT }, () => 50);
    const slots = at50.resolveSlots();
    expect(slots.find((s) => s.slot === 2)!.locked).toBe(false); // X@20 ✓
    expect(slots.find((s) => s.slot === 3)!.locked).toBe(false); // C@50 ✓
    expect(slots.find((s) => s.slot === 'ultimate')!.locked).toBe(true); // V@150 ✗
    expect(resolveActiveSet(at50).slots.filter(Boolean).length).toBe(3);
  });

  it('resolves per item, not per category — same category, different mastery', () => {
    // provider คืน mastery ต่างกันต่อ id → equip คนละชิ้นได้ผลต่างกัน
    const masteryOf = (id: string) => (id === 'combat' ? 1 : 999);
    const combat = new SkillLoadout({ ...DEFAULT_SKILL_LOADOUT, equippedFightingStyleId: 'combat' }, masteryOf);
    const other = new SkillLoadout({ ...DEFAULT_SKILL_LOADOUT, equippedFightingStyleId: 'dark-step' }, masteryOf);
    const combatUnlocked = resolveActiveSet(combat).slots.filter(Boolean).length;
    const otherUnlocked = resolveActiveSet(other).slots.filter(Boolean).length;
    expect(combatUnlocked).toBe(1); // combat mastery 1 → เฉพาะ Z
    expect(otherUnlocked).toBeGreaterThan(combatUnlocked); // อีกชิ้น mastery สูง → ปลดมากกว่า
  });
});
