import { describe, expect, it } from 'vitest';
import { SkillLoadout, DEFAULT_SKILL_LOADOUT, SKILL_LOCK_ENABLED, listSkillGates } from '../SkillLoadout';
import { resolveActiveSet } from '../SkillResolver';
import { inferRenderType, toCastable, WEAPON_M1, type RawSkill } from '../SkillCasting';
import { ALL_SKILL_GAMEPLAY } from '../skillGameplay';

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

describe('รูปแบบสกิลใหม่ (databook → castable)', () => {
  const rawFrom = (rec: (typeof ALL_SKILL_GAMEPLAY)[number]): RawSkill => ({
    id: rec.id,
    name: rec.id,
    mastery: 1,
    cooldown: rec.cooldown,
    energy: rec.energy,
    description: '',
  });

  it('map archetype → render type ที่ต่างกันจริง (flurry/beam/ground/buff/summon/homing/teleport)', () => {
    const pick = (a: string) => ALL_SKILL_GAMEPLAY.find((r) => r.archetype === a);
    expect(toCastable(rawFrom(pick('melee')!), 1, 'style').renderType).toBe('flurry');
    expect(toCastable(rawFrom(pick('beam')!), 1, 'fruit').renderType).toBe('beam');
    expect(toCastable(rawFrom(pick('ground')!), 1, 'style').renderType).toBe('ground');
    expect(toCastable(rawFrom(pick('summon')!), 1, 'fruit').renderType).toBe('summon');
    expect(toCastable(rawFrom(pick('homing')!), 1, 'fruit').renderType).toBe('homing');
    expect(toCastable(rawFrom(pick('teleport')!), 1, 'sword').renderType).toBe('teleport');
    const buff = pick('buff');
    if (buff) expect(toCastable(rawFrom(buff), 'ultimate', 'fruit').renderType).toBe('buff');
  });

  it('พา hitCount / cc / dot เข้าเกมครบ (เดิมถูกทิ้ง)', () => {
    const multi = ALL_SKILL_GAMEPLAY.find((r) => r.archetype === 'projectile' && r.hitCount >= 2)!;
    const cast = toCastable(rawFrom(multi), 1, 'gun');
    expect(cast.hitCount).toBe(multi.hitCount);
    expect(Array.isArray(cast.cc)).toBe(true);

    const dotRec = ALL_SKILL_GAMEPLAY.find((r) => r.dot)!;
    expect(toCastable(rawFrom(dotRec), 1, 'fruit').dot).toEqual(dotRec.dot);

    const stunRec = ALL_SKILL_GAMEPLAY.find((r) => r.cc.some((c) => c.type === 'stun'))!;
    expect(toCastable(rawFrom(stunRec), 1, 'fruit').cc.some((c) => c.type === 'stun')).toBe(true);
  });

  it('fallback (ไม่มี record) ยังคืน hitCount/cc ที่ปลอดภัย', () => {
    const cast = toCastable(
      { id: 'no-record', name: 'X', mastery: 1, cooldown: 8, energy: 20, description: 'fires a beam' },
      1,
      'fruit',
    );
    expect(cast.hitCount).toBe(1);
    expect(cast.cc).toEqual([]);
  });
});

describe('จัดเรียงช่อง Z/X/C/V (arrangement override)', () => {
  it('override สลับสกิลบนปุ่ม (X↔C) ของผลไม้ rocket', () => {
    // showcase ใน skillLayout.ts: rocket → { X:'rocket-base-c', C:'rocket-base-x' }
    const loadout = new SkillLoadout({
      ...DEFAULT_SKILL_LOADOUT,
      ...FULL,
      equippedFruitId: 'rocket',
      activeSet: 'fruit',
    });
    const slots = loadout.resolveSlots();
    expect(slots.find((s) => s.slot === 2)!.skillId).toBe('rocket-base-c'); // ปุ่ม X
    expect(slots.find((s) => s.slot === 3)!.skillId).toBe('rocket-base-x'); // ปุ่ม C
    expect(slots.find((s) => s.slot === 1)!.skillId).toBe('rocket-base-z'); // Z เดิม
  });

  it('ไอเทมที่ไม่มี override ใช้การจัดเรียงเดิม (หมัดเริ่มต้น)', () => {
    const loadout = new SkillLoadout({ ...DEFAULT_SKILL_LOADOUT, ...FULL });
    const slots = loadout.resolveSlots();
    // combat ไม่มี override → ปุ่ม X ใช้ท่า key X ของมันเอง (Ground Smash)
    expect(slots.find((s) => s.slot === 2)!.skillId).toBe('combat-x');
    expect(slots.find((s) => s.slot === 3)!.skillId).toBe('combat-c');
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
  // เทสต์อิงฟลไก SKILL_LOCK_ENABLED — เขียวทั้งตอนเปิดและปิดล็อก
  it('reports masteryRequired; locks only when the lock system is enabled', () => {
    const loadout = new SkillLoadout({ ...DEFAULT_SKILL_LOADOUT }, () => 1);
    const slots = loadout.resolveSlots();
    const z = slots.find((s) => s.slot === 1)!;
    const x = slots.find((s) => s.slot === 2)!;
    const v = slots.find((s) => s.slot === 'ultimate')!;
    expect(z.locked).toBe(false); // Z req 1 ≤ mastery 1 → ไม่ล็อกไม่ว่ากรณีใด
    expect(x.masteryRequired).toBe(20);
    expect(v.masteryRequired).toBe(150);
    expect(x.locked).toBe(SKILL_LOCK_ENABLED); // req 20 > mastery 1
    expect(v.locked).toBe(SKILL_LOCK_ENABLED); // req 150 > mastery 1
    // slotInfo ยังมีไอคอน/ชื่อ + masteryRequired เสมอ
    const set = resolveActiveSet(loadout);
    expect(set.slotInfo[1].hasSkill).toBe(true);
    expect(set.slotInfo[1].masteryRequired).toBe(20);
    expect(set.slotInfo[1].locked).toBe(SKILL_LOCK_ENABLED);
    expect(set.slots[1] === null).toBe(SKILL_LOCK_ENABLED); // ปิดล็อก = ยิงได้
  });

  it('unlocks more slots as the item mastery rises (เมื่อเปิดล็อก)', () => {
    const at50 = new SkillLoadout({ ...DEFAULT_SKILL_LOADOUT }, () => 50);
    const slots = at50.resolveSlots();
    expect(slots.find((s) => s.slot === 2)!.locked).toBe(false); // X@20 ≤ 50 ✓ เสมอ
    expect(slots.find((s) => s.slot === 3)!.locked).toBe(false); // C@50 ≤ 50 ✓ เสมอ
    expect(slots.find((s) => s.slot === 'ultimate')!.locked).toBe(SKILL_LOCK_ENABLED); // V@150 > 50
    expect(resolveActiveSet(at50).slots.filter(Boolean).length).toBe(SKILL_LOCK_ENABLED ? 3 : 4);
  });

  it('resolves per item, not per category — same category, different mastery', () => {
    // provider คืน mastery ต่างกันต่อ id → equip คนละชิ้นได้ผลต่างกัน (เฉพาะเมื่อเปิดล็อก)
    const masteryOf = (id: string) => (id === 'combat' ? 1 : 999);
    const combat = new SkillLoadout({ ...DEFAULT_SKILL_LOADOUT, equippedFightingStyleId: 'combat' }, masteryOf);
    const other = new SkillLoadout({ ...DEFAULT_SKILL_LOADOUT, equippedFightingStyleId: 'dark-step' }, masteryOf);
    const combatUnlocked = resolveActiveSet(combat).slots.filter(Boolean).length;
    const otherUnlocked = resolveActiveSet(other).slots.filter(Boolean).length;
    if (SKILL_LOCK_ENABLED) {
      expect(combatUnlocked).toBe(1); // combat mastery 1 → เฉพาะ Z
      expect(otherUnlocked).toBeGreaterThan(combatUnlocked); // อีกชิ้น mastery สูง → ปลดมากกว่า
    } else {
      // ปิดล็อก → ทั้งคู่ปลดครบทุกท่าที่มี
      expect(combatUnlocked).toBeGreaterThan(1);
      expect(otherUnlocked).toBeGreaterThan(0);
    }
  });

  it('reports mastery gates for the exact item rather than every skill in its category', () => {
    const combat = listSkillGates('style', 'combat');
    const darkStep = listSkillGates('style', 'dark-step');

    expect(combat.map((gate) => gate.name)).toContain('Quick Tackle');
    expect(combat.map((gate) => gate.name)).not.toContain('Flying Kick');
    expect(darkStep.map((gate) => gate.name)).toContain('Flying Kick');
    expect(darkStep.map((gate) => gate.name)).not.toContain('Quick Tackle');
  });
});
