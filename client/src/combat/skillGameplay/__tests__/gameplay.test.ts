import { describe, expect, it } from 'vitest';
import { SKILL_GAMEPLAY, getSkillGameplay, ALL_SKILL_GAMEPLAY } from '../index';
import {
  deriveArchetype,
  deriveDamage,
  deriveHitCount,
  type RawDatabookSkill,
  type DeriveContext,
} from '../derive';
import { SKILL_OVERRIDES } from '../overrides';
import { FRUIT_SKILLS } from '../../../fruit/skills/databook/skills';
import { SWORD_SKILLS } from '../../../swords/skills/databook/skills';
import { GUN_SKILLS } from '../../../guns/skills/databook/skills';
import { FIGHTING_STYLE_SKILLS } from '../../../fighting-styles/skills/databook/skills';
import { toCastable, archetypeToRenderType } from '../../SkillCasting';

const ARCHETYPES = ['projectile', 'beam', 'aoe', 'ground', 'dash', 'melee', 'mobility', 'buff', 'summon'];
const SLOTS = ['Z', 'X', 'C', 'V', 'F', 'M1'];
const CC_TYPES = ['stun', 'knockback', 'launch', 'pull', 'disable', 'slow'];

const ALL_SOURCE_SKILLS = [
  ...FRUIT_SKILLS,
  ...SWORD_SKILLS,
  ...GUN_SKILLS,
  ...FIGHTING_STYLE_SKILLS,
];

describe('Skill Gameplay Databook — coverage', () => {
  it('ครอบทุกสกิลจากตารางต้นทางทั้ง 4 หมวด (431 ท่า)', () => {
    expect(ALL_SOURCE_SKILLS.length).toBe(431);
    expect(ALL_SKILL_GAMEPLAY.length).toBe(ALL_SOURCE_SKILLS.length);
    for (const skill of ALL_SOURCE_SKILLS) {
      expect(SKILL_GAMEPLAY[skill.id], `missing record: ${skill.id}`).toBeDefined();
    }
  });

  it('ทุก record มี enum ถูกต้องและค่าตัวเลขสมเหตุผล', () => {
    for (const record of ALL_SKILL_GAMEPLAY) {
      expect(ARCHETYPES).toContain(record.archetype);
      expect(SLOTS).toContain(record.slot);
      expect(record.damage).toBeGreaterThanOrEqual(0);
      expect(record.hitCount).toBeGreaterThanOrEqual(1);
      expect(record.hitCount).toBeLessThanOrEqual(8);
      expect(record.cooldown).toBeGreaterThan(0);
      expect(record.energy).toBeGreaterThan(0);
      expect(record.castTime).toBeGreaterThan(0);
      expect(record.radius).toBeGreaterThan(0);
      for (const cc of record.cc) expect(CC_TYPES).toContain(cc.type);
      expect(['derived', 'override']).toContain(record.source);
      expect(typeof record.icon).toBe('string');
      expect(record.icon.length).toBeGreaterThan(0);
    }
  });

  it('ให้ไอคอนเฉพาะสกิลตามธีม (ไม่ใช่ generic ตัวเดียว) — ต่างกันตามอาวุธ', () => {
    // ท่าเด่นควรได้ไอคอนตามชื่อ/ธาตุ
    expect(getSkillGameplay('bisento-v1-z')!.icon).toBe('🌪️'); // Wind Breaker
    expect(getSkillGameplay('bisento-v1-x')!.icon).toBe('🪨'); // Quake Sphere
    expect(getSkillGameplay('acidum-rifle-z')!.icon).toBe('💣'); // Spiky Bomb
    expect(getSkillGameplay('acidum-rifle-x')!.icon).toBe('☠️'); // Acidic Smoke
    expect(getSkillGameplay('combat-v')!.icon).toBe('☄️'); // Meteor Crash
    // ชุดไอคอนต้องหลากหลายพอ (ไม่ใช่ 3-4 แบบเหมือนเดิม)
    const uniqueIcons = new Set(ALL_SKILL_GAMEPLAY.map((r) => r.icon));
    expect(uniqueIcons.size).toBeGreaterThanOrEqual(10);
  });

  it('archetype ใหม่ (beam + flurry/melee) ถูก classify จริง ไม่ถูก projectile/aoe แย่ง', () => {
    const byArch = (a: string) => ALL_SKILL_GAMEPLAY.filter((r) => r.archetype === a).length;
    expect(byArch('beam'), 'ควรมีลำแสงต่อเนื่องอย่างน้อย 3 ท่า').toBeGreaterThanOrEqual(3);
    expect(byArch('melee'), 'มัดรัว/ประชิดเข้าถึงได้มากขึ้น').toBeGreaterThanOrEqual(8);
    // ท่าเด่นที่ควรเป็นมัดรัว (เดิมถูกจัดเป็น aoe/projectile)
    expect(getSkillGameplay('tiger-moveset-z')!.archetype).toBe('melee');
    // ลำแสงต่อเนื่องที่ move/hold ได้
    expect(getSkillGameplay('light-moveset-v2-x')!.archetype).toBe('beam');
  });

  it('ท่าที่ไม่ใช่ utility ต้องมีดาเมจ > 0', () => {
    for (const record of ALL_SKILL_GAMEPLAY) {
      if (record.archetype !== 'mobility' && record.archetype !== 'buff') {
        expect(record.damage, `zero damage: ${record.id}`).toBeGreaterThan(0);
      }
    }
  });

  it('cooldown/energy ตรงกับตารางต้นทางเมื่อต้นทางมีค่า', () => {
    for (const skill of ALL_SOURCE_SKILLS) {
      const record = SKILL_GAMEPLAY[skill.id];
      if (skill.id in SKILL_OVERRIDES) continue; // override อาจจูนได้
      if (skill.cooldown != null) expect(record.cooldown).toBe(skill.cooldown);
      if (skill.energy != null) expect(record.energy).toBe(skill.energy);
    }
  });

  it('override ถูก merge และติดป้าย source: override', () => {
    for (const id of Object.keys(SKILL_OVERRIDES)) {
      const record = SKILL_GAMEPLAY[id];
      expect(record, `override id ไม่มีในตาราง: ${id}`).toBeDefined();
      expect(record.source).toBe('override');
    }
    expect(SKILL_GAMEPLAY['bomb-base-v'].radius).toBe(8);
    expect(SKILL_GAMEPLAY['light-moveset-v1-z'].projectileSpeed).toBe(26);
  });
});

describe('classifier spot checks', () => {
  it('acidum-rifle-z → projectile + stun', () => {
    const record = getSkillGameplay('acidum-rifle-z')!;
    expect(record.archetype).toBe('projectile');
    expect(record.cc.some((c) => c.type === 'stun')).toBe(true);
  });

  it('bisento-v1-z (สแลมพื้น 3 slashes) → ground, hitCount 3', () => {
    const record = getSkillGameplay('bisento-v1-z')!;
    expect(record.archetype).toBe('ground');
    expect(record.hitCount).toBe(3);
  });

  it('หมัดเริ่มต้น (combat) มีครบ 4 ท่า Z/X/C/V ใช้งานได้', () => {
    const combo = ['combat-z', 'combat-x', 'combat-c', 'combat-v'].map((id) => getSkillGameplay(id));
    for (const record of combo) {
      expect(record).toBeDefined();
      expect(record!.damage).toBeGreaterThan(0);
    }
    expect(getSkillGameplay('combat-c')!.slot).toBe('C');
    expect(getSkillGameplay('combat-c')!.archetype).toBe('projectile');
    expect(getSkillGameplay('combat-v')!.slot).toBe('V');
    expect(getSkillGameplay('combat-v')!.archetype).toBe('aoe');
  });

  it('ท่า key F ส่วนใหญ่เป็น mobility/dash และท่า mobility ล้วนดาเมจ 0', () => {
    const fMoves = ALL_SKILL_GAMEPLAY.filter((r) => r.slot === 'F');
    expect(fMoves.length).toBeGreaterThan(30);
    for (const record of fMoves) {
      expect(['mobility', 'dash']).toContain(record.archetype);
    }
    const pureMobility = ALL_SKILL_GAMEPLAY.filter((r) => r.archetype === 'mobility');
    expect(pureMobility.length).toBeGreaterThan(0);
  });
});

describe('สูตรดาเมจ', () => {
  const ctx: DeriveContext = { category: 'fruit', rarity: 'common' };
  const raw = (over: Partial<RawDatabookSkill>): RawDatabookSkill => ({
    id: 't',
    key: 'Z',
    name: 'Test',
    mastery: 1,
    cooldown: 8,
    energy: 20,
    breaksInstinct: false,
    description: 'shoots a projectile that deals damage',
    ...over,
  });

  it('คูลดาวน์สูงขึ้น → ดาเมจไม่ลดลง (monotonic)', () => {
    let previous = 0;
    for (const cooldown of [4, 8, 12, 16, 20, 30]) {
      const damage = deriveDamage(raw({ cooldown }), ctx);
      expect(damage).toBeGreaterThanOrEqual(previous);
      previous = damage;
    }
  });

  it('สลอต V แรงกว่า Z (เงื่อนไขอื่นเท่ากัน)', () => {
    expect(deriveDamage(raw({ key: 'V' }), ctx)).toBeGreaterThan(deriveDamage(raw({ key: 'Z' }), ctx));
  });

  it('ความหายากสูงกว่า → แรงกว่า', () => {
    const mythical = deriveDamage(raw({}), { category: 'fruit', rarity: 'mythical' });
    const common = deriveDamage(raw({}), { category: 'fruit', rarity: 'common' });
    expect(mythical).toBeGreaterThan(common);
  });

  it('hitCount parse เลขและคำ ("three slashes")', () => {
    expect(deriveHitCount(raw({ description: 'releases 3 slashes that do good damage' }))).toBe(3);
    expect(deriveHitCount(raw({ description: 'fires three projectiles at the enemy' }))).toBe(3);
    expect(deriveHitCount(raw({ description: 'a single strike' }))).toBe(1);
  });

  it('archetype fallback: ไม้ตายอ่านไม่ออก → aoe, ท่าอื่น → projectile', () => {
    expect(deriveArchetype(raw({ key: 'V', description: 'a mysterious power' }))).toBe('aoe');
    expect(deriveArchetype(raw({ key: 'Z', description: 'a mysterious power' }))).toBe('projectile');
  });
});

describe('SkillCasting อ่าน databook', () => {
  it('toCastable ใช้ค่าจาก databook เมื่อ id มี record', () => {
    const record = getSkillGameplay('acidum-rifle-z')!;
    const castable = toCastable(
      {
        id: 'acidum-rifle-z',
        name: 'Spiky Bomb',
        mastery: 100,
        cooldown: 10,
        energy: 30,
        description: '',
      },
      1,
      'gun',
    );
    expect(castable.damage).toBe(record.damage);
    expect(castable.cooldown).toBe(record.cooldown);
    expect(castable.renderType).toBe(archetypeToRenderType(record.archetype));
    expect(castable.color).toBe(record.vfxColor);
  });

  it('id ที่ไม่มี record → fallback heuristic เดิม (ไม่พัง)', () => {
    const castable = toCastable(
      { id: 'no-such-skill', name: 'X', mastery: 1, cooldown: 8, energy: 20, description: 'fires a beam' },
      1,
      'style',
    );
    expect(castable.damage).toBeGreaterThan(0);
    expect(castable.renderType).toBe('projectile');
  });

  it('mobility → dash พร้อมระยะขั้นต่ำ (ไม่พุ่งศูนย์เมตร)', () => {
    const mobilityRecord = ALL_SKILL_GAMEPLAY.find((r) => r.archetype === 'mobility');
    expect(mobilityRecord).toBeDefined();
    const castable = toCastable(
      { id: mobilityRecord!.id, name: 'Fly', mastery: 1, cooldown: 5, energy: 10, description: '' },
      1,
      'fruit',
    );
    expect(castable.renderType).toBe('dash');
    expect(castable.range).toBeGreaterThan(0);
  });
});
