import { addPressure } from '../../trade/living/GenomePressureStore';
import type { EconomyCellId, EconomyWorldState } from '../../trade/living/types';
import { CELL_TO_GAME_ISLAND } from '../../trade/living/LivingTradeConfig';
import { DEVIL_FRUIT_INFLUENCE_CONFIG } from './DevilFruitInfluenceConfig';
import type { DevilFruitInfluenceWorld } from './DevilFruitInfluenceWorld';

/** Map world XZ to nearest economy cell — simplified island centers */
const CELL_ANCHORS: Array<{ cellId: EconomyCellId; x: number; z: number }> = [
  { cellId: 'leaf-island', x: 0, z: 0 },
  { cellId: 'mine-island', x: 180, z: 0 },
  { cellId: 'cloth-island', x: 90, z: -120 },
  { cellId: 'shipyard-island', x: -40, z: 30 },
];

function nearestCellId(x: number, z: number): EconomyCellId {
  let best = CELL_ANCHORS[0];
  let bestD = Infinity;
  for (const a of CELL_ANCHORS) {
    const d = Math.hypot(x - a.x, z - a.z);
    if (d < bestD) {
      bestD = d;
      best = a;
    }
  }
  return best.cellId;
}

/** DF1 — economy reacts via genome pressure, never direct stock mutation */
export function applyDevilFruitEconomyPressures(
  world: EconomyWorldState,
  influenceWorld: DevilFruitInfluenceWorld,
): number {
  let count = 0;
  for (const anchor of CELL_ANCHORS) {
    const sample = influenceWorld.sampleAt(anchor.x, anchor.z);
    const cellId = anchor.cellId;
    if (!CELL_TO_GAME_ISLAND[cellId]) continue;

    if (sample.fire >= DEVIL_FRUIT_INFLUENCE_CONFIG.fireFleeThreshold) {
      addPressure(world, {
        cellId,
        source: 'environment',
        target: 'production-bias',
        commodityId: 'hardwood',
        strength: DEVIL_FRUIT_INFLUENCE_CONFIG.fireWoodPressure * Math.min(1, sample.fire / 3),
        sourceReferenceId: 'df1:fire',
      });
      count += 1;
    }

    if (sample.smoke >= 1) {
      addPressure(world, {
        cellId,
        source: 'environment',
        target: 'industrialization',
        strength: DEVIL_FRUIT_INFLUENCE_CONFIG.smokeProductivityPressure * Math.min(1, sample.smoke / 3),
        sourceReferenceId: 'df1:smoke',
      });
      count += 1;
    }

    if (sample.earthquake >= 1.2) {
      addPressure(world, {
        cellId,
        source: 'environment',
        target: 'production-bias',
        strength: DEVIL_FRUIT_INFLUENCE_CONFIG.earthquakeFactoryPressure * Math.min(1, sample.earthquake / 3),
        sourceReferenceId: 'df1:earthquake',
      });
      count += 1;
    }
  }

  void nearestCellId;
  return count;
}