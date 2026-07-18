import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorldMonsterSnapshot } from '@pirate-fruit/shared';
import {
  SharedMonsterClient,
  resolveSharedMonsterPlayerDamage,
} from '../SharedMonsterClient';

const snapshot = (overrides: Partial<WorldMonsterSnapshot> = {}): WorldMonsterSnapshot => ({
  spawnId: 'starter-crab-1',
  monsterId: 'crab',
  islandId: 'starter-island',
  x: 22,
  z: -4,
  heading: 0,
  hp: 70,
  maxHp: 70,
  state: 'idle',
  ...overrides,
});

describe('S16 shared monster rendering and player defeat regression', () => {
  beforeEach(() => {
    const context = {
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      fillText: vi.fn(),
      fillStyle: '',
      strokeStyle: '',
      font: '',
      textBaseline: '',
      lineWidth: 1,
    };
    vi.stubGlobal('document', {
      createElement: vi.fn(() => ({
        width: 0,
        height: 0,
        getContext: () => context,
      })),
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('reuses the normal monster visual and follows terrain height across deltas', () => {
    const scene = new THREE.Scene();
    const heightAt = (x: number, z: number) => 2 + x * 0.01 - z * 0.005;
    const client = new SharedMonsterClient(scene, 'starter-island', heightAt, () => 1_000);

    client.applySnapshot('starter-island', [snapshot()]);
    const rendered = scene.getObjectByName('monster:crab') as THREE.Group | undefined;
    expect(rendered).toBeDefined();
    expect(rendered!.children.length).toBeGreaterThan(1);
    expect(rendered!.position.y).toBeCloseTo(heightAt(22, -4));

    client.applyDelta('starter-island', [{
      spawnId: 'starter-crab-1', x: 30, z: 5, heading: 1, hp: 63, state: 'chase',
    }]);
    client.update(1);
    expect(rendered!.position.y).toBeCloseTo(heightAt(30, 5), 2);

    client.markDead('starter-crab-1');
    client.update(1);
    expect(rendered!.visible).toBe(false);
    client.applyRespawn(snapshot({ x: 24, z: -6 }));
    expect(rendered!.visible).toBe(true);
    client.dispose();
    expect(scene.getObjectByName('monster:crab')).toBeUndefined();
  });

  it('reports a lethal shared-monster hit exactly when HP reaches zero', () => {
    expect(resolveSharedMonsterPlayerDamage(10, 12, (amount) => amount)).toEqual({
      hp: 0,
      taken: 12,
      defeated: true,
    });
    expect(resolveSharedMonsterPlayerDamage(10, 12, () => 4)).toEqual({
      hp: 6,
      taken: 4,
      defeated: false,
    });
    expect(resolveSharedMonsterPlayerDamage(0, 12, (amount) => amount)).toEqual({
      hp: 0,
      taken: 0,
      defeated: false,
    });
  });
});
