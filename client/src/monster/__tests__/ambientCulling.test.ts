import { describe, expect, it } from 'vitest';
import { ISLANDS } from '../../island/IslandRegistry';
import { ambientMonsterCountForIsland } from '../MonsterManager';

describe('offline ambient monster island culling', () => {
  it('materializes one island-sized population instead of every island at boot', () => {
    const perIsland = ISLANDS.map((island) => ambientMonsterCountForIsland(island.id, 'high'));
    const starter = ambientMonsterCountForIsland('starter-island', 'high');

    expect(starter).toBeGreaterThan(0);
    expect(starter).toBeLessThan(perIsland.reduce((total, count) => total + count, 0));
    expect(Math.max(...perIsland)).toBeLessThan(25);
  });

  it('preserves the existing low-tier population reduction per active island', () => {
    expect(ambientMonsterCountForIsland('ember-volcano', 'low'))
      .toBeLessThan(ambientMonsterCountForIsland('ember-volcano', 'high'));
  });
});
