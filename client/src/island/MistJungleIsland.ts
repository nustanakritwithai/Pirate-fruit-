import * as THREE from 'three';
import type { GraphicsProfile } from '../engine/GraphicsQuality';
import type { CollisionSystem } from '../world/Collision';
import type { WorldTextures } from '../world/textures';
import { createMobileMaterial, tiledTexture } from '../art/MobilePBRMaterials';
import { mulberry32 } from '../world/props';
import { MIST_JUNGLE_CENTER, MIST_JUNGLE_RADIUS } from './IslandRegistry';
import { MIST_JUNGLE_POI_LIST, MIST_JUNGLE_POIS } from '../world/WorldPOI';

export interface MistJungleIslandResult {
  root: THREE.Group;
}

interface JungleMaterials {
  bark: THREE.MeshStandardMaterial;
  foliage: THREE.MeshStandardMaterial;
  foliageDark: THREE.MeshStandardMaterial;
  stone: THREE.MeshStandardMaterial;
  mossStone: THREE.MeshStandardMaterial;
  wood: THREE.MeshStandardMaterial;
  darkWood: THREE.MeshStandardMaterial;
  canvas: THREE.MeshStandardMaterial;
  rope: THREE.MeshStandardMaterial;
}

function setShadow(
  mesh: THREE.Mesh | THREE.InstancedMesh,
  graphics: GraphicsProfile,
  receive = true,
): void {
  mesh.castShadow = graphics.shadows;
  mesh.receiveShadow = receive && graphics.shadows;
  mesh.frustumCulled = true;
}

function createMaterials(textures: WorldTextures): JungleMaterials {
  return {
    bark: createMobileMaterial('wood', {
      color: 0x55402d,
      map: tiledTexture(textures.barkColor, 1.3, 2.8),
      normalMap: tiledTexture(textures.barkNormal, 1.3, 2.8),
      roughness: 0.91,
      normalStrength: 0.7,
    }),
    foliage: createMobileMaterial('foliage', { color: 0x2e7042, roughness: 0.85 }),
    foliageDark: createMobileMaterial('foliage', { color: 0x174a35, roughness: 0.89 }),
    stone: createMobileMaterial('stone', {
      color: 0x777e73,
      map: tiledTexture(textures.rockColor, 1.8, 1.8),
      normalMap: tiledTexture(textures.rockNormal, 1.8, 1.8),
      roughness: 0.9,
      normalStrength: 0.82,
    }),
    mossStone: createMobileMaterial('stone', {
      color: 0x53664d,
      map: tiledTexture(textures.rockColor, 2.1, 2.1),
      normalMap: tiledTexture(textures.rockNormal, 2.1, 2.1),
      roughness: 0.94,
      normalStrength: 0.72,
    }),
    wood: createMobileMaterial('wood', {
      color: 0x9a7046,
      map: tiledTexture(textures.planksColor, 1.3, 1.5),
      normalMap: tiledTexture(textures.planksNormal, 1.3, 1.5),
      roughness: 0.82,
      normalStrength: 0.62,
    }),
    darkWood: createMobileMaterial('darkWood', { color: 0x3c281c, roughness: 0.9 }),
    canvas: createMobileMaterial('cloth', { color: 0xb09b70, roughness: 0.96 }),
    rope: createMobileMaterial('rope', { color: 0x9f875c, roughness: 0.95 }),
  };
}

function isProtected(x: number, z: number): boolean {
  return MIST_JUNGLE_POI_LIST.some((poi) => Math.hypot(x - poi.x, z - poi.z) < poi.safeRadius);
}

function buildDock(
  root: THREE.Group,
  collision: CollisionSystem,
  materials: JungleMaterials,
  graphics: GraphicsProfile,
): void {
  const dockY = 0.42;
  const boardCount = 34;
  const boardGeometry = new THREE.BoxGeometry(0.92, 0.16, 4.6);
  const boards = new THREE.InstancedMesh(boardGeometry, materials.wood, boardCount);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < boardCount; i++) {
    dummy.position.set(112 + i * 0.9, dockY, -40);
    dummy.rotation.set(0, (i % 3 - 1) * 0.006, 0);
    dummy.updateMatrix();
    boards.setMatrixAt(i, dummy.matrix);
  }
  setShadow(boards, graphics);
  root.add(boards);

  const postCount = 18;
  const posts = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.14, 0.18, 3.2, 7),
    materials.darkWood,
    postCount,
  );
  for (let i = 0; i < postCount; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const row = Math.floor(i / 2);
    dummy.position.set(113 + row * 3.55, dockY - 1.15, -40 + side * 2.15);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    posts.setMatrixAt(i, dummy.matrix);
  }
  setShadow(posts, graphics);
  root.add(posts);
  collision.addPlatform({ minX: 111.5, maxX: 142.6, minZ: -42.35, maxZ: -37.65, y: dockY + 0.09 });
}

function addTent(
  root: THREE.Group,
  collision: CollisionSystem,
  materials: JungleMaterials,
  graphics: GraphicsProfile,
  x: number,
  z: number,
  rotation: number,
): void {
  const y = collision.heightAt(x, z);
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.rotation.y = rotation;
  const tent = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.35, 2.65, 3), materials.canvas);
  tent.position.y = 1.2;
  tent.rotation.z = Math.PI / 2;
  tent.scale.set(0.78, 1, 1);
  setShadow(tent, graphics);
  group.add(tent);
  const opening = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.45), materials.darkWood);
  opening.position.set(0, 0.9, 2.04);
  group.add(opening);
  root.add(group);
  collision.addCollider({ x, z, radius: 1.75, minY: y - 1, maxY: y + 2.8 });
}

function buildExpeditionCamp(
  root: THREE.Group,
  collision: CollisionSystem,
  materials: JungleMaterials,
  graphics: GraphicsProfile,
  nightMaterial: THREE.MeshStandardMaterial,
  nightLights: THREE.PointLight[],
): void {
  addTent(root, collision, materials, graphics, 151, -35, -2.35);
  addTent(root, collision, materials, graphics, 151, -45, -0.78);

  const center = MIST_JUNGLE_POIS.expeditionCamp;
  const y = collision.heightAt(center.x, center.z);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(4.25, 0.075, 6, 48),
    new THREE.MeshBasicMaterial({ color: 0x76dfbf, transparent: true, opacity: 0.64 }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.set(center.x, y + 0.08, center.z);
  root.add(ring);

  const crateGeometry = new THREE.BoxGeometry(0.9, 0.9, 0.9);
  const crates = new THREE.InstancedMesh(crateGeometry, materials.wood, 5);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 5; i++) {
    const x = 156 + (i % 2) * 1.05;
    const z = -44 + Math.floor(i / 2) * 1.05;
    const ground = collision.heightAt(x, z);
    dummy.position.set(x, ground + 0.45, z);
    dummy.rotation.set(0, i * 0.31, 0);
    dummy.updateMatrix();
    crates.setMatrixAt(i, dummy.matrix);
    collision.addCollider({ x, z, radius: 0.56, minY: ground, maxY: ground + 1 });
  }
  setShadow(crates, graphics);
  root.add(crates);

  const lanternSpots: readonly [number, number][] = [[146, -40], [158, -40], [153, -48]];
  const posts = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.075, 0.11, 2.65, 7),
    materials.darkWood,
    lanternSpots.length,
  );
  const bulbs = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.18, 8, 6),
    nightMaterial,
    lanternSpots.length,
  );
  lanternSpots.forEach(([x, z], index) => {
    const ground = collision.heightAt(x, z);
    dummy.position.set(x, ground + 1.32, z);
    dummy.updateMatrix();
    posts.setMatrixAt(index, dummy.matrix);
    dummy.position.y = ground + 2.55;
    dummy.updateMatrix();
    bulbs.setMatrixAt(index, dummy.matrix);
    if (index < Math.max(0, graphics.pointLights - 1)) {
      const light = new THREE.PointLight(0xffc56d, 0, 12, 2);
      light.position.set(x, ground + 2.48, z);
      root.add(light);
      nightLights.push(light);
    }
  });
  setShadow(posts, graphics);
  root.add(posts, bulbs);
}

function buildRuins(
  root: THREE.Group,
  collision: CollisionSystem,
  materials: JungleMaterials,
  graphics: GraphicsProfile,
): void {
  const { x, z } = MIST_JUNGLE_POIS.ruins;
  const y = collision.heightAt(x, z);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(7.2, 7.8, 0.45, 10), materials.mossStone);
  base.position.set(x, y + 0.12, z);
  setShadow(base, graphics);
  root.add(base);
  collision.addPlatform({ minX: x - 5.2, maxX: x + 5.2, minZ: z - 5.2, maxZ: z + 5.2, y: y + 0.36 });

  const columnGeometry = new THREE.CylinderGeometry(0.48, 0.62, 4.7, 8);
  const columns = new THREE.InstancedMesh(columnGeometry, materials.stone, 7);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 7; i++) {
    const angle = (i / 8) * Math.PI * 2 + 0.25;
    const px = x + Math.cos(angle) * 4.8;
    const pz = z + Math.sin(angle) * 4.8;
    dummy.position.set(px, y + 2.6, pz);
    dummy.rotation.set((i % 3 - 1) * 0.035, angle, (i % 2 ? 1 : -1) * 0.045);
    dummy.scale.set(1, i === 5 ? 0.62 : 1, 1);
    dummy.updateMatrix();
    columns.setMatrixAt(i, dummy.matrix);
    collision.addCollider({ x: px, z: pz, radius: 0.62, minY: y, maxY: y + 5.2 });
  }
  setShadow(columns, graphics);
  root.add(columns);

  const altar = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.1, 2.2), materials.mossStone);
  altar.position.set(x, y + 0.9, z);
  altar.rotation.y = 0.22;
  setShadow(altar, graphics);
  root.add(altar);
  collision.addCollider({ x, z, radius: 1.5, minY: y, maxY: y + 1.6 });
}

function buildBossArena(
  root: THREE.Group,
  collision: CollisionSystem,
  materials: JungleMaterials,
  graphics: GraphicsProfile,
): void {
  const { x, z } = MIST_JUNGLE_POIS.bossArena;
  const y = collision.heightAt(x, z);
  const arch = new THREE.Group();
  arch.position.set(x, y, z - 5.8);
  const pillarGeometry = new THREE.BoxGeometry(1.15, 4.8, 1.2);
  for (const side of [-1, 1]) {
    const pillar = new THREE.Mesh(pillarGeometry, materials.mossStone);
    pillar.position.set(side * 3.1, 2.35, 0);
    setShadow(pillar, graphics);
    arch.add(pillar);
    collision.addCollider({ x: x + side * 3.1, z: z - 5.8, radius: 0.8, minY: y, maxY: y + 5 });
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(7.5, 1.05, 1.4), materials.mossStone);
  lintel.position.y = 4.7;
  lintel.rotation.z = -0.05;
  setShadow(lintel, graphics);
  arch.add(lintel);
  root.add(arch);

  const mist = new THREE.Mesh(
    new THREE.CircleGeometry(8.5, 32),
    new THREE.MeshBasicMaterial({ color: 0x8fd4b4, transparent: true, opacity: 0.1, depthWrite: false }),
  );
  mist.rotation.x = -Math.PI / 2;
  mist.position.set(x, y + 0.1, z);
  root.add(mist);
}

function buildJungleVegetation(
  root: THREE.Group,
  collision: CollisionSystem,
  materials: JungleMaterials,
  graphics: GraphicsProfile,
): void {
  const random = mulberry32(20260714);
  const treeTarget = graphics.tier === 'low' ? 30 : graphics.tier === 'medium' ? 42 : 54;
  const spots: { x: number; y: number; z: number; scale: number; rotation: number }[] = [];
  for (let attempt = 0; attempt < treeTarget * 45 && spots.length < treeTarget; attempt++) {
    const angle = random() * Math.PI * 2;
    const distance = Math.sqrt(random()) * MIST_JUNGLE_RADIUS * 0.8;
    const x = MIST_JUNGLE_CENTER.x + Math.cos(angle) * distance;
    const z = MIST_JUNGLE_CENTER.z + Math.sin(angle) * distance;
    const y = collision.heightAt(x, z);
    if (y < 0.35 || isProtected(x, z)) continue;
    if (spots.some((spot) => Math.hypot(spot.x - x, spot.z - z) < 3.3)) continue;
    spots.push({ x, y, z, scale: 0.8 + random() * 0.55, rotation: random() * Math.PI * 2 });
  }

  const trunkGeometry = new THREE.CylinderGeometry(0.2, 0.38, 1, 7, 2);
  const crownGeometry = new THREE.IcosahedronGeometry(1.25, graphics.tier === 'high' ? 2 : 1);
  const trunks = new THREE.InstancedMesh(trunkGeometry, materials.bark, spots.length);
  const crowns = new THREE.InstancedMesh(crownGeometry, materials.foliage, spots.length * 2);
  const dummy = new THREE.Object3D();
  let crownIndex = 0;
  spots.forEach((spot, index) => {
    const height = 5.1 * spot.scale;
    dummy.position.set(spot.x, spot.y + height / 2, spot.z);
    dummy.rotation.set(0, spot.rotation, 0);
    dummy.scale.set(spot.scale, height, spot.scale);
    dummy.updateMatrix();
    trunks.setMatrixAt(index, dummy.matrix);
    for (let i = 0; i < 2; i++) {
      dummy.position.set(
        spot.x + (i ? 0.75 : -0.45) * spot.scale,
        spot.y + height - i * 0.5,
        spot.z + (i ? -0.35 : 0.4) * spot.scale,
      );
      dummy.rotation.set(0, spot.rotation + i, 0);
      dummy.scale.set(1.55 * spot.scale, 1.05 * spot.scale, 1.4 * spot.scale);
      dummy.updateMatrix();
      crowns.setMatrixAt(crownIndex++, dummy.matrix);
    }
    collision.addCollider({
      x: spot.x,
      z: spot.z,
      radius: 0.5 * spot.scale,
      minY: spot.y - 1,
      maxY: spot.y + height,
    });
  });
  setShadow(trunks, graphics);
  crowns.castShadow = graphics.tier === 'high';
  crowns.receiveShadow = graphics.shadows;
  root.add(trunks, crowns);

  const shrubTarget = graphics.tier === 'low' ? 34 : graphics.tier === 'medium' ? 58 : 82;
  const shrubGeometry = new THREE.IcosahedronGeometry(0.62, 1);
  const shrubs = new THREE.InstancedMesh(shrubGeometry, materials.foliageDark, shrubTarget);
  let created = 0;
  for (let attempt = 0; attempt < shrubTarget * 20 && created < shrubTarget; attempt++) {
    const angle = random() * Math.PI * 2;
    const distance = Math.sqrt(random()) * MIST_JUNGLE_RADIUS * 0.82;
    const x = MIST_JUNGLE_CENTER.x + Math.cos(angle) * distance;
    const z = MIST_JUNGLE_CENTER.z + Math.sin(angle) * distance;
    const y = collision.heightAt(x, z);
    if (y < 0.25 || isProtected(x, z)) continue;
    const scale = 0.5 + random() * 0.85;
    dummy.position.set(x, y + 0.38 * scale, z);
    dummy.rotation.set(0, random() * Math.PI * 2, 0);
    dummy.scale.set(scale, scale * 0.62, scale * 1.1);
    dummy.updateMatrix();
    shrubs.setMatrixAt(created++, dummy.matrix);
  }
  shrubs.count = created;
  shrubs.castShadow = false;
  shrubs.receiveShadow = graphics.shadows;
  root.add(shrubs);
}

/** สร้างเกาะที่สองด้วย geometry/material shared และ instancing สำหรับมือถือ */
export function buildMistJungleIsland(
  scene: THREE.Scene,
  collision: CollisionSystem,
  textures: WorldTextures,
  graphics: GraphicsProfile,
  nightMaterial: THREE.MeshStandardMaterial,
  nightLights: THREE.PointLight[],
): MistJungleIslandResult {
  const root = new THREE.Group();
  root.name = 'PF_ISLAND_MIST_JUNGLE_DETAILS';
  const materials = createMaterials(textures);
  buildDock(root, collision, materials, graphics);
  buildExpeditionCamp(root, collision, materials, graphics, nightMaterial, nightLights);
  buildRuins(root, collision, materials, graphics);
  buildBossArena(root, collision, materials, graphics);
  buildJungleVegetation(root, collision, materials, graphics);
  scene.add(root);
  return { root };
}
