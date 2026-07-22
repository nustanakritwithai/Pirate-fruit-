import { describe, expect, it } from 'vitest';
import { ALL_NPCS } from '../NPCData';
import { findDockAt } from '../../island/IslandRegistry';
import { SAFE_ZONE_POI_LIST } from '../../world/WorldPOI';
import { isWorldSafeZone } from '@pirate-fruit/shared';

describe('NPC safe hubs', () => {
  it('keeps one starter trade NPC at the harbor', () => {
    const starterTradeNpcs = ALL_NPCS.filter((npc) =>
      npc.islandId === 'starter-island' && npc.action === 'trade-shop',
    );
    expect(starterTradeNpcs).toHaveLength(1);
    expect(starterTradeNpcs[0]).toMatchObject({ id: 'shipwright-mek', dockId: 'starter-harbor' });
    expect(findDockAt(starterTradeNpcs[0]!.x, starterTradeNpcs[0]!.z)?.id).toBe('starter-harbor');
  });

  it('keeps every NPC inside a village or harbor safe zone', () => {
    expect(ALL_NPCS.length).toBeGreaterThan(20);
    for (const npc of ALL_NPCS) {
      const safe = SAFE_ZONE_POI_LIST.some((poi) =>
        Math.hypot(npc.x - poi.x, npc.z - poi.z) <= poi.safeRadius,
      );
      expect(safe, `${npc.id} is outside a safe hub`).toBe(true);
      expect(isWorldSafeZone(npc.islandId, npc.x, npc.z), `${npc.id} missing from shared safe-zone authority`).toBe(true);
    }
  });

  it('keeps interactive NPCs close to a safe hub after island layout offsets', () => {
    const shops = ALL_NPCS.filter((npc) => npc.action);
    expect(shops.every((npc) => SAFE_ZONE_POI_LIST.some((poi) =>
      Math.hypot(npc.x - poi.x, npc.z - poi.z) <= poi.safeRadius,
    ))).toBe(true);
  });

  it('keeps nearby NPC nameplates far enough apart to remain readable', () => {
    for (let left = 0; left < ALL_NPCS.length; left++) {
      for (let right = left + 1; right < ALL_NPCS.length; right++) {
        const a = ALL_NPCS[left]!;
        const b = ALL_NPCS[right]!;
        if (a.islandId !== b.islandId) continue;
        const distance = Math.hypot(a.x - b.x, a.z - b.z);
        expect(distance, `${a.id} overlaps ${b.id}`).toBeGreaterThanOrEqual(3.2);
      }
    }
  });
});
