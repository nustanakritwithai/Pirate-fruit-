import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { batchStaticIsland } from '../StaticIslandBatcher';
import { buildStarterIsland } from '../../island/StarterIsland';
import type { GraphicsProfile } from '../../engine/GraphicsQuality';
import { CollisionSystem } from '../../world/Collision';
import { loadWorldTextures } from '../../world/textures';

const mobileProfile: GraphicsProfile = {
  tier: 'medium',
  label: 'test',
  pixelRatio: 1,
  antialias: true,
  shadows: true,
  shadowMapSize: 1024,
  terrainSegments: 100,
  waterSegments: 48,
  palmCount: 11,
  palmFronds: 5,
  rockCount: 16,
  crateCount: 7,
  cloudCount: 7,
  pointLights: 1,
  grassPatchCount: 48,
  shrubCount: 6,
  textureAnisotropy: 4,
  exposure: 0.98,
  maxDrawCalls: 120,
  maxVisibleTriangles: 220_000,
};

describe('StaticIslandBatcher', () => {
  it('reduces static draw calls while preserving bounds and instanced meshes', () => {
    const root = new THREE.Group();
    const nested = new THREE.Group();
    nested.position.set(5, 0, -3);
    root.add(nested);
    const wall = new THREE.MeshStandardMaterial({ color: 0x668855 });
    const roof = new THREE.MeshStandardMaterial({ color: 0x884433 });
    const glass = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.5 });

    for (let index = 0; index < 24; index++) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), index % 2 ? wall : roof);
      mesh.position.set((index % 8) * 2, 0.5, Math.floor(index / 8) * 2);
      mesh.castShadow = true;
      nested.add(mesh);
    }
    for (let index = 0; index < 3; index++) {
      const window = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), glass);
      window.position.set(index * 2, 1, 1);
      nested.add(window);
    }
    const instances = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 2, 1), wall, 4);
    nested.add(instances);

    root.updateMatrixWorld(true);
    const beforeBounds = new THREE.Box3().setFromObject(root);
    const stats = batchStaticIsland(root, { cellSize: 12 });
    const afterBounds = new THREE.Box3().setFromObject(root);

    expect(stats.mergedSourceMeshes).toBe(27);
    expect(stats.batchMeshes).toBeGreaterThanOrEqual(2);
    expect(stats.estimatedDrawCallsAfter).toBeLessThan(stats.estimatedDrawCallsBefore / 2);
    expect(root.getObjectByProperty('isInstancedMesh', true)).toBe(instances);
    expect(afterBounds.min.distanceTo(beforeBounds.min)).toBeLessThan(0.001);
    expect(afterBounds.max.distanceTo(beforeBounds.max)).toBeLessThan(0.001);
    root.traverse((object) => {
      if (object.userData.staticBatch) expect(object.frustumCulled).toBe(true);
    });
  });

  it('batches transparent geometry by cell but preserves explicitly excluded meshes', () => {
    const root = new THREE.Group();
    const transparent = new THREE.MeshStandardMaterial({ transparent: true });
    const material = new THREE.MeshStandardMaterial();
    const a = new THREE.Mesh(new THREE.BoxGeometry(), transparent);
    const b = new THREE.Mesh(new THREE.BoxGeometry(), transparent);
    const excludedA = new THREE.Mesh(new THREE.BoxGeometry(), material);
    const excludedB = new THREE.Mesh(new THREE.BoxGeometry(), material);
    excludedA.userData.noStaticBatch = true;
    excludedB.userData.noStaticBatch = true;
    root.add(a, b, excludedA, excludedB);

    const stats = batchStaticIsland(root);

    expect(stats.batchMeshes).toBe(1);
    expect(root.children).toHaveLength(3);
  });

  it('cuts the starter island static draw-call proxy below the mobile budget', async () => {
    const scene = new THREE.Scene();
    const collision = new CollisionSystem(() => 0);
    const textures = await loadWorldTextures(1);
    const island = buildStarterIsland(scene, collision, textures, mobileProfile);

    const stats = batchStaticIsland(island.root);

    expect(stats.estimatedDrawCallsBefore).toBeGreaterThan(40);
    expect(stats.estimatedDrawCallsAfter).toBeLessThanOrEqual(35);
    expect(stats.estimatedDrawCallsAfter).toBeLessThan(stats.estimatedDrawCallsBefore * 0.6);
  });
});
