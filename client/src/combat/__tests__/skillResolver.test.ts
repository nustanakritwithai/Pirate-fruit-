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
