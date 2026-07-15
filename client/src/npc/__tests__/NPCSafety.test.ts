import { describe, expect, it } from 'vitest';
import { ALL_NPCS } from '../NPCData';
import { SAFE_ZONE_POI_LIST } from '../../world/WorldPOI';

describe('NPC safe hubs', () => {
  it('keeps every NPC inside a village or harbor safe zone', () => {
    expect(ALL_NPCS.length).toBeGreaterThan(20);
    for (const npc of ALL_NPCS) {
      const safe = SAFE_ZONE_POI_LIST.some((poi) =>
        Math.hypot(npc.x - poi.x, npc.z - poi.z) <= poi.safeRadius,
      );
      expect(safe, `${npc.id} is outside a safe hub`).toBe(true);
    }
  });

  it('keeps interactive NPCs close to a safe hub after island layout offsets', () => {
    const shops = ALL_NPCS.filter((npc) => npc.action);
    expect(shops.every((npc) => SAFE_ZONE_POI_LIST.some((poi) =>
      Math.hypot(npc.x - poi.x, npc.z - poi.z) <= poi.safeRadius,
    ))).toBe(true);
  });
});
