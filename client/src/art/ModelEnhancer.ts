import * as THREE from 'three';
import type { GraphicsProfile } from '../engine/GraphicsQuality';
import { applyMobileTextureSettings } from './MobilePBRMaterials';

/** ปรับ GLB ภายนอกให้เข้ากับ color pipeline/แสง PBR ของเกม โดยไม่แก้ skeleton หรือ animation */
export function enhanceLoadedModel(
  root: THREE.Object3D,
  graphics: GraphicsProfile,
  maxAnisotropy = 4,
): void {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = graphics.shadows;
    mesh.receiveShadow = graphics.tier === 'high';
    mesh.frustumCulled = true;

    if (!mesh.geometry.attributes.normal) mesh.geometry.computeVertexNormals();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const source of materials) {
      const material = source as THREE.MeshStandardMaterial;
      if (!material.isMeshStandardMaterial) continue;
      material.roughness = THREE.MathUtils.clamp(material.roughness, 0.38, 0.94);
      material.metalness = THREE.MathUtils.clamp(material.metalness, 0, 0.82);
      material.envMapIntensity = graphics.tier === 'low' ? 0.38 : 0.68;
      applyMobileTextureSettings(material.map, Math.min(maxAnisotropy, graphics.textureAnisotropy));
      applyMobileTextureSettings(material.normalMap, Math.min(maxAnisotropy, graphics.textureAnisotropy));
      applyMobileTextureSettings(material.roughnessMap, Math.min(maxAnisotropy, graphics.textureAnisotropy));
      applyMobileTextureSettings(material.metalnessMap, Math.min(maxAnisotropy, graphics.textureAnisotropy));
      material.needsUpdate = true;
    }
  });
}
