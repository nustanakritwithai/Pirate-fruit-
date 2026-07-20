import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { CollisionSystem } from '../Collision';
import {
  ISLAND_LOAD_DISTANCE,
  ISLAND_UNLOAD_DISTANCE,
  islandStreamingAction,
} from '../IslandStreamingPolicy';
import { loadWorldTextures } from '../textures';
import { ISLANDS } from '../../island/IslandRegistry';

describe('procedural MMO-lite world foundation', () => {
  it('creates the complete world surface set without fetch or image loading', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const textures = await loadWorldTextures(2);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(textures.grassColor).toBeInstanceOf(THREE.DataTexture);
    expect(textures.grassNormal).toBeInstanceOf(THREE.DataTexture);
    expect(textures.waterNormal).toBeInstanceOf(THREE.DataTexture);
    expect(textures.sandColor).toBe(textures.grassColor);
    expect(textures.rockColor).toBe(textures.grassColor);
    expect(textures.barkColor).toBe(textures.grassColor);
    expect(textures.planksColor).toBe(textures.grassColor);
    expect(textures.grassColor.image.width).toBe(32);
    expect(textures.grassColor.image.height).toBe(32);

    vi.unstubAllGlobals();
  });

  it('removes streamed island colliders and platforms as one scope', () => {
    const collision = new CollisionSystem(() => 0);
    collision.runInScope('island:test', () => {
      collision.addPlatform({ minX: -2, maxX: 2, minZ: -2, maxZ: 2, y: 4 });
      collision.addCollider({ x: 0, z: 0, radius: 1, minY: -1, maxY: 3 });
    });

    expect(collision.heightAt(0, 0)).toBe(4);
    const blocked = new THREE.Vector3(0.2, 0, 0);
    collision.resolveObstacles(blocked);
    expect(blocked.x).toBeGreaterThan(1);

    collision.removeScope('island:test');
    expect(collision.heightAt(0, 0)).toBe(0);
    const clear = new THREE.Vector3(0.2, 0, 0);
    collision.resolveObstacles(clear);
    expect(clear.x).toBe(0.2);
  });

  it('does not request a neighbouring island at the starter spawn', () => {
    const starter = ISLANDS.find((island) => island.id === 'starter-island')!;
    const neighbours = ISLANDS.filter((island) => island.id !== 'starter-island');
    for (const island of neighbours) {
      const distance = Math.hypot(
        starter.spawn.x - island.center.x,
        starter.spawn.z - island.center.z,
      );
      expect(islandStreamingAction(distance, false, false)).toBe('keep');
    }
    expect(islandStreamingAction(ISLAND_LOAD_DISTANCE - 1, false, false)).toBe('load');
    expect(islandStreamingAction(ISLAND_UNLOAD_DISTANCE + 1, true, false)).toBe('unload');
  });
});
