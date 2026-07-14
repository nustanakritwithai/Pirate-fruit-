import type { HeatmapMode } from './SimulationInspectorTypes';

export const HEATMAP_LABELS: Record<HeatmapMode, string> = {
  none: 'Off',
  'monster-density': 'Monster Density',
  'alert-influence': 'Alert Influence',
  'attack-influence': 'Attack Influence',
  'fire-influence': 'Fire Influence',
  'smoke-density': 'Smoke Density',
  'economy-pressure': 'Economy Pressure',
  'trade-routes': 'Trade Routes',
  'quest-areas': 'Quest Areas',
};

export const HEATMAP_COLORS: Partial<Record<HeatmapMode, string>> = {
  'alert-influence': '#ffeb3b',
  'attack-influence': '#f44336',
  'fire-influence': '#ff9800',
  'smoke-density': '#9c27b0',
  'monster-density': '#4caf50',
  'economy-pressure': '#00bcd4',
  'trade-routes': '#8bc34a',
  'quest-areas': '#e91e63',
};

export const INFLUENCE_RING_COLORS = {
  attack: '#f44336',
  alert: '#ffeb3b',
  flee: '#2196f3',
  fire: '#ff9800',
  smoke: '#9c27b0',
} as const;

export function heatmapModesList(): HeatmapMode[] {
  return Object.keys(HEATMAP_LABELS) as HeatmapMode[];
}
