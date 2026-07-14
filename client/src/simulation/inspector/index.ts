import { createSimulationInspector, type SimulationInspectorHandle } from './SimulationInspector';
import type { SimulationInspectorDeps } from './SimulationInspectorTypes';

export type { SimulationInspectorHandle, SimulationInspectorDeps };
export { createSimulationInspector };
export { SimulationController } from './SimulationController';
export { SimulationEventBus, resetSimulationEventCounter } from './SimulationEventBus';
export { SimulationTimeMachine, formatTimeLabel } from './SimulationTimeMachine';
export { loadInspectorState, saveInspectorState, resetInspectorState } from './SimulationPersistence';
export { HEATMAP_LABELS, INFLUENCE_RING_COLORS, heatmapModesList } from './HeatmapModes';
export { buildLiveCellDetails, renderLiveCellHtml } from './LiveCellInspector';

export function initSimulationInspector(deps: SimulationInspectorDeps): SimulationInspectorHandle {
  return createSimulationInspector(deps);
}
