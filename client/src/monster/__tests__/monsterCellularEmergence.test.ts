import { describe, expect, it, beforeEach } from 'vitest';
import {
  MonsterRegistry,
  resetMonsterCellCounter,
  SpatialGrid,
  runCellularTick,
  type MonsterCell,
  type MonsterThoughtState,
} from '../cellular';

function cell(
  id: string,
  x: number,
  z: number,
  state: MonsterThoughtState = 'idle',
  overrides: Partial<MonsterCell> = {},
): MonsterCell {
  return {
    id,
    speciesId: 'grunt',
    position: { x, z },
    currentState: state,
    nextState: state,
    hp: 100,
    maxHp: 100,
    energy: 0.8,
    hunger: 0.2,
    lastStateChangeTick: 0,
    homeX: x,
    homeZ: z,
    attackRange: 2.5,
    perceptionRadius: 12,
    moveSpeed: 4,
    influenceWeight: 1,
    ...overrides,
  };
}

function registerPack(
  reg: MonsterRegistry,
  cells: MonsterCell[],
): SpatialGrid {
  const grid = new SpatialGrid(6);
  for (const c of cells) reg.register(c);
  return grid;
}

function countState(reg: MonsterRegistry, state: MonsterThoughtState): number {
  return reg.getAll().filter((c) => c.currentState === state).length;
}

describe('Phase M1 — Cellular Emergence Playtests', () => {
  beforeEach(() => {
    resetMonsterCellCounter();
  });

  it('E1. player enters pack — idle → alert → hunt wave propagates', () => {
    const reg = new MonsterRegistry();
    const pack = [
      cell('a', 0, 0, 'idle'),
      cell('b', 3, 0, 'idle'),
      cell('c', 6, 0, 'hunt'),
      cell('d', 9, 0, 'hunt'),
      cell('e', 12, 0, 'idle'),
    ];
    const grid = registerPack(reg, pack);
    let sawAlert = false;
    let sawHunt = false;

    for (let t = 0; t < 16; t++) {
      const px = Math.min(t * 1.2, 6);
      runCellularTick(reg, grid, { playerX: px, playerZ: 0 }, t + 1);
      if (countState(reg, 'alert') >= 2) sawAlert = true;
      if (countState(reg, 'hunt') >= 1) sawHunt = true;
    }

    expect(sawAlert).toBe(true);
    expect(sawHunt).toBe(true);
  });

  it('E2. deaths trigger flee then regroup without leader script', () => {
    const reg = new MonsterRegistry();
    const pack = [
      cell('a', 0, 0, 'hunt'),
      cell('b', 3, 0, 'hunt'),
      cell('c', 6, 0, 'hunt'),
      cell('d', 3, 3, 'hunt'),
      cell('dead1', 1, 1, 'dead', { hp: 0 }),
      cell('dead2', 5, 1, 'dead', { hp: 0 }),
    ];
    const grid = registerPack(reg, pack);
    let sawFlee = false;
    let sawRegroup = false;

    for (let t = 0; t < 20; t++) {
      runCellularTick(reg, grid, { playerX: 80, playerZ: 80 }, t + 1);
      if (countState(reg, 'flee') >= 1) sawFlee = true;
      if (countState(reg, 'regroup') >= 1) sawRegroup = true;
    }

    expect(sawFlee).toBe(true);
    expect(sawRegroup).toBe(true);
  });

  it('E3. player retreats — attack pack calms toward idle', () => {
    const reg = new MonsterRegistry();
    const pack = [
      cell('a', 0, 0, 'attack'),
      cell('b', 3, 0, 'attack'),
      cell('c', 6, 0, 'hunt'),
      cell('d', 9, 0, 'alert'),
    ];
    const grid = registerPack(reg, pack);
    const startAggro = countState(reg, 'attack') + countState(reg, 'hunt');

    for (let t = 0; t < 24; t++) {
      runCellularTick(reg, grid, { playerX: 200, playerZ: 200 }, t + 1);
    }

    const endAggro = countState(reg, 'attack') + countState(reg, 'hunt');
    const endCalm = countState(reg, 'idle') + countState(reg, 'regroup') + countState(reg, 'alert');
    expect(startAggro).toBeGreaterThan(0);
    expect(endAggro).toBeLessThan(startAggro);
    expect(endCalm).toBeGreaterThan(0);
  });

  it('E4. two packs respond independently — no cross-pack broadcast', () => {
    const reg = new MonsterRegistry();
    const packA = [
      cell('a1', 0, 0, 'idle'),
      cell('a2', 3, 0, 'idle'),
      cell('a3', 6, 0, 'alert'),
    ];
    const packB = [
      cell('b1', 200, 200, 'idle'),
      cell('b2', 203, 200, 'idle'),
      cell('b3', 206, 200, 'idle'),
    ];
    const grid = registerPack(reg, [...packA, ...packB]);
    const packBBefore = packB.map((c) => reg.get(c.id)!.currentState);

    for (let t = 0; t < 10; t++) {
      runCellularTick(reg, grid, { playerX: 2, playerZ: 0 }, t + 1);
    }

    const packBAfter = packB.map((c) => reg.get(c.id)!.currentState);
    const packAChanged = countState(reg, 'alert') + countState(reg, 'hunt') > 1;
    const packBUnchanged = packBAfter.every((s, i) => s === packBBefore[i]);

    expect(packAChanged).toBe(true);
    expect(packBUnchanged).toBe(true);
  });

  it('E5. 100 monsters — spatial grid keeps tick time low', () => {
    const reg = new MonsterRegistry();
    const cells: MonsterCell[] = [];
    for (let i = 0; i < 100; i++) {
      const row = Math.floor(i / 10);
      const col = i % 10;
      cells.push(cell(`m${i}`, col * 4, row * 4, i % 3 === 0 ? 'alert' : 'idle'));
    }
    const grid = registerPack(reg, cells);
    let maxTickMs = 0;

    for (let t = 0; t < 50; t++) {
      const r = runCellularTick(reg, grid, { playerX: 18, playerZ: 18 }, t + 1);
      maxTickMs = Math.max(maxTickMs, r.durationMs);
      expect(Number.isFinite(r.durationMs)).toBe(true);
    }

    expect(maxTickMs).toBeLessThan(50);
    expect(reg.size).toBe(100);
  });

  it('E6. boss influence amplifies wake wave without leader script', () => {
    const reg = new MonsterRegistry();
    const pack = [
      cell('grunt1', 0, 0, 'idle'),
      cell('grunt2', 4, 0, 'idle'),
      cell('boss', 8, 0, 'alert', {
        speciesId: 'boss',
        influenceWeight: 2,
        perceptionRadius: 14,
      }),
    ];
    const grid = registerPack(reg, pack);

    runCellularTick(reg, grid, { playerX: 0, playerZ: 0 }, 1);
    runCellularTick(reg, grid, { playerX: 0, playerZ: 0 }, 2);

    const grunt1 = reg.get('grunt1')!;
    expect(['alert', 'hunt']).toContain(grunt1.currentState);
  });
});
