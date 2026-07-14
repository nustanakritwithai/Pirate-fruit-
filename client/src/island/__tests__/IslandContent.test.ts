import { describe, expect, it } from 'vitest';
import { MONSTER_CAMPS, MONSTER_TYPES, BOSS_SPAWNS } from '../../monster/MonsterData';
import { QUEST_DEFINITIONS } from '../../quest/QuestDefinitions';
import { worldHeightAt } from '../IslandRegistry';
import { AZURE_FROST_POI_LIST, MIST_JUNGLE_POI_LIST, SUNSCAR_DESERT_POI_LIST, TEMPEST_SKY_POI_LIST } from '../../world/WorldPOI';
import { AZURE_FROST_NPCS, MIST_JUNGLE_NPCS, SUNSCAR_DESERT_NPCS, TEMPEST_SKY_NPCS } from '../../npc/NPCData';

describe('multi-island content', () => {
  it('places gameplay camps, bosses and NPCs on land', () => {
    for (const camp of MONSTER_CAMPS) {
      expect(MONSTER_TYPES[camp.typeId], camp.id).toBeDefined();
      expect(worldHeightAt(camp.x, camp.z), camp.id).toBeGreaterThan(0.2);
    }
    for (const spawn of BOSS_SPAWNS) {
      expect(MONSTER_TYPES[spawn.typeId], spawn.typeId).toBeDefined();
      expect(worldHeightAt(spawn.x, spawn.z), spawn.typeId).toBeGreaterThan(0.2);
    }
    for (const npc of [...MIST_JUNGLE_NPCS, ...SUNSCAR_DESERT_NPCS, ...AZURE_FROST_NPCS, ...TEMPEST_SKY_NPCS]) {
      expect(worldHeightAt(npc.x, npc.z), npc.id).toBeGreaterThan(0.2);
    }
  });

  it('keeps major frost POIs inside the island or its dock', () => {
    for (const poi of AZURE_FROST_POI_LIST) {
      if (poi.id === 'azure-frost-harbor') continue;
      expect(worldHeightAt(poi.x, poi.z), poi.id).toBeGreaterThan(0.2);
    }
  });

  it('keeps major sky POIs inside the island or its dock', () => {
    for (const poi of TEMPEST_SKY_POI_LIST) {
      if (poi.id === 'tempest-sky-harbor') continue;
      expect(worldHeightAt(poi.x, poi.z), poi.id).toBeGreaterThan(0.2);
    }
  });

  it('keeps major desert POIs inside the island or its dock', () => {
    for (const poi of SUNSCAR_DESERT_POI_LIST) {
      if (poi.id === 'sunscar-desert-harbor') continue;
      expect(worldHeightAt(poi.x, poi.z), poi.id).toBeGreaterThan(0.2);
    }
  });

  it('keeps major jungle POIs inside the island or its dock', () => {
    for (const poi of MIST_JUNGLE_POI_LIST) {
      if (poi.id === 'mist-jungle-harbor') continue;
      expect(worldHeightAt(poi.x, poi.z), poi.id).toBeGreaterThan(0.2);
    }
  });

  it('has valid monster targets for every kill and boss quest', () => {
    for (const quest of QUEST_DEFINITIONS) {
      for (const objective of quest.objectives) {
        if (objective.type !== 'kill' && objective.type !== 'boss') continue;
        expect(MONSTER_TYPES[objective.targetId], `${quest.id}:${objective.targetId}`).toBeDefined();
        if (objective.type === 'boss') {
          expect(MONSTER_TYPES[objective.targetId].kind).toBe('boss');
        }
      }
    }
  });
});
