import type { CastableSkill } from '../../combat/SkillCasting';
import { getSkillGameplay } from '../../combat/skillGameplay';
import type { DevilFruitEffectType } from './DevilFruitInfluenceTypes';
import type { DevilFruitInfluenceWorld } from './DevilFruitInfluenceWorld';

const ID_PREFIX_MAP: Array<[RegExp, DevilFruitEffectType]> = [
  [/magma|flame|fire|phoenix/i, 'fire'],
  [/ice|chill|frozen/i, 'ice'],
  [/lightning|thunder|volt|electric/i, 'lightning'],
  [/wind|gale|tornado|air/i, 'wind'],
  [/dark|shadow|dusk/i, 'darkness'],
  [/light(?!ning)|radiance|solar/i, 'light'],
  [/poison|venom|toxic/i, 'poison'],
  [/quake|earth|seismic/i, 'earthquake'],
  [/smoke|fog|mist|gas/i, 'smoke'],
  [/sand|desert/i, 'sand'],
];

const COLOR_MAP: Array<[number, DevilFruitEffectType]> = [
  [0xff5722, 'fire'],
  [0x74c8ff, 'ice'],
  [0xffeb3b, 'lightning'],
  [0x8bc34a, 'poison'],
  [0x9e9e9e, 'smoke'],
];

export function inferEffectTypeFromSkill(skill: CastableSkill): DevilFruitEffectType | null {
  const record = getSkillGameplay(skill.id);
  const hay = `${skill.id} ${record?.id ?? ''}`.toLowerCase();

  for (const [re, type] of ID_PREFIX_MAP) {
    if (re.test(hay)) return type;
  }

  if (skill.dot) return 'poison';
  if (skill.renderType === 'ground') return 'earthquake';
  if (skill.renderType === 'aoe' && skill.radius >= 8) return 'earthquake';
  if (skill.cc?.some((c) => c.type === 'stun')) return 'lightning';
  if (skill.cc?.some((c) => c.type === 'slow')) return 'ice';

  for (const [color, type] of COLOR_MAP) {
    if ((skill.color & 0xffffff) === color) return type;
  }

  if (skill.category === 'fruit' && skill.damage > 0) {
    return 'fire';
  }

  return null;
}

export function emitSkillInfluence(
  world: DevilFruitInfluenceWorld,
  skill: CastableSkill,
  x: number,
  z: number,
): string | null {
  const type = inferEffectTypeFromSkill(skill);
  if (!type) return null;

  const radiusScale = skill.isUltimate ? 1.35 : 1;
  const strengthScale = skill.isUltimate ? 1.25 : 1;

  return world.spawnEffect({
    type,
    x,
    z,
    radius: (skill.radius || 6) * radiusScale,
    strength: (skill.damage / 40) * strengthScale,
    sourceSkillId: skill.id,
  });
}
