import { describe, expect, it } from 'vitest';
import { MONSTER_TYPES } from '../../monster/MonsterData';
import { ALL_NPCS } from '../../npc/NPCData';
import {
  pirateAssetForMonster,
  pirateAssetForNPC,
} from '../PirateAssetLibrary';

describe('Quaternius character asset mappings', () => {
  it('maps every current monster type to an animated GLB asset', () => {
    const missing = Object.values(MONSTER_TYPES)
      .filter((monster) => pirateAssetForMonster(monster) === null)
      .map((monster) => monster.id);

    expect(missing).toEqual([]);
  });

  it('uses biome creature families for all island monster groups', () => {
    expect(pirateAssetForMonster(MONSTER_TYPES.crab)?.id).toBe('spider');
    expect(pirateAssetForMonster(MONSTER_TYPES['ruin-guardian'])?.id).toBe('mushroom-king');
    expect(pirateAssetForMonster(MONSTER_TYPES['sun-guardian-boss'])?.id).toBe('goleling-evolved');
    expect(pirateAssetForMonster(MONSTER_TYPES['frost-king-boss'])?.id).toBe('yeti');
    expect(pirateAssetForMonster(MONSTER_TYPES['tempest-lord-boss'])?.id).toBe('hywirl');
    expect(pirateAssetForMonster(MONSTER_TYPES['magma-titan-boss'])?.id).toBe('demon');
  });

  it('selects deterministic visual variants for repeated camp spawns', () => {
    const variants = new Set([
      pirateAssetForMonster(MONSTER_TYPES['jungle-bandit'], 0)?.id,
      pirateAssetForMonster(MONSTER_TYPES['jungle-bandit'], 1)?.id,
      pirateAssetForMonster(MONSTER_TYPES['jungle-bandit'], 2)?.id,
    ]);

    expect(variants.size).toBe(3);
    const seeded = pirateAssetForMonster(MONSTER_TYPES['jungle-bandit'], 1)?.id;
    expect(seeded).toBe(pirateAssetForMonster(MONSTER_TYPES['jungle-bandit'], 1)?.id);
  });

  it('maps every current NPC while preserving a shared animated rig palette', () => {
    const allowed = new Set(['anne', 'henry', 'mako', 'pirate-captain']);
    const mapped = ALL_NPCS.map((npc) => pirateAssetForNPC(npc));

    expect(mapped).toHaveLength(ALL_NPCS.length);
    expect(mapped.every((selection) => allowed.has(selection.id))).toBe(true);
    expect(mapped.every((selection) => selection.baseHeight > 0)).toBe(true);
  });
});
