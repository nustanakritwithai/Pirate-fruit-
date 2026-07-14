import {
  DEFAULT_PERSISTED,
  type SimulationInspectorPersisted,
  type SimulationInspectorTab,
  type HeatmapMode,
} from './SimulationInspectorTypes';

const STORAGE_KEY = 'pirate-fruit:sim-inspector:v1';

export function loadInspectorState(): SimulationInspectorPersisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PERSISTED };
    const parsed = JSON.parse(raw) as Partial<SimulationInspectorPersisted>;
    return {
      ...DEFAULT_PERSISTED,
      ...parsed,
    };
  } catch {
    return { ...DEFAULT_PERSISTED };
  }
}

export function saveInspectorState(state: SimulationInspectorPersisted): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota / private mode */
  }
}

export function resetInspectorState(): SimulationInspectorPersisted {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_PERSISTED };
}

export function isValidTab(tab: string): tab is SimulationInspectorTab {
  return [
    'overview',
    'economy',
    'monster',
    'devilfruit',
    'combat',
    'world',
    'performance',
    'settings',
  ].includes(tab);
}

export function isValidHeatmap(mode: string): mode is HeatmapMode {
  return [
    'none',
    'monster-density',
    'alert-influence',
    'attack-influence',
    'fire-influence',
    'smoke-density',
    'economy-pressure',
    'trade-routes',
    'quest-areas',
  ].includes(mode);
}
