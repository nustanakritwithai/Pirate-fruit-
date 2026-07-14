import { describe, expect, it, beforeEach, vi } from 'vitest';
import { SimulationController } from '../inspector/SimulationController';
import { SimulationEventBus, resetSimulationEventCounter } from '../inspector/SimulationEventBus';
import { SimulationTimeMachine, formatTimeLabel } from '../inspector/SimulationTimeMachine';
import {
  loadInspectorState,
  saveInspectorState,
  resetInspectorState,
  isValidTab,
  isValidHeatmap,
} from '../inspector/SimulationPersistence';
import { HEATMAP_LABELS, heatmapModesList, INFLUENCE_RING_COLORS } from '../inspector/HeatmapModes';
import { buildLiveCellDetails, cellToDetails } from '../inspector/LiveCellInspector';
import { MonsterCellularWorld } from '../../monster/cellular/MonsterCellularWorld';
import type { SimulationSnapshot } from '../inspector/SimulationInspectorTypes';

function snap(): SimulationSnapshot {
  return {
    at: Date.now(),
    worldTick: 1,
    economyTick: 2,
    monsterTick: 3,
    influenceCount: 4,
    fps: 60,
    frameTimeMs: 16.6,
    memoryMb: 100,
    monsterCount: 10,
    npcCount: 5,
    devilFruitAreas: 2,
    tradeOrders: 3,
    economyPressure: 1,
    monsterStateCounts: { idle: 5, alert: 2 },
    influenceByType: { fire: 1 },
    combatPressure: 1.2,
  };
}

describe('Phase SI1 — Simulation Inspector', () => {
  describe('SimulationController', () => {
    let ctrl: SimulationController;

    beforeEach(() => {
      ctrl = new SimulationController();
    });

    it('SI1-01 defaults not paused speed 1', () => {
      expect(ctrl.paused).toBe(false);
      expect(ctrl.speed).toBe(1);
    });

    it('SI1-02 pause blocks delta', () => {
      ctrl.setPaused(true);
      expect(ctrl.scaleDelta(0.5)).toBe(0);
    });

    it('SI1-03 speed multiplies delta', () => {
      ctrl.setSpeed(5);
      expect(ctrl.scaleDelta(0.1)).toBeCloseTo(0.5);
    });

    it('SI1-04 step tick while paused', () => {
      ctrl.setPaused(true);
      ctrl.requestStep();
      expect(ctrl.scaleDelta(0.016)).toBeCloseTo(0.016);
      expect(ctrl.scaleDelta(0.016)).toBe(0);
    });

    it('SI1-05 freeze economy', () => {
      ctrl.setFreezeEconomy(true);
      expect(ctrl.shouldTick('economy')).toBe(false);
      ctrl.setPaused(true);
      expect(ctrl.shouldTick('economy')).toBe(false);
      ctrl.setPaused(false);
      expect(ctrl.shouldTick('economy')).toBe(false);
    });

    it('SI1-06 freeze monster', () => {
      ctrl.setFreezeMonster(true);
      expect(ctrl.shouldTick('monster')).toBe(false);
    });

    it('SI1-07 freeze devil fruit', () => {
      ctrl.setFreezeDevilFruit(true);
      expect(ctrl.shouldTick('devilfruit')).toBe(false);
    });

    it('SI1-08 speed clamped 100', () => {
      ctrl.setSpeed(500);
      expect(ctrl.speed).toBe(100);
    });

    it('SI1-09 toggle pause', () => {
      ctrl.togglePause();
      expect(ctrl.paused).toBe(true);
      ctrl.togglePause();
      expect(ctrl.paused).toBe(false);
    });

    it('SI1-10 reset clears state', () => {
      ctrl.setPaused(true);
      ctrl.setSpeed(20);
      ctrl.reset();
      expect(ctrl.paused).toBe(false);
      expect(ctrl.speed).toBe(1);
    });

    it('SI1-11 world tick increments', () => {
      ctrl.bumpWorldTick();
      ctrl.bumpWorldTick();
      expect(ctrl.worldTick).toBe(2);
    });

    it('SI1-12 debug colors toggle', () => {
      ctrl.setDebugColors(true);
      expect(ctrl.debugColors).toBe(true);
    });
  });

  describe('SimulationEventBus', () => {
    beforeEach(() => resetSimulationEventCounter());

    it('SI1-13 emits events', () => {
      const bus = new SimulationEventBus();
      const ev = bus.emit('economy', 'shortage rope', 5);
      expect(ev.category).toBe('economy');
      expect(ev.message).toBe('shortage rope');
      expect(ev.tick).toBe(5);
    });

    it('SI1-14 filters by category', () => {
      const bus = new SimulationEventBus();
      bus.emit('economy', 'a');
      bus.emit('monster', 'b');
      expect(bus.getEvents('monster')).toHaveLength(1);
    });

    it('SI1-15 caps event buffer', () => {
      const bus = new SimulationEventBus(3);
      bus.emit('economy', '1');
      bus.emit('economy', '2');
      bus.emit('economy', '3');
      bus.emit('economy', '4');
      expect(bus.size).toBe(3);
      expect(bus.getEvents()[0]!.message).toBe('4');
    });

    it('SI1-16 clear events', () => {
      const bus = new SimulationEventBus();
      bus.emit('quest', 'q');
      bus.clear();
      expect(bus.size).toBe(0);
    });
  });

  describe('SimulationTimeMachine', () => {
    it('SI1-17 captures on interval', () => {
      const tm = new SimulationTimeMachine(60, 1000);
      expect(tm.capture(snap(), 0)).toBe(true);
      expect(tm.capture(snap(), 500)).toBe(false);
      expect(tm.capture(snap(), 1000)).toBe(true);
      expect(tm.length).toBe(2);
    });

    it('SI1-18 scrub position', () => {
      const tm = new SimulationTimeMachine(60, 100);
      for (let i = 0; i < 5; i++) tm.capture({ ...snap(), at: i * 1000 }, i * 100 + 1);
      const oldest = tm.setScrubPosition(1);
      expect(tm.isScrubbing).toBe(true);
      expect(oldest?.at).toBe(0);
    });

    it('SI1-19 clear scrub returns live', () => {
      const tm = new SimulationTimeMachine();
      tm.capture(snap());
      tm.setScrubPosition(0.5);
      tm.clearScrub();
      expect(tm.isScrubbing).toBe(false);
    });

    it('SI1-20 ring buffer max length', () => {
      const tm = new SimulationTimeMachine(2, 1000);
      for (let i = 0; i < 5; i++) tm.capture(snap(), i * 1000);
      expect(tm.length).toBe(2);
    });

    it('SI1-21 timeline labels', () => {
      const tm = new SimulationTimeMachine();
      tm.capture({ ...snap(), at: Date.UTC(2026, 0, 1, 12, 1, 10) });
      const labels = tm.getTimelineLabels();
      expect(labels[0]!.label).toMatch(/12:01:10/);
    });

    it('SI1-22 formatTimeLabel', () => {
      const label = formatTimeLabel(Date.UTC(2026, 6, 14, 9, 5, 3));
      expect(label).toMatch(/\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('SimulationPersistence', () => {
    const storage = new Map<string, string>();

    beforeEach(() => {
      storage.clear();
      vi.stubGlobal('localStorage', {
        getItem: (k: string) => storage.get(k) ?? null,
        setItem: (k: string, v: string) => storage.set(k, v),
        removeItem: (k: string) => storage.delete(k),
      });
    });

    it('SI1-23 load defaults', () => {
      const s = loadInspectorState();
      expect(s.width).toBe(720);
      expect(s.activeTab).toBe('overview');
    });

    it('SI1-24 save and load roundtrip', () => {
      saveInspectorState({ ...loadInspectorState(), x: 99, activeTab: 'combat' });
      const s = loadInspectorState();
      expect(s.x).toBe(99);
      expect(s.activeTab).toBe('combat');
    });

    it('SI1-25 reset panels', () => {
      saveInspectorState({ ...loadInspectorState(), x: 50 });
      const s = resetInspectorState();
      expect(s.x).toBe(24);
      expect(loadInspectorState().x).toBe(24);
    });

    it('SI1-26 valid tab helper', () => {
      expect(isValidTab('monster')).toBe(true);
      expect(isValidTab('nope')).toBe(false);
    });

    it('SI1-27 valid heatmap helper', () => {
      expect(isValidHeatmap('fire-influence')).toBe(true);
      expect(isValidHeatmap('bad')).toBe(false);
    });
  });

  describe('HeatmapModes', () => {
    it('SI1-28 lists all heatmap modes', () => {
      expect(heatmapModesList().length).toBeGreaterThanOrEqual(8);
    });

    it('SI1-29 heatmap labels defined', () => {
      expect(HEATMAP_LABELS['attack-influence']).toBe('Attack Influence');
    });

    it('SI1-30 influence ring colors', () => {
      expect(INFLUENCE_RING_COLORS.attack).toBe('#f44336');
      expect(INFLUENCE_RING_COLORS.smoke).toBe('#9c27b0');
    });
  });

  describe('LiveCellInspector', () => {
    it('SI1-31 builds live cell details', () => {
      const world = new MonsterCellularWorld();
      const fake = {
        alive: true,
        type: { id: 'grunt', maxHp: 100, attackRange: 2, moveSpeed: 4, aggroRange: 10, kind: 'normal' as const },
        hp: 80,
        home: { x: 0, y: 0 },
        group: { position: { x: 1, y: 0, z: 2 } },
      };
      const id = world.bindMonster(fake as never);
      world.cellularUpdate(0, 0);
      const details = buildLiveCellDetails(world, { cellId: id, index: 42 }, 0, 0);
      expect(details?.index).toBe(42);
      expect(details?.currentThought).toBeDefined();
    });

    it('SI1-32 null when cell missing', () => {
      const world = new MonsterCellularWorld();
      expect(buildLiveCellDetails(world, { cellId: 'missing', index: 1 }, 0, 0)).toBeNull();
    });

    it('SI1-33 cellToDetails includes neighbors', () => {
      const world = new MonsterCellularWorld();
      const cell = world.getAllCells();
      expect(cell.length).toBe(0);
      const details = cellToDetails(world, {
        id: 'x', speciesId: 'g', position: { x: 0, z: 0 },
        currentState: 'alert', nextState: 'hunt', hp: 50, maxHp: 100,
        energy: 1, hunger: 0, lastStateChangeTick: 0, homeX: 0, homeZ: 0,
        attackRange: 2, perceptionRadius: 10, moveSpeed: 4, influenceWeight: 1,
      }, 7, 0, 0);
      expect(details.role).toBeDefined();
      expect(details.neighbors.alert).toBe(0);
    });
  });

  describe('Integration guards', () => {
    it('SI1-34 time machine no leak on clear', () => {
      const tm = new SimulationTimeMachine(60, 100);
      for (let i = 0; i < 100; i++) tm.capture(snap(), i * 100);
      tm.clear();
      expect(tm.length).toBe(0);
    });

    it('SI1-35 event bus unique ids', () => {
      resetSimulationEventCounter();
      const bus = new SimulationEventBus();
      const a = bus.emit('combat', 'a');
      const b = bus.emit('combat', 'b');
      expect(a.id).not.toBe(b.id);
    });

    it('SI1-36 controller step consumed once', () => {
      const ctrl = new SimulationController();
      ctrl.setPaused(true);
      ctrl.requestStep();
      expect(ctrl.shouldTick('economy')).toBe(true);
      ctrl.consumeStep();
      expect(ctrl.shouldTick('economy')).toBe(false);
    });

    it('SI1-37 speed minimum clamp', () => {
      const ctrl = new SimulationController();
      ctrl.setSpeed(0);
      expect(ctrl.speed).toBeGreaterThanOrEqual(0.1);
    });

    it('SI1-38 all inspector tabs valid', () => {
      for (const tab of ['overview', 'economy', 'monster', 'devilfruit', 'combat', 'world', 'performance', 'settings']) {
        expect(isValidTab(tab)).toBe(true);
      }
    });

    it('SI1-39 active snapshot newest first', () => {
      const tm = new SimulationTimeMachine(60, 100);
      tm.capture({ ...snap(), economyTick: 1 }, 1);
      tm.capture({ ...snap(), economyTick: 2 }, 200);
      expect(tm.activeSnapshot?.economyTick).toBe(2);
    });

    it('SI1-40 scrub clamped 0-1', () => {
      const tm = new SimulationTimeMachine();
      tm.capture(snap());
      tm.setScrubPosition(-1);
      tm.setScrubPosition(2);
      expect(tm.isScrubbing).toBe(true);
    });

    it('SI1-41 persistence corrupt json fallback', () => {
      vi.stubGlobal('localStorage', {
        getItem: () => '{bad',
        setItem: () => {},
        removeItem: () => {},
      });
      expect(loadInspectorState().height).toBe(520);
    });

    it('SI1-42 heatmap none label', () => {
      expect(HEATMAP_LABELS.none).toBe('Off');
    });
  });
});
