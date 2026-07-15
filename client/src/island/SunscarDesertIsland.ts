import * as THREE from 'three';
import type { GraphicsProfile } from '../engine/GraphicsQuality';
import type { CollisionSystem } from '../world/Collision';
import type { WorldTextures } from '../world/textures';
import { createMobileMaterial, tiledTexture } from '../art/MobilePBRMaterials';
import { mulberry32 } from '../world/props';
import { scaledVegetationCount } from '../engine/GraphicsQuality';
import { SUNSCAR_DESERT_LEGACY_CENTER as SUNSCAR_DESERT_CENTER, SUNSCAR_DESERT_RADIUS, layoutOffset } from './IslandRegistry';
import { LEGACY_SUNSCAR_DESERT_POI_LIST as SUNSCAR_DESERT_POI_LIST, LEGACY_SUNSCAR_DESERT_POIS as SUNSCAR_DESERT_POIS } from '../world/WorldPOI';
import { createIslandBuildCollision } from './IslandLayout';

export interface SunscarDesertIslandResult {
  root: THREE.Group;
}

interface DesertMaterials {
  sandstone: THREE.MeshStandardMaterial;
  darkStone: THREE.MeshStandardMaterial;
  wood: THREE.MeshStandardMaterial;
  darkWood: THREE.MeshStandardMaterial;
  clothRed: THREE.MeshStandardMaterial;
  clothBlue: THREE.MeshStandardMaterial;
  cactus: THREE.MeshStandardMaterial;
  palm: THREE.MeshStandardMaterial;
  water: THREE.MeshStandardMaterial;
}

function shadow(
  mesh: THREE.Mesh | THREE.InstancedMesh,
  graphics: GraphicsProfile,
  receive = true,
): void {
  mesh.castShadow = graphics.shadows;
  mesh.receiveShadow = receive && graphics.shadows;
  mesh.frustumCulled = true;
}

function createMaterials(textures: WorldTextures): DesertMaterials {
  return {
    sandstone: createMobileMaterial('stone', {
      color: 0xd0a66f,
      map: tiledTexture(textures.sandColor, 1.8, 1.8),
      normalMap: tiledTexture(textures.sandNormal, 1.8, 1.8),
      roughness: 0.94,
      normalStrength: 0.55,
    }),
    darkStone: createMobileMaterial('stone', {
      color: 0x8b6747,
      map: tiledTexture(textures.rockColor, 2.1, 2.1),
      normalMap: tiledTexture(textures.rockNormal, 2.1, 2.1),
      roughness: 0.9,
      normalStrength: 0.75,
    }),
    wood: createMobileMaterial('wood', {
      color: 0x9b7045,
      map: tiledTexture(textures.planksColor, 1.2, 1.5),
      normalMap: tiledTexture(textures.planksNormal, 1.2, 1.5),
      roughness: 0.84,
    }),
    darkWood: createMobileMaterial('darkWood', { color: 0x3f291c, roughness: 0.91 }),
    clothRed: createMobileMaterial('cloth', { color: 0xa33e32, roughness: 0.96 }),
    clothBlue: createMobileMaterial('cloth', { color: 0x276c78, roughness: 0.95 }),
    cactus: createMobileMaterial('foliage', { color: 0x477645, roughness: 0.87 }),
    palm: createMobileMaterial('foliage', { color: 0x477d45, roughness: 0.83 }),
    water: createMobileMaterial('shell', {
      color: 0x42a9bd,
      emissive: 0x0c4354,
      emissiveIntensity: 0.12,
      roughness: 0.24,
      transparent: true,
      opacity: 0.84,
    }),
  };
}

function isProtected(x: number, z: number): boolean {
  return SUNSCAR_DESERT_POI_LIST.some((poi) => Math.hypot(x - poi.x, z - poi.z) < poi.safeRadius);
}

function buildDock(
  root: THREE.Group,
  collision: CollisionSystem,
  materials: DesertMaterials,
  graphics: GraphicsProfile,
): void {
  const dockY = 0.42;
  const boardCount = 32;
  const boards = new THREE.InstancedMesh(
    new THREE.BoxGeometry(4.6, 0.16, 0.92),
    materials.wood,
    boardCount,
  );
  const dummy = new THREE.Object3D();
  for (let i = 0; i < boardCount; i++) {
    dummy.position.set(170, dockY, 72 + i * 0.9);
    dummy.rotation.set(0, (i % 3 - 1) * 0.006, 0);
    dummy.updateMatrix();
    boards.setMatrixAt(i, dummy.matrix);
  }
  shadow(boards, graphics);
  root.add(boards);

  const posts = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.14, 0.18, 3.1, 7),
    materials.darkWood,
    16,
  );
  for (let i = 0; i < 16; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const row = Math.floor(i / 2);
    dummy.position.set(170 + side * 2.15, dockY - 1.15, 73 + row * 3.8);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    posts.setMatrixAt(i, dummy.matrix);
  }
  shadow(posts, graphics);
  root.add(posts);
  collision.addPlatform({ minX: 167.65, maxX: 172.35, minZ: 71.5, maxZ: 100.5, y: dockY + 0.09 });
}

function addAdobeBuilding(
  root: THREE.Group,
  collision: CollisionSystem,
  materials: DesertMaterials,
  graphics: GraphicsProfile,
  x: number,
  z: number,
  rotation: number,
  scale = 1,
): void {
  const y = collision.heightAt(x, z);
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.rotation.y = rotation;
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(5.1 * scale, 3.2, 4.2 * scale),
    materials.sandstone,
  );
  wall.position.y = 1.7;
  shadow(wall, graphics);
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(5.5 * scale, 0.28, 4.6 * scale),
    materials.darkStone,
  );
  roof.position.y = 3.42;
  shadow(roof, graphics);
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.25, 2.25, 0.14), materials.darkWood);
  door.position.set(0, 1.18, 2.16 * scale);
  const awning = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.12, 1.5), materials.clothRed);
  awning.position.set(0, 2.55, 2.85 * scale);
  awning.rotation.x = -0.16;
  group.add(wall, roof, door, awning);
  root.add(group);
  collision.addCollider({ x, z, radius: 3 * scale, minY: y - 1, maxY: y + 4 });
}

function buildCaravanCity(
  root: THREE.Group,
  collision: CollisionSystem,
  materials: DesertMaterials,
  graphics: GraphicsProfile,
  nightMaterial: THREE.MeshStandardMaterial,
  nightLights: THREE.PointLight[],
): void {
  addAdobeBuilding(root, collision, materials, graphics, 158, 104, 0.35, 0.9);
  addAdobeBuilding(root, collision, materials, graphics, 182, 104, -0.35, 0.95);
  addAdobeBuilding(root, collision, materials, graphics, 181, 116, -2.35, 0.82);

  const center = SUNSCAR_DESERT_POIS.caravanCity;
  const y = collision.heightAt(center.x, center.z);
  const safeRing = new THREE.Mesh(
    new THREE.TorusGeometry(4.5, 0.075, 6, 48),
    new THREE.MeshBasicMaterial({ color: 0x72e0c0, transparent: true, opacity: 0.64 }),
  );
  safeRing.rotation.x = Math.PI / 2;
  safeRing.position.set(center.x, y + 0.08, center.z);
  root.add(safeRing);

  const canopyGeometry = new THREE.ConeGeometry(2.2, 0.7, 4);
  const canopies = new THREE.InstancedMesh(canopyGeometry, materials.clothBlue, 3);
  const dummy = new THREE.Object3D();
  [[163, 112], [170, 113], [176, 111]].forEach(([x, z], index) => {
    const ground = collision.heightAt(x, z);
    dummy.position.set(x, ground + 2.55, z);
    dummy.rotation.set(0, Math.PI / 4 + index * 0.2, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    canopies.setMatrixAt(index, dummy.matrix);
  });
  shadow(canopies, graphics, false);
  root.add(canopies);

  const lanternSpots: readonly [number, number][] = [[165, 98], [175, 98], [170, 108]];
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
    if (index < Math.max(0, graphics.pointLights - 2)) {
      const light = new THREE.PointLight(0xffb75e, 0, 13, 2);
      light.position.set(x, ground + 2.5, z);
      root.add(light);
      nightLights.push(light);
    }
  });
  shadow(posts, graphics);
  root.add(posts, bulbs);
}

function buildOasis(
  root: THREE.Group,
  collision: CollisionSystem,
  materials: DesertMaterials,
  graphics: GraphicsProfile,
): void {
  const { x, z } = SUNSCAR_DESERT_POIS.oasis;
  const y = collision.heightAt(x, z);
  const water = new THREE.Mesh(new THREE.CircleGeometry(5.2, 36), materials.water);
  water.rotation.x = -Math.PI / 2;
  water.position.set(x, y + 0.07, z);
  water.receiveShadow = false;
  root.add(water);

  const palmCount = scaledVegetationCount(graphics.tier === 'low' ? 3 : graphics.tier === 'medium' ? 5 : 6);
  const trunks = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.18, 0.3, 1, 7),
    materials.darkWood,
    palmCount,
  );
  const crowns = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1.15, 1),
    materials.palm,
    palmCount,
  );
  const dummy = new THREE.Object3D();
  for (let i = 0; i < palmCount; i++) {
    const angle = (i / palmCount) * Math.PI * 2 + 0.25;
    const px = x + Math.cos(angle) * (6.2 + (i % 2) * 1.1);
    const pz = z + Math.sin(angle) * (5.8 + (i % 3) * 0.7);
    const ground = collision.heightAt(px, pz);
    const height = 4.2 + (i % 3) * 0.45;
    dummy.position.set(px, ground + height / 2, pz);
    dummy.rotation.set(0, angle, 0);
    dummy.scale.set(1, height, 1);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    dummy.position.set(px, ground + height, pz);
    dummy.scale.set(1.65, 0.85, 1.65);
    dummy.updateMatrix();
    crowns.setMatrixAt(i, dummy.matrix);
    collision.addCollider({ x: px, z: pz, radius: 0.45, minY: ground - 1, maxY: ground + height });
  }
  shadow(trunks, graphics);
  crowns.castShadow = graphics.tier === 'high';
  root.add(trunks, crowns);
}

function buildQuarry(
  root: THREE.Group,
  collision: CollisionSystem,
  materials: DesertMaterials,
  graphics: GraphicsProfile,
): void {
  const { x, z } = SUNSCAR_DESERT_POIS.quarry;
  const rockGeometry = new THREE.IcosahedronGeometry(1.2, graphics.tier === 'high' ? 2 : 1);
  const rocks = new THREE.InstancedMesh(rockGeometry, materials.darkStone, 9);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 9; i++) {
    const angle = (i / 9) * Math.PI * 2;
    const px = x + Math.cos(angle) * (4.2 + (i % 2) * 1.4);
    const pz = z + Math.sin(angle) * (3.8 + (i % 3) * 0.8);
    const y = collision.heightAt(px, pz);
    const scale = 0.75 + (i % 4) * 0.18;
    dummy.position.set(px, y + 0.55 * scale, pz);
    dummy.rotation.set(angle * 0.2, angle, -angle * 0.1);
    dummy.scale.set(scale, scale * 0.7, scale * 1.05);
    dummy.updateMatrix();
    rocks.setMatrixAt(i, dummy.matrix);
    collision.addCollider({ x: px, z: pz, radius: 0.8 * scale, minY: y - 1, maxY: y + 1.5 * scale });
  }
  shadow(rocks, graphics);
  root.add(rocks);
}

function buildPyramid(
  root: THREE.Group,
  collision: CollisionSystem,
  materials: DesertMaterials,
  graphics: GraphicsProfile,
): void {
  const center = SUNSCAR_DESERT_POIS.pyramid;
  const pyramidZ = center.z + 7;
  const y = collision.heightAt(center.x, pyramidZ);
  const pyramid = new THREE.Mesh(new THREE.ConeGeometry(9.2, 7.2, 4), materials.sandstone);
  pyramid.position.set(center.x, y + 3.45, pyramidZ);
  pyramid.rotation.y = Math.PI / 4;
  shadow(pyramid, graphics);
  root.add(pyramid);
  collision.addCollider({ x: center.x, z: pyramidZ, radius: 7.4, minY: y - 1, maxY: y + 7.4 });

  const obeliskGeometry = new THREE.BoxGeometry(0.8, 4.8, 0.8);
  const obelisks = new THREE.InstancedMesh(obeliskGeometry, materials.darkStone, 2);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 2; i++) {
    const x = center.x + (i ? 1 : -1) * 5.2;
    const z = center.z - 5;
    const ground = collision.heightAt(x, z);
    dummy.position.set(x, ground + 2.4, z);
    dummy.rotation.set(0, i ? 0.08 : -0.08, i ? 0.03 : -0.03);
    dummy.updateMatrix();
    obelisks.setMatrixAt(i, dummy.matrix);
    collision.addCollider({ x, z, radius: 0.65, minY: ground, maxY: ground + 5 });
  }
  shadow(obelisks, graphics);
  root.add(obelisks);

  const arena = new THREE.Mesh(
    new THREE.TorusGeometry(8.5, 0.11, 6, 56),
    new THREE.MeshBasicMaterial({ color: 0xffb24a, transparent: true, opacity: 0.32 }),
  );
  arena.rotation.x = Math.PI / 2;
  arena.position.set(center.x, collision.heightAt(center.x, center.z - 5) + 0.1, center.z - 5);
  root.add(arena);
}

function buildDesertProps(
  root: THREE.Group,
  collision: CollisionSystem,
  materials: DesertMaterials,
  graphics: GraphicsProfile,
): void {
  const random = mulberry32(20260715);
  const target = scaledVegetationCount(graphics.tier === 'low' ? 15 : graphics.tier === 'medium' ? 24 : 32);
  const spots: { x: number; y: number; z: number; scale: number; rotation: number }[] = [];
  for (let attempt = 0; attempt < target * 40 && spots.length < target; attempt++) {
    const angle = random() * Math.PI * 2;
    const distance = Math.sqrt(random()) * SUNSCAR_DESERT_RADIUS * 0.82;
    const x = SUNSCAR_DESERT_CENTER.x + Math.cos(angle) * distance;
    const z = SUNSCAR_DESERT_CENTER.z + Math.sin(angle) * distance;
    const y = collision.heightAt(x, z);
    if (y < 0.25 || isProtected(x, z)) continue;
    if (spots.some((spot) => Math.hypot(spot.x - x, spot.z - z) < 3.2)) continue;
    spots.push({ x, y, z, scale: 0.75 + random() * 0.65, rotation: random() * Math.PI * 2 });
  }

  const trunks = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.25, 0.34, 2.6, 7),
    materials.cactus,
    spots.length,
  );
  const arms = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.16, 0.2, 1.35, 7),
    materials.cactus,
    spots.length * 2,
  );
  const dummy = new THREE.Object3D();
  let armIndex = 0;
  spots.forEach((spot, index) => {
    const height = 2.6 * spot.scale;
    dummy.position.set(spot.x, spot.y + height / 2, spot.z);
    dummy.rotation.set(0, spot.rotation, 0);
    dummy.scale.set(spot.scale, spot.scale, spot.scale);
    dummy.updateMatrix();
    trunks.setMatrixAt(index, dummy.matrix);
    for (const side of [-1, 1]) {
      dummy.position.set(
        spot.x + Math.cos(spot.rotation) * side * 0.48 * spot.scale,
        spot.y + height * 0.58,
        spot.z - Math.sin(spot.rotation) * side * 0.48 * spot.scale,
      );
      dummy.rotation.set(0, spot.rotation, Math.PI / 2);
      dummy.scale.setScalar(0.72 * spot.scale);
      dummy.updateMatrix();
      arms.setMatrixAt(armIndex++, dummy.matrix);
    }
    collision.addCollider({ x: spot.x, z: spot.z, radius: 0.42 * spot.scale, minY: spot.y - 1, maxY: spot.y + height });
  });
  shadow(trunks, graphics);
  shadow(arms, graphics);
  root.add(trunks, arms);
}

/** สร้างเกาะทะเลทรายด้วย material shared + instancing เพื่อคุม draw call บนมือถือ */
export function buildSunscarDesertIsland(
  scene: THREE.Scene,
  baseCollision: CollisionSystem,
  textures: WorldTextures,
  graphics: GraphicsProfile,
  nightMaterial: THREE.MeshStandardMaterial,
  nightLights: THREE.PointLight[],
): SunscarDesertIslandResult {
  const root = new THREE.Group();
  root.name = 'PF_ISLAND_SUNSCAR_DESERT_DETAILS';
  const offset = layoutOffset('sunscar-desert');
  root.position.set(offset.x, 0, offset.z);
  const collision = createIslandBuildCollision(baseCollision, 'sunscar-desert');
  const materials = createMaterials(textures);
  buildDock(root, collision, materials, graphics);
  buildCaravanCity(root, collision, materials, graphics, nightMaterial, nightLights);
  buildOasis(root, collision, materials, graphics);
  buildQuarry(root, collision, materials, graphics);
  buildPyramid(root, collision, materials, graphics);
  buildDesertProps(root, collision, materials, graphics);
  scene.add(root);
  return { root };
}
