import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import type { GraphicsProfile } from '../engine/GraphicsQuality';
import type { BoatDefinition } from './BoatData';

export type BoatAssetId = NonNullable<BoatDefinition['modelId']>;
const FILES: Record<BoatAssetId, string> = {
  boat: 'quaternius-ships/boat.glb',
  'small-ship': 'quaternius-ships/small-ship.glb',
  'sail-ship': 'quaternius-ships/sail-ship.glb',
  ship: 'quaternius-ships/ship.glb',
  'viking-boat': 'quaternius-ships/viking-boat.glb',
  'sail-boat': 'quaternius-ships/sail-boat.glb',
};
const loader = new GLTFLoader();
const loaded = new Map<BoatAssetId, GLTF>();
const pending = new Map<BoatAssetId, Promise<GLTF>>();
let started = false;

function loadSource(id: BoatAssetId): Promise<GLTF> {
  const ready = loaded.get(id);
  if (ready) return Promise.resolve(ready);
  const inflight = pending.get(id);
  if (inflight) return inflight;
  const request = loader.loadAsync(`${import.meta.env.BASE_URL}assets/third-party/${FILES[id]}`)
    .then((gltf) => { loaded.set(id, gltf); pending.delete(id); return gltf; })
    .catch((error: unknown) => { pending.delete(id); throw error; });
  pending.set(id, request);
  return request;
}

/** โหลดเรือทั้งหมดแบบ background ไม่บล็อกการเข้าเกม */
export function preloadBoatAssets(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  (Object.keys(FILES) as BoatAssetId[]).forEach((id) => {
    void loadSource(id).catch((error) => console.warn(`[BoatAssetLibrary] fallback ${id}`, error));
  });
}

export function upgradeBoatVisualWhenReady(
  root: THREE.Group,
  fallback: THREE.Group,
  definition: BoatDefinition,
  graphics: GraphicsProfile,
): void {
  if (!definition.modelId) return;
  preloadBoatAssets();
  void loadSource(definition.modelId).then((source) => {
    if (!fallback.parent) return;
    const asset = SkeletonUtils.clone(source.scene) as THREE.Group;
    const materials: THREE.Material[] = [];
    asset.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const cloned = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((material) => {
        const next = material.clone(); materials.push(next); return next;
      });
      mesh.material = Array.isArray(mesh.material) ? cloned : cloned[0];
      mesh.castShadow = graphics.shadows; mesh.receiveShadow = graphics.shadows; mesh.frustumCulled = true;
    });
    const bounds = new THREE.Box3().setFromObject(asset);
    const size = bounds.getSize(new THREE.Vector3());
    const horizontal = Math.max(size.x, size.z, 0.01);
    const target = Math.max(definition.length, definition.width * 2.1);
    const scale = target / horizontal;
    asset.scale.setScalar(scale);
    asset.position.set(0, -bounds.min.y * scale + 0.03, 0);
    asset.rotation.y = Math.PI;
    fallback.visible = false;
    root.add(asset);
  }).catch(() => undefined);
}
