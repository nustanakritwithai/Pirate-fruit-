import * as THREE from 'three';
import type { GraphicsProfile } from '../engine/GraphicsQuality';
import type { CollisionSystem } from '../world/Collision';
import type { WorldTextures } from '../world/textures';
import { createMobileMaterial, tiledTexture } from '../art/MobilePBRMaterials';
import { mulberry32 } from '../world/props';
import { TEMPEST_SKY_CENTER, TEMPEST_SKY_RADIUS } from './IslandRegistry';
import { TEMPEST_SKY_POI_LIST, TEMPEST_SKY_POIS } from '../world/WorldPOI';
import { addPirateBuildingAsset, upgradePirateBuildingAssetWhenReady } from '../art/PirateBuildingAssetLibrary';

export interface TempestSkyIslandResult { root: THREE.Group }

function shadow(mesh: THREE.Mesh | THREE.InstancedMesh, graphics: GraphicsProfile): void {
  mesh.castShadow = graphics.shadows;
  mesh.receiveShadow = graphics.shadows;
  mesh.frustumCulled = true;
}

/** Mobile PBR island 5 — shared materials + instancing keep the mobile draw-call budget stable. */
export function buildTempestSkyIsland(
  scene: THREE.Scene,
  collision: CollisionSystem,
  textures: WorldTextures,
  graphics: GraphicsProfile,
  nightMaterial: THREE.MeshStandardMaterial,
  nightLights: THREE.PointLight[],
): TempestSkyIslandResult {
  const root = new THREE.Group();
  root.name = 'PF_ISLAND_TEMPEST_SKY_DETAILS';
  const alabaster = createMobileMaterial('stone', { color: 0xc6d5d8, map: tiledTexture(textures.rockColor, 2, 2), normalMap: tiledTexture(textures.rockNormal, 2, 2), roughness: 0.78 });
  const paleStone = createMobileMaterial('plaster', { color: 0xd9e2df, roughness: 0.82 });
  const wood = createMobileMaterial('wood', { color: 0x7c6249, map: tiledTexture(textures.planksColor, 1.3, 1.5), normalMap: tiledTexture(textures.planksNormal, 1.3, 1.5), roughness: 0.82 });
  const darkWood = createMobileMaterial('darkWood', { color: 0x352b27, roughness: 0.9 });
  const blueRoof = createMobileMaterial('stone', { color: 0x4e668f, roughness: 0.68 });
  const cloud = createMobileMaterial('shell', { color: 0xeaf7fa, emissive: 0x8ec8db, emissiveIntensity: 0.1, roughness: 0.3, transparent: true, opacity: 0.63 });
  const stormCrystal = createMobileMaterial('shell', { color: 0x829ff0, emissive: 0x334fa4, emissiveIntensity: 0.58, roughness: 0.17 });
  const foliage = createMobileMaterial('foliage', { color: 0x456d65, roughness: 0.86 });
  const dummy = new THREE.Object3D();

  // ท่าเรือฝั่งตะวันออก เชื่อมเส้นทางจากเกาะเหมันต์คราม
  const boards = new THREE.InstancedMesh(new THREE.BoxGeometry(0.92, 0.16, 4.6), wood, 35);
  for (let i = 0; i < 35; i++) { dummy.position.set(-71 - i * 0.9, 0.45, 210); dummy.rotation.set(0, (i % 3 - 1) * 0.006, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); boards.setMatrixAt(i, dummy.matrix); }
  shadow(boards, graphics); root.add(boards);
  const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.14, 0.2, 3.2, 7), darkWood, 18);
  for (let i = 0; i < 18; i++) { const side = i % 2 ? 1 : -1; const row = Math.floor(i / 2); dummy.position.set(-72 - row * 3.55, -0.7, 210 + side * 2.15); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); posts.setMatrixAt(i, dummy.matrix); }
  shadow(posts, graphics); root.add(posts);
  collision.addPlatform({ minX: -103.5, maxX: -70.5, minZ: 207.65, maxZ: 212.35, y: 0.54 });

  // หมู่บ้านหน้าผา
  const addHouse = (x: number, z: number, rotation: number, asset: 'house' | 'gazebo'): void => {
    if (addPirateBuildingAsset(root, collision, graphics, asset, x, z, rotation, asset === 'gazebo' ? 3.2 : 4.4, asset === 'gazebo' ? 1.7 : 2.8)) return;
    const y = collision.heightAt(x, z); const group = new THREE.Group(); group.position.set(x, y, z); group.rotation.y = rotation;
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.8, 3, 4), paleStone); body.position.y = 1.55;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.9, 2.1, 4), blueRoof); roof.position.y = 3.75; roof.rotation.y = Math.PI / 4;
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.1, 0.14), darkWood); door.position.set(0, 1.05, 2.06);
    shadow(body, graphics); shadow(roof, graphics); group.add(body, roof, door); root.add(group);
    upgradePirateBuildingAssetWhenReady(root, collision, graphics, asset, x, z, rotation, asset === 'gazebo' ? 3.2 : 4.4, asset === 'gazebo' ? 1.7 : 2.8, group);
    collision.addCollider({ x, z, radius: 2.8, minY: y - 1, maxY: y + 5 });
  };
  addHouse(-96, 220, 0.15, 'house'); addHouse(-88, 214, -0.85, 'gazebo'); addHouse(-91, 201, -2.2, 'house');
  const village = TEMPEST_SKY_POIS.cliffVillage; const villageY = collision.heightAt(village.x, village.z);
  const safeRing = new THREE.Mesh(new THREE.TorusGeometry(4.7, 0.075, 6, 48), new THREE.MeshBasicMaterial({ color: 0x8ce5dd, transparent: true, opacity: 0.62 }));
  safeRing.rotation.x = Math.PI / 2; safeRing.position.set(village.x, villageY + 0.08, village.z); root.add(safeRing);
  const lanternSpots: readonly [number, number][] = [[-101, 207], [-94, 214], [-88, 207]];
  const lanternPosts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.075, 0.11, 2.7, 7), darkWood, 3);
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.18, 8, 6), nightMaterial, 3);
  lanternSpots.forEach(([x, z], i) => { const y = collision.heightAt(x, z); dummy.position.set(x, y + 1.35, z); dummy.updateMatrix(); lanternPosts.setMatrixAt(i, dummy.matrix); dummy.position.y = y + 2.6; dummy.updateMatrix(); bulbs.setMatrixAt(i, dummy.matrix); if (i < Math.max(0, graphics.pointLights - 2)) { const light = new THREE.PointLight(0xaacbff, 0, 14, 2); light.position.set(x, y + 2.55, z); root.add(light); nightLights.push(light); } });
  shadow(lanternPosts, graphics); root.add(lanternPosts, bulbs);

  // สวนเมฆลอย — แผ่นเมฆโปร่งแสงหลายระดับ
  const garden = TEMPEST_SKY_POIS.cloudGarden; const cloudCount = graphics.tier === 'low' ? 6 : 10;
  const cloudPuffs = new THREE.InstancedMesh(new THREE.SphereGeometry(1.8, 10, 7), cloud, cloudCount);
  for (let i = 0; i < cloudCount; i++) { const a = i / cloudCount * Math.PI * 2; const d = 3.4 + i % 3 * 1.05; const x = garden.x + Math.cos(a) * d; const z = garden.z + Math.sin(a) * d; const y = collision.heightAt(x, z); dummy.position.set(x, y + 0.45 + i % 2 * 0.25, z); dummy.rotation.set(0, a, 0); dummy.scale.set(1.35 + i % 3 * 0.18, 0.38, 0.85 + i % 2 * 0.2); dummy.updateMatrix(); cloudPuffs.setMatrixAt(i, dummy.matrix); }
  cloudPuffs.receiveShadow = false; root.add(cloudPuffs);

  // โรงตีผลึกพายุ
  const forge = TEMPEST_SKY_POIS.stormForge;
  const crystals = new THREE.InstancedMesh(new THREE.ConeGeometry(0.72, 3.8, 5), stormCrystal, 12);
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; const d = 3.7 + i % 3 * 1.2; const x = forge.x + Math.cos(a) * d; const z = forge.z + Math.sin(a) * d; const y = collision.heightAt(x, z); const s = 0.7 + i % 4 * 0.13; dummy.position.set(x, y + 1.65 * s, z); dummy.rotation.set((i % 2 ? 1 : -1) * 0.09, a, (i % 3 - 1) * 0.12); dummy.scale.setScalar(s); dummy.updateMatrix(); crystals.setMatrixAt(i, dummy.matrix); collision.addCollider({ x, z, radius: 0.58 * s, minY: y, maxY: y + 3.8 * s }); }
  shadow(crystals, graphics); root.add(crystals);
  for (let i = 0; i < 3; i++) { const windRing = new THREE.Mesh(new THREE.TorusGeometry(2.4 + i * 0.8, 0.06, 5, 40), new THREE.MeshBasicMaterial({ color: 0xa9d9ff, transparent: true, opacity: 0.3 - i * 0.05 })); windRing.position.set(forge.x, collision.heightAt(forge.x, forge.z) + 2.2 + i * 0.6, forge.z); windRing.rotation.set(Math.PI / 2, i * 0.4, 0); root.add(windRing); }

  // วิหารเจ้าแห่งพายุและลานบอส
  const temple = TEMPEST_SKY_POIS.skyTemple; const templeZ = temple.z + 5; const templeY = collision.heightAt(temple.x, templeZ);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(8.2, 9, 0.7, 8), alabaster); base.position.set(temple.x, templeY + 0.25, templeZ);
  const sanctum = new THREE.Mesh(new THREE.BoxGeometry(8.5, 5.4, 6), paleStone); sanctum.position.set(temple.x, templeY + 3.2, templeZ);
  const templeRoof = new THREE.Mesh(new THREE.ConeGeometry(6.7, 3.1, 4), blueRoof); templeRoof.position.set(temple.x, templeY + 7.25, templeZ); templeRoof.rotation.y = Math.PI / 4;
  const gate = new THREE.Mesh(new THREE.BoxGeometry(2.5, 3.8, 0.2), darkWood); gate.position.set(temple.x, templeY + 2.1, templeZ - 3.1);
  shadow(base, graphics); shadow(sanctum, graphics); shadow(templeRoof, graphics); root.add(base, sanctum, templeRoof, gate);
  collision.addCollider({ x: temple.x, z: templeZ, radius: 5, minY: templeY - 1, maxY: templeY + 9 });
  const columns = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.55, 0.68, 5.5, 8), alabaster, 4);
  [[-6, -2], [6, -2], [-6, 5], [6, 5]].forEach(([dx, dz], i) => { const x = temple.x + dx; const z = temple.z + dz; const y = collision.heightAt(x, z); dummy.position.set(x, y + 2.75, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); columns.setMatrixAt(i, dummy.matrix); collision.addCollider({ x, z, radius: 0.7, minY: y, maxY: y + 5.6 }); });
  shadow(columns, graphics); root.add(columns);
  const arena = new THREE.Mesh(new THREE.TorusGeometry(9.5, 0.11, 6, 56), new THREE.MeshBasicMaterial({ color: 0x87b8ff, transparent: true, opacity: 0.36 }));
  arena.rotation.x = Math.PI / 2; arena.position.set(-151, collision.heightAt(-151, 236) + 0.1, 236); root.add(arena);

  // ต้นไม้ลู่ลมแบบ instancing
  const random = mulberry32(20260717); const target = graphics.tier === 'low' ? 22 : graphics.tier === 'medium' ? 34 : 46;
  const spots: { x: number; y: number; z: number; scale: number; lean: number }[] = [];
  for (let attempt = 0; attempt < target * 40 && spots.length < target; attempt++) { const a = random() * Math.PI * 2; const d = Math.sqrt(random()) * TEMPEST_SKY_RADIUS * 0.82; const x = TEMPEST_SKY_CENTER.x + Math.cos(a) * d; const z = TEMPEST_SKY_CENTER.z + Math.sin(a) * d; const y = collision.heightAt(x, z); if (y < 0.3 || TEMPEST_SKY_POI_LIST.some((poi) => Math.hypot(x - poi.x, z - poi.z) < poi.safeRadius) || spots.some((spot) => Math.hypot(spot.x - x, spot.z - z) < 3.5)) continue; spots.push({ x, y, z, scale: 0.72 + random() * 0.58, lean: 0.06 + random() * 0.1 }); }
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.28, 1, 7), darkWood, spots.length);
  const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.15, 1), foliage, spots.length);
  spots.forEach((spot, i) => { const h = 4.1 * spot.scale; dummy.position.set(spot.x, spot.y + h / 2, spot.z); dummy.rotation.set(0, i * 0.41, spot.lean); dummy.scale.set(spot.scale, h, spot.scale); dummy.updateMatrix(); trunks.setMatrixAt(i, dummy.matrix); dummy.position.set(spot.x + spot.lean * 3, spot.y + h, spot.z); dummy.scale.set(1.65 * spot.scale, 0.78 * spot.scale, 1.25 * spot.scale); dummy.updateMatrix(); crowns.setMatrixAt(i, dummy.matrix); collision.addCollider({ x: spot.x, z: spot.z, radius: 0.4 * spot.scale, minY: spot.y - 1, maxY: spot.y + h }); });
  shadow(trunks, graphics); crowns.castShadow = graphics.tier === 'high'; root.add(trunks, crowns);
  scene.add(root);
  return { root };
}
