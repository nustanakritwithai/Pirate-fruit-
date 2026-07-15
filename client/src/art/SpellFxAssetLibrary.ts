import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

export type SpellFxAssetId = 'fireball' | 'lightning-hands' | 'magic-rock';

export const SPELL_FX_ASSET_FILES: Record<SpellFxAssetId, string> = {
  fireball: 'quaternius-spell-fx/fireball.glb',
  'lightning-hands': 'quaternius-spell-fx/lightning-hands.glb',
  'magic-rock': 'quaternius-spell-fx/magic-rock.glb',
};

const IDS = Object.keys(SPELL_FX_ASSET_FILES) as SpellFxAssetId[];
const loader = new GLTFLoader();
const loaded = new Map<SpellFxAssetId, GLTF>();
const pending = new Map<SpellFxAssetId, Promise<GLTF>>();
let preloadPromise: Promise<void> | null = null;

function loadSource(id: SpellFxAssetId): Promise<GLTF> {
  const ready = loaded.get(id);
  if (ready) return Promise.resolve(ready);
  const inFlight = pending.get(id);
  if (inFlight) return inFlight;
  const request = loader.loadAsync(`${import.meta.env.BASE_URL}assets/third-party/${SPELL_FX_ASSET_FILES[id]}`)
    .then((gltf) => {
      loaded.set(id, gltf);
      pending.delete(id);
      return gltf;
    })
    .catch((error: unknown) => {
      pending.delete(id);
      throw error;
    });
  pending.set(id, request);
  return request;
}

/** โหลดเอฟเฟกต์แบบ background เพื่อไม่แย่งเฟรมตอนเข้าเกาะ */
export function preloadSpellFxAssets(): void {
  if (preloadPromise || typeof window === 'undefined') return;
  preloadPromise = Promise.allSettled(IDS.map(loadSource)).then((results) => {
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.warn(`[SpellFxAssetLibrary] ใช้ procedural fallback สำหรับ ${IDS[index]}`, result.reason);
      }
    });
  });
}

export interface SpellFxAssetInstance {
  root: THREE.Group;
  materials: THREE.Material[];
  disposeMaterials(): void;
}

export function instantiateSpellFxAsset(id: SpellFxAssetId, tint?: number): SpellFxAssetInstance | null {
  const source = loaded.get(id);
  if (!source) return null;
  const root = SkeletonUtils.clone(source.scene) as THREE.Group;
  const materials: THREE.Material[] = [];
  const tintColor = tint === undefined ? null : new THREE.Color(tint);
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const cloned = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((material) => {
      const next = material.clone();
      const colorMaterial = next as THREE.Material & { color?: THREE.Color };
      if (tintColor && colorMaterial.color) colorMaterial.color.lerp(tintColor, 0.18);
      colorMaterial.transparent = true;
      colorMaterial.depthWrite = false;
      colorMaterial.blending = THREE.AdditiveBlending;
      colorMaterial.toneMapped = false;
      materials.push(next);
      return next;
    });
    mesh.material = Array.isArray(mesh.material) ? cloned : cloned[0];
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = true;
  });
  return { root, materials, disposeMaterials: () => materials.forEach((material) => material.dispose()) };
}
