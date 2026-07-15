import * as THREE from 'three';
import { addPirateBuildingAsset, upgradePirateBuildingAssetWhenReady } from '../art/PirateBuildingAssetLibrary';
import type { GraphicsProfile } from '../engine/GraphicsQuality';
import type { CollisionSystem } from '../world/Collision';
import type { WorldTextures } from '../world/textures';
import { createMobileMaterial, tiledTexture } from '../art/MobilePBRMaterials';
import { mulberry32 } from '../world/props';
import { EMBER_VOLCANO_LEGACY_CENTER as EMBER_VOLCANO_CENTER, EMBER_VOLCANO_RADIUS, layoutOffset } from './IslandRegistry';
import { LEGACY_EMBER_VOLCANO_POI_LIST as EMBER_VOLCANO_POI_LIST, LEGACY_EMBER_VOLCANO_POIS as EMBER_VOLCANO_POIS } from '../world/WorldPOI';
import { createIslandBuildCollision } from './IslandLayout';

export interface EmberVolcanoIslandResult { root: THREE.Group }

function shadow(mesh: THREE.Mesh | THREE.InstancedMesh, graphics: GraphicsProfile): void {
  mesh.castShadow = graphics.shadows;
  mesh.receiveShadow = graphics.shadows;
  mesh.frustumCulled = true;
}

/** Mobile PBR island 6 — shared materials, instancing and low-poly silhouettes for mobile. */
export function buildEmberVolcanoIsland(
  scene: THREE.Scene,
  baseCollision: CollisionSystem,
  textures: WorldTextures,
  graphics: GraphicsProfile,
  nightMaterial: THREE.MeshStandardMaterial,
  nightLights: THREE.PointLight[],
): EmberVolcanoIslandResult {
  const root = new THREE.Group();
  root.name = 'PF_ISLAND_EMBER_VOLCANO_DETAILS';
  const offset = layoutOffset('ember-volcano');
  root.position.set(offset.x, 0, offset.z);
  const collision = createIslandBuildCollision(baseCollision, 'ember-volcano');

  const basalt = createMobileMaterial('stone', {
    color: 0x443b39,
    map: tiledTexture(textures.rockColor, 2.2, 2.2),
    normalMap: tiledTexture(textures.rockNormal, 2.2, 2.2),
    roughness: 0.9,
  });
  const obsidian = createMobileMaterial('stone', {
    color: 0x211d25,
    roughness: 0.28,
    metalness: 0.08,
    envMapIntensity: 0.8,
  });
  const emberStone = createMobileMaterial('stone', {
    color: 0x5c4036,
    emissive: 0x421106,
    emissiveIntensity: 0.18,
    roughness: 0.78,
  });
  const wood = createMobileMaterial('wood', {
    color: 0x5a3d2c,
    map: tiledTexture(textures.planksColor, 1.3, 1.5),
    normalMap: tiledTexture(textures.planksNormal, 1.3, 1.5),
    roughness: 0.86,
  });
  const charredWood = createMobileMaterial('darkWood', { color: 0x241d1a, roughness: 0.94 });
  const terracotta = createMobileMaterial('terracotta', { color: 0x8f4c36, roughness: 0.88 });
  const iron = createMobileMaterial('iron', { color: 0x393b40, roughness: 0.42 });
  const lava = createMobileMaterial('shell', {
    color: 0xff5b16,
    emissive: 0xff2600,
    emissiveIntensity: 1.45,
    roughness: 0.2,
    transparent: true,
    opacity: 0.88,
    side: THREE.DoubleSide,
  });
  const ember = createMobileMaterial('shell', {
    color: 0xffb33d,
    emissive: 0xff4500,
    emissiveIntensity: 1.25,
    roughness: 0.18,
  });
  const dummy = new THREE.Object3D();

  // ท่าเรือเหนือ รับเส้นทางจากเกาะนภาวายุ
  const boards = new THREE.InstancedMesh(new THREE.BoxGeometry(4.6, 0.16, 0.92), wood, 36);
  for (let i = 0; i < 36; i++) {
    dummy.position.set(-212, 0.45, 138.5 - i * 0.9);
    dummy.rotation.set(0, (i % 3 - 1) * 0.006, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    boards.setMatrixAt(i, dummy.matrix);
  }
  shadow(boards, graphics);
  root.add(boards);

  const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.15, 0.22, 3.3, 7), charredWood, 18);
  for (let i = 0; i < 18; i++) {
    const side = i % 2 ? 1 : -1;
    const row = Math.floor(i / 2);
    dummy.position.set(-212 + side * 2.15, -0.7, 137.5 - row * 3.65);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    posts.setMatrixAt(i, dummy.matrix);
  }
  shadow(posts, graphics);
  root.add(posts);
  collision.addPlatform({ minX: -214.35, maxX: -209.65, minZ: 104.5, maxZ: 139.5, y: 0.54 });

  // หมู่บ้านช่างตีเหล็ก — อาคารเตี้ยและหลังคาดินเผาทนเถ้าร้อน
  const addForgeHouse = (x: number, z: number, rotation: number, asset: 'blacksmith' | 'house'): void => {
    if (addPirateBuildingAsset(root, collision, graphics, asset, x, z, rotation, 4.6, 2.8)) return;
    const y = collision.heightAt(x, z);
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.rotation.y = rotation;
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.8, 3, 4), emberStone);
    body.position.y = 1.55;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.9, 2, 4), terracotta);
    roof.position.y = 3.7;
    roof.rotation.y = Math.PI / 4;
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.1, 0.14), charredWood);
    door.position.set(0, 1.05, 2.06);
    shadow(body, graphics);
    shadow(roof, graphics);
    group.add(body, roof, door);
    root.add(group);
    upgradePirateBuildingAssetWhenReady(root, collision, graphics, asset, x, z, rotation, 4.6, 2.8, group);
    collision.addCollider({ x, z, radius: 2.8, minY: y - 1, maxY: y + 5 });
  };
  addForgeHouse(-221, 96, 0.18, 'blacksmith');
  addForgeHouse(-211, 94, -0.8, 'house');
  addForgeHouse(-225, 107, 2.35, 'blacksmith');

  const village = EMBER_VOLCANO_POIS.forgeVillage;
  const villageY = collision.heightAt(village.x, village.z);
  const safeRing = new THREE.Mesh(
    new THREE.TorusGeometry(4.8, 0.075, 6, 48),
    new THREE.MeshBasicMaterial({ color: 0xffb066, transparent: true, opacity: 0.64 }),
  );
  safeRing.rotation.x = Math.PI / 2;
  safeRing.position.set(village.x, villageY + 0.08, village.z);
  root.add(safeRing);

  // โรงตีเหล็กกลางหมู่บ้าน
  const anvil = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.55, 0.72), iron);
  anvil.position.set(-215, collision.heightAt(-215, 103) + 0.75, 103);
  const anvilStem = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.48, 0.85, 6), iron);
  anvilStem.position.set(-215, collision.heightAt(-215, 103) + 0.34, 103);
  shadow(anvil, graphics);
  shadow(anvilStem, graphics);
  root.add(anvil, anvilStem);
  collision.addCollider({ x: -215, z: 103, radius: 0.8, minY: villageY, maxY: villageY + 1.6 });

  const lanternSpots: readonly [number, number][] = [[-217, 105], [-210, 99], [-224, 101]];
  const lanternPosts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.075, 0.11, 2.7, 7), charredWood, lanternSpots.length);
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.18, 8, 6), nightMaterial, lanternSpots.length);
  lanternSpots.forEach(([x, z], i) => {
    const y = collision.heightAt(x, z);
    dummy.position.set(x, y + 1.35, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    lanternPosts.setMatrixAt(i, dummy.matrix);
    dummy.position.y = y + 2.6;
    dummy.updateMatrix();
    bulbs.setMatrixAt(i, dummy.matrix);
    if (i < Math.max(0, graphics.pointLights - 2)) {
      const light = new THREE.PointLight(0xff6b35, 0, 15, 2);
      light.position.set(x, y + 2.55, z);
      root.add(light);
      nightLights.push(light);
    }
  });
  shadow(lanternPosts, graphics);
  root.add(lanternPosts, bulbs);

  // ทุ่งลาวา — วงลาวาหลายระดับใช้ geometry ต่ำและ material ร่วม
  const lavaField = EMBER_VOLCANO_POIS.lavaFields;
  const pools: readonly [number, number, number][] = [
    [lavaField.x, lavaField.z, 3.6],
    [lavaField.x - 6.2, lavaField.z - 2.5, 2.3],
    [lavaField.x + 4.8, lavaField.z + 4.3, 2.1],
    [-247, 89, 1.8],
  ];
  for (const [x, z, radius] of pools) {
    const y = collision.heightAt(x, z);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(radius, 28), lava);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(x, y + 0.07, z);
    pool.receiveShadow = false;
    root.add(pool);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.16, 5, 32), obsidian);
    rim.rotation.x = Math.PI / 2;
    rim.position.set(x, y + 0.08, z);
    shadow(rim, graphics);
    root.add(rim);
  }

  // เหมืองออบซิเดียนและผลึกสีดำ
  const mine = EMBER_VOLCANO_POIS.obsidianMine;
  const crystalCount = graphics.tier === 'low' ? 10 : 15;
  const crystals = new THREE.InstancedMesh(new THREE.ConeGeometry(0.72, 3.9, 5), obsidian, crystalCount);
  for (let i = 0; i < crystalCount; i++) {
    const a = i / crystalCount * Math.PI * 2;
    const d = 3.7 + i % 4 * 1.15;
    const x = mine.x + Math.cos(a) * d;
    const z = mine.z + Math.sin(a) * d;
    const y = collision.heightAt(x, z);
    const s = 0.7 + i % 4 * 0.14;
    dummy.position.set(x, y + 1.7 * s, z);
    dummy.rotation.set((i % 2 ? 1 : -1) * 0.1, a, (i % 3 - 1) * 0.14);
    dummy.scale.setScalar(s);
    dummy.updateMatrix();
    crystals.setMatrixAt(i, dummy.matrix);
    collision.addCollider({ x, z, radius: 0.58 * s, minY: y, maxY: y + 3.9 * s });
  }
  shadow(crystals, graphics);
  root.add(crystals);

  const mineArch = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.52, 7, 20, Math.PI), basalt);
  mineArch.position.set(mine.x, collision.heightAt(mine.x, mine.z) + 0.35, mine.z + 3.2);
  mineArch.rotation.z = Math.PI;
  shadow(mineArch, graphics);
  root.add(mineArch);

  // ป้อมลัทธิเถ้าถ่าน
  const camp = EMBER_VOLCANO_POIS.cultistCamp;
  const campY = collision.heightAt(camp.x, camp.z);
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(3.3, 3.9, 5.8, 8), basalt);
  tower.position.set(camp.x, campY + 2.85, camp.z);
  const towerRoof = new THREE.Mesh(new THREE.ConeGeometry(4.2, 2.2, 8), terracotta);
  towerRoof.position.set(camp.x, campY + 6.85, camp.z);
  const gate = new THREE.Mesh(new THREE.BoxGeometry(1.8, 3, 0.2), charredWood);
  gate.position.set(camp.x, campY + 1.55, camp.z + 3.45);
  shadow(tower, graphics);
  shadow(towerRoof, graphics);
  root.add(tower, towerRoof, gate);
  collision.addCollider({ x: camp.x, z: camp.z, radius: 3.8, minY: campY - 1, maxY: campY + 8.2 });

  // ปล่องไททันแมกมา — ลานบอสวงแหวนบะซอลต์รอบแกนลาวา
  const caldera = EMBER_VOLCANO_POIS.titanCaldera;
  const calderaY = collision.heightAt(caldera.x, caldera.z);
  const calderaFloor = new THREE.Mesh(new THREE.RingGeometry(5.5, 11.2, 48), basalt);
  calderaFloor.rotation.x = -Math.PI / 2;
  calderaFloor.position.set(caldera.x, calderaY + 0.1, caldera.z);
  shadow(calderaFloor, graphics);
  root.add(calderaFloor);
  const magmaCore = new THREE.Mesh(new THREE.CircleGeometry(5.45, 36), lava);
  magmaCore.rotation.x = -Math.PI / 2;
  magmaCore.position.set(caldera.x, calderaY + 0.12, caldera.z);
  magmaCore.receiveShadow = false;
  root.add(magmaCore);
  const arena = new THREE.Mesh(
    new THREE.TorusGeometry(11.2, 0.14, 6, 56),
    new THREE.MeshBasicMaterial({ color: 0xff6a2a, transparent: true, opacity: 0.58 }),
  );
  arena.rotation.x = Math.PI / 2;
  arena.position.set(caldera.x, calderaY + 0.18, caldera.z);
  root.add(arena);

  const pylons = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.65, 0.9, 5.4, 7), emberStone, 6);
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2;
    const x = caldera.x + Math.cos(a) * 13;
    const z = caldera.z + Math.sin(a) * 13;
    const y = collision.heightAt(x, z);
    dummy.position.set(x, y + 2.7, z);
    dummy.rotation.set(0, a, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    pylons.setMatrixAt(i, dummy.matrix);
    collision.addCollider({ x, z, radius: 0.85, minY: y, maxY: y + 5.5 });
  }
  shadow(pylons, graphics);
  root.add(pylons);

  const coreLight = new THREE.PointLight(0xff4c18, graphics.tier === 'low' ? 0.8 : 1.5, 30, 2);
  coreLight.position.set(caldera.x, calderaY + 4.5, caldera.z);
  root.add(coreLight);

  // สะเก็ดไฟรอบปล่อง ใช้ instancing แทน particle update ทุกเฟรม
  const sparkCount = graphics.tier === 'low' ? 8 : graphics.tier === 'medium' ? 12 : 18;
  const sparks = new THREE.InstancedMesh(new THREE.SphereGeometry(0.11, 6, 4), ember, sparkCount);
  for (let i = 0; i < sparkCount; i++) {
    const a = i * 2.39996;
    const d = 2.2 + i % 5 * 1.3;
    dummy.position.set(
      caldera.x + Math.cos(a) * d,
      calderaY + 1.1 + (i % 7) * 0.72,
      caldera.z + Math.sin(a) * d,
    );
    dummy.rotation.set(0, a, 0);
    dummy.scale.setScalar(0.72 + (i % 3) * 0.18);
    dummy.updateMatrix();
    sparks.setMatrixAt(i, dummy.matrix);
  }
  sparks.receiveShadow = false;
  root.add(sparks);

  // ต้นไม้ไหม้และเสาหินกระจายแบบ instancing
  const random = mulberry32(20260718);
  const target = graphics.tier === 'low' ? 13 : graphics.tier === 'medium' ? 22 : 30;
  const spots: { x: number; y: number; z: number; scale: number; lean: number }[] = [];
  for (let attempt = 0; attempt < target * 45 && spots.length < target; attempt++) {
    const a = random() * Math.PI * 2;
    const d = Math.sqrt(random()) * EMBER_VOLCANO_RADIUS * 0.82;
    const x = EMBER_VOLCANO_CENTER.x + Math.cos(a) * d;
    const z = EMBER_VOLCANO_CENTER.z + Math.sin(a) * d;
    const y = collision.heightAt(x, z);
    if (
      y < 0.3
      || EMBER_VOLCANO_POI_LIST.some((poi) => Math.hypot(x - poi.x, z - poi.z) < poi.safeRadius)
      || spots.some((spot) => Math.hypot(spot.x - x, spot.z - z) < 3.4)
    ) continue;
    spots.push({ x, y, z, scale: 0.72 + random() * 0.62, lean: (random() - 0.5) * 0.2 });
  }
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.13, 0.32, 1, 6), charredWood, spots.length);
  const branches = new THREE.InstancedMesh(new THREE.ConeGeometry(0.58, 1.8, 5), charredWood, spots.length);
  spots.forEach((spot, i) => {
    const h = 3.9 * spot.scale;
    dummy.position.set(spot.x, spot.y + h / 2, spot.z);
    dummy.rotation.set(0, i * 0.47, spot.lean);
    dummy.scale.set(spot.scale, h, spot.scale);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    dummy.position.set(spot.x + spot.lean * 2.4, spot.y + h, spot.z);
    dummy.rotation.set(Math.PI / 2 + spot.lean, i * 0.47, 0);
    dummy.scale.set(0.9 * spot.scale, 1.25 * spot.scale, 0.9 * spot.scale);
    dummy.updateMatrix();
    branches.setMatrixAt(i, dummy.matrix);
    collision.addCollider({ x: spot.x, z: spot.z, radius: 0.4 * spot.scale, minY: spot.y - 1, maxY: spot.y + h });
  });
  shadow(trunks, graphics);
  branches.castShadow = graphics.tier === 'high';
  root.add(trunks, branches);

  scene.add(root);
  return { root };
}
