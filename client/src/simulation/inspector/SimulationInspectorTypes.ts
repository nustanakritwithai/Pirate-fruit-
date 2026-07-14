import type { LivingTradeSimulator } from '../../trade/living/LivingTradeSimulator';
import type { MonsterCellularWorld } from '../../monster/cellular/MonsterCellularWorld';
import type { DevilFruitInfluenceWorld } from '../../devilfruit/influence/DevilFruitInfluenceWorld';
import type { MonsterManager } from '../../monster/MonsterManager';
import type { Game } from '../../engine/Game';
import type { QuestManager } from '../../quest/QuestManager';

export type SimulationInspectorTab =
  | 'overview'
  | 'economy'
  | 'monster'
  | 'devilfruit'
  | 'combat'
  | 'world'
  | 'performance'
  | 'settings';

export type SimulationEventCategory =
  | 'economy'
  | 'monster'
  | 'devilfruit'
  | 'combat'
  | 'quest';

export interface SimulationEvent {
  id: string;
  at: number;
  tick?: number;
  category: SimulationEventCategory;
  message: string;
}

export type HeatmapMode =
  | 'none'
  | 'monster-density'
  | 'alert-influence'
  | 'attack-influence'
  | 'fire-influence'
  | 'smoke-density'
  | 'economy-pressure'
  | 'trade-routes'
  | 'quest-areas';

export interface SimulationSnapshot {
  at: number;
  worldTick: number;
  economyTick: number;
  monsterTick: number;
  influenceCount: number;
  fps: number;
  frameTimeMs: number;
  memoryMb: number;
  monsterCount: number;
  npcCount: number;
  devilFruitAreas: number;
  tradeOrders: number;
  economyPressure: number;
  monsterStateCounts: Record<string, number>;
  influenceByType: Record<string, number>;
  combatPressure: number;
}

export interface SimulationInspectorDeps {
  living: LivingTradeSimulator;
  cellularWorld: MonsterCellularWorld;
  devilFruitInfluence: DevilFruitInfluenceWorld;
  monsterManager: MonsterManager;
  game: Game;
  questManager?: QuestManager;
  npcCount: () => number;
  playerPosition: () => { x: number; z: number };
}

export interface SimulationInspectorPersisted {
  x: number;
  y: number;
  width: number;
  height: number;
  collapsed: boolean;
  activeTab: SimulationInspectorTab;
  heatmap: HeatmapMode;
  influenceOverlay: boolean;
  selectMode: boolean;
}

export const DEFAULT_PERSISTED: SimulationInspectorPersisted = {
  x: 24,
  y: 48,
  width: 720,
  height: 520,
  collapsed: false,
  activeTab: 'overview',
  heatmap: 'none',
  influenceOverlay: false,
  selectMode: false,
};

export const INSPECTOR_TABS: readonly SimulationInspectorTab[] = [
  'overview',
  'economy',
  'monster',
  'devilfruit',
  'combat',
  'world',
  'performance',
  'settings',
] as const;

export const TAB_LABELS: Record<SimulationInspectorTab, string> = {
  overview: 'Overview',
  economy: 'Economy',
  monster: 'Monster',
  devilfruit: 'Devil Fruit',
  combat: 'Combat',
  world: 'World',
  performance: 'Performance',
  settings: 'Settings',
};
