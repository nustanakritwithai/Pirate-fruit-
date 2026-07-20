import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export interface StaticBatchOptions {
  cellSize?: number;
  minimumMeshes?: number;
}

export interface StaticBatchStats {
  sourceMeshes: number;
  mergedSourceMeshes: number;
  batchMeshes: number;
  estimatedDrawCallsBefore: number;
  estimatedDrawCallsAfter: number;
}

interface Candidate {
  mesh: THREE.Mesh;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}

function drawCallCount(root: THREE.Object3D): number {
  let calls = 0;
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible) return;
    calls += Array.isArray(mesh.material) ? Math.max(1, mesh.material.length) : 1;
  });
  return calls;
}

function attributeSignature(geometry: THREE.BufferGeometry): string {
  const attributes = Object.entries(geometry.attributes)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, attribute]) => {
      const arrayName = attribute.array.constructor.name;
      return `${name}:${attribute.itemSize}:${attribute.normalized ? 1 : 0}:${arrayName}`;
    })
    .join('|');
  return `${geometry.index ? 'indexed' : 'plain'}:${attributes}`;
}

function canBatch(mesh: THREE.Mesh): mesh is THREE.Mesh<THREE.BufferGeometry, THREE.Material> {
  if (
    mesh instanceof THREE.InstancedMesh
    || mesh instanceof THREE.SkinnedMesh
    || mesh.userData.noStaticBatch === true
  ) return false;
  if (!(mesh.geometry instanceof THREE.BufferGeometry) || Array.isArray(mesh.material)) return false;
  if (mesh.material.visible === false || mesh.material.userData.noStaticBatch === true) return false;
  if (Object.keys(mesh.geometry.morphAttributes).length > 0) return false;
  return true;
}

function pruneEmptyGroups(root: THREE.Object3D): void {
  for (const child of [...root.children]) {
    pruneEmptyGroups(child);
    if (child !== root && child.type === 'Group' && child.children.length === 0) child.removeFromParent();
  }
}

/**
 * Merge static island meshes by material, vertex layout, shadow mode and spatial cell.
 * Spatial cells retain useful frustum culling; animated and instanced meshes stay intact.
 */
export function batchStaticIsland(
  root: THREE.Object3D,
  options: StaticBatchOptions = {},
): StaticBatchStats {
  const cellSize = Math.max(12, options.cellSize ?? 48);
  const minimumMeshes = Math.max(2, options.minimumMeshes ?? 2);
  const callsBefore = drawCallCount(root);
  const sourceMeshes: THREE.Mesh[] = [];
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh) sourceMeshes.push(mesh);
  });

  root.updateMatrixWorld(true);
  const inverseRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map<string, Candidate[]>();
  const center = new THREE.Vector3();
  const localMatrix = new THREE.Matrix4();

  for (const mesh of sourceMeshes) {
    if (!canBatch(mesh)) continue;
    mesh.geometry.computeBoundingBox();
    mesh.geometry.boundingBox?.getCenter(center);
    localMatrix.multiplyMatrices(inverseRoot, mesh.matrixWorld);
    center.applyMatrix4(localMatrix);
    const cellX = Math.floor(center.x / cellSize);
    const cellY = Math.floor(center.y / cellSize);
    const cellZ = Math.floor(center.z / cellSize);
    const key = [
      mesh.material.uuid,
      attributeSignature(mesh.geometry),
      mesh.castShadow ? 1 : 0,
      mesh.receiveShadow ? 1 : 0,
      mesh.renderOrder,
      mesh.layers.mask,
      cellX,
      cellY,
      cellZ,
    ].join(':');
    const geometry = mesh.geometry.clone();
    geometry.applyMatrix4(localMatrix);
    const list = buckets.get(key) ?? [];
    list.push({ mesh, geometry, material: mesh.material });
    buckets.set(key, list);
  }

  let mergedSourceMeshes = 0;
  let batchMeshes = 0;
  for (const candidates of buckets.values()) {
    if (candidates.length < minimumMeshes) {
      candidates.forEach((candidate) => candidate.geometry.dispose());
      continue;
    }
    const merged = mergeGeometries(candidates.map((candidate) => candidate.geometry), false);
    candidates.forEach((candidate) => candidate.geometry.dispose());
    if (!merged) continue;
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    const first = candidates[0].mesh;
    const batch = new THREE.Mesh(merged, candidates[0].material);
    batch.name = `PF_STATIC_BATCH_${batchMeshes}`;
    batch.castShadow = first.castShadow;
    batch.receiveShadow = first.receiveShadow;
    batch.renderOrder = first.renderOrder;
    batch.layers.mask = first.layers.mask;
    batch.frustumCulled = true;
    batch.userData.staticBatch = true;
    root.add(batch);
    candidates.forEach((candidate) => candidate.mesh.removeFromParent());
    mergedSourceMeshes += candidates.length;
    batchMeshes++;
  }

  pruneEmptyGroups(root);
  root.updateMatrixWorld(true);
  const stats: StaticBatchStats = {
    sourceMeshes: sourceMeshes.length,
    mergedSourceMeshes,
    batchMeshes,
    estimatedDrawCallsBefore: callsBefore,
    estimatedDrawCallsAfter: drawCallCount(root),
  };
  root.userData.staticBatchStats = stats;
  return stats;
}
