import * as THREE from 'three';
import type { GraphicsProfile } from '../engine/GraphicsQuality';
import type { CollisionSystem } from '../world/Collision';
import type { WorldTextures } from '../world/textures';
import { createMobileMaterial, tiledTexture } from '../art/MobilePBRMaterials';
import { mulberry32 } from '../world/props';
import { AZURE_FROST_CENTER, AZURE_FROST_RADIUS } from './IslandRegistry';
import { AZURE_FROST_POI_LIST, AZURE_FROST_POIS } from '../world/WorldPOI';
import { addPirateBuildingAsset, upgradePirateBuildingAssetWhenReady } from '../art/PirateBuildingAssetLibrary';

export interface AzureFrostIslandResult { root: THREE.Group }

function shadow(mesh: THREE.Mesh | THREE.InstancedMesh, graphics: GraphicsProfile): void {
  mesh.castShadow = graphics.shadows;
  mesh.receiveShadow = graphics.shadows;
  mesh.frustumCulled = true;
}

export function buildAzureFrostIsland(
  scene: THREE.Scene,
  collision: CollisionSystem,
  textures: WorldTextures,
  graphics: GraphicsProfile,
  nightMaterial: THREE.MeshStandardMaterial,
  nightLights: THREE.PointLight[],
): AzureFrostIslandResult {
  const root = new THREE.Group();
  root.name = 'PF_ISLAND_AZURE_FROST_DETAILS';
  const snow = createMobileMaterial('plaster', { color: 0xe5f1f4, map: tiledTexture(textures.sandColor, 1.8, 1.8), normalMap: tiledTexture(textures.sandNormal, 1.8, 1.8), roughness: 0.84, normalStrength: 0.38 });
  const ice = createMobileMaterial('shell', { color: 0x75c4d8, emissive: 0x0b3b53, emissiveIntensity: 0.13, roughness: 0.18, transparent: true, opacity: 0.78 });
  const stone = createMobileMaterial('stone', { color: 0x6f8490, map: tiledTexture(textures.rockColor, 1.9, 1.9), normalMap: tiledTexture(textures.rockNormal, 1.9, 1.9), roughness: 0.88 });
  const wood = createMobileMaterial('wood', { color: 0x79583e, map: tiledTexture(textures.planksColor, 1.3, 1.5), normalMap: tiledTexture(textures.planksNormal, 1.3, 1.5), roughness: 0.86 });
  const darkWood = createMobileMaterial('darkWood', { color: 0x34271f, roughness: 0.92 });
  const roofMat = createMobileMaterial('stone', { color: 0x36576c, roughness: 0.83 });
  const pineMat = createMobileMaterial('foliage', { color: 0x234f4b, roughness: 0.9 });
  const crystal = createMobileMaterial('shell', { color: 0x5fc6e0, emissive: 0x126d91, emissiveIntensity: 0.48, roughness: 0.2 });
  const dummy = new THREE.Object3D();

  // ท่าเรือฝั่งตะวันออกเฉียงใต้
  const boards = new THREE.InstancedMesh(new THREE.BoxGeometry(0.92, 0.16, 4.6), wood, 35);
  for (let i = 0; i < 35; i++) { dummy.position.set(84 - i * 0.9, 0.45, 190); dummy.rotation.set(0, (i % 3 - 1) * 0.006, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); boards.setMatrixAt(i, dummy.matrix); }
  shadow(boards, graphics); root.add(boards);
  const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.14, 0.2, 3.2, 7), darkWood, 18);
  for (let i = 0; i < 18; i++) { const side = i % 2 ? 1 : -1; const row = Math.floor(i / 2); dummy.position.set(83 - row * 3.55, -0.7, 190 + side * 2.15); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); posts.setMatrixAt(i, dummy.matrix); }
  shadow(posts, graphics); root.add(posts);
  collision.addPlatform({ minX: 52.5, maxX: 84.5, minZ: 187.65, maxZ: 192.35, y: 0.54 });

  // หมู่บ้านนักล่า
  const addCabin = (x: number, z: number, rotation: number, asset: 'house-alt' | 'barracks'): void => {
    if (addPirateBuildingAsset(root, collision, graphics, asset, x, z, rotation, 4.7, 3)) return;
    const y = collision.heightAt(x, z); const group = new THREE.Group(); group.position.set(x, y, z); group.rotation.y = rotation;
    const body = new THREE.Mesh(new THREE.BoxGeometry(5, 2.8, 4.2), wood); body.position.y = 1.45;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(4.1, 2.05, 4), roofMat); roof.position.y = 3.45; roof.rotation.y = Math.PI / 4;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(4.18, 0.62, 4), snow); cap.position.y = 4.25; cap.rotation.y = Math.PI / 4;
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.15, 2.05, 0.15), darkWood); door.position.set(0, 1.05, 2.16);
    shadow(body, graphics); shadow(roof, graphics); shadow(cap, graphics); group.add(body, roof, cap, door); root.add(group);
    upgradePirateBuildingAssetWhenReady(root, collision, graphics, asset, x, z, rotation, 4.7, 3, group);
    collision.addCollider({ x, z, radius: 3, minY: y - 1, maxY: y + 4.6 });
  };
  addCabin(55, 211, 0.2, 'house-alt'); addCabin(68, 209, -0.35, 'barracks'); addCabin(69, 199, -1.25, 'house-alt');
  const village = AZURE_FROST_POIS.hunterVillage; const villageY = collision.heightAt(village.x, village.z);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(4.6, 0.075, 6, 48), new THREE.MeshBasicMaterial({ color: 0x8ae8df, transparent: true, opacity: 0.62 }));
  ring.rotation.x = Math.PI / 2; ring.position.set(village.x, villageY + 0.08, village.z); root.add(ring);
  const lanternSpots: readonly [number, number][] = [[56, 198], [64, 203], [61, 211]];
  const lanternPosts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.075, 0.11, 2.7, 7), darkWood, 3);
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.18, 8, 6), nightMaterial, 3);
  lanternSpots.forEach(([x, z], i) => { const y = collision.heightAt(x, z); dummy.position.set(x, y + 1.35, z); dummy.updateMatrix(); lanternPosts.setMatrixAt(i, dummy.matrix); dummy.position.y = y + 2.6; dummy.updateMatrix(); bulbs.setMatrixAt(i, dummy.matrix); if (i < Math.max(0, graphics.pointLights - 2)) { const light = new THREE.PointLight(0x9adfff, 0, 13, 2); light.position.set(x, y + 2.55, z); root.add(light); nightLights.push(light); } });
  shadow(lanternPosts, graphics); root.add(lanternPosts, bulbs);

  // ทะเลสาบน้ำแข็งและรอยแตก
  const lakePoi = AZURE_FROST_POIS.frozenLake; const lakeY = collision.heightAt(lakePoi.x, lakePoi.z);
  const lake = new THREE.Mesh(new THREE.CircleGeometry(6.4, 40), ice); lake.rotation.x = -Math.PI / 2; lake.position.set(lakePoi.x, lakeY + 0.065, lakePoi.z); root.add(lake);
  for (let i = 0; i < 5; i++) { const crack = new THREE.Mesh(new THREE.BoxGeometry(3.2 - i * 0.28, 0.018, 0.045), crystal); crack.position.set(lakePoi.x + (i - 2) * 0.7, lakeY + 0.08, lakePoi.z + (i % 2 ? 0.7 : -0.55)); crack.rotation.y = i * 0.72; root.add(crack); }

  // เหมืองคริสตัล
  const mine = AZURE_FROST_POIS.crystalMine;
  const crystals = new THREE.InstancedMesh(new THREE.ConeGeometry(0.7, 3.4, 5), crystal, 12);
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; const d = 3.5 + i % 3 * 1.15; const x = mine.x + Math.cos(a) * d; const z = mine.z + Math.sin(a) * d; const y = collision.heightAt(x, z); const s = 0.65 + i % 4 * 0.14; dummy.position.set(x, y + 1.45 * s, z); dummy.rotation.set((i % 2 ? 1 : -1) * 0.08, a, (i % 3 - 1) * 0.11); dummy.scale.setScalar(s); dummy.updateMatrix(); crystals.setMatrixAt(i, dummy.matrix); collision.addCollider({ x, z, radius: 0.55 * s, minY: y, maxY: y + 3.4 * s }); }
  shadow(crystals, graphics); root.add(crystals);

  // ป้อมและลานราชันน้ำแข็ง
  const fort = AZURE_FROST_POIS.frostCitadel; const fortZ = fort.z + 5; const fortY = collision.heightAt(fort.x, fortZ);
  const keep = new THREE.Mesh(new THREE.BoxGeometry(10, 5.6, 6.5), stone); keep.position.set(fort.x, fortY + 2.8, fortZ);
  const keepRoof = new THREE.Mesh(new THREE.ConeGeometry(7.1, 3.2, 4), roofMat); keepRoof.position.set(fort.x, fortY + 7, fortZ); keepRoof.rotation.y = Math.PI / 4;
  const gate = new THREE.Mesh(new THREE.BoxGeometry(2.4, 3.6, 0.2), darkWood); gate.position.set(fort.x, fortY + 1.8, fortZ - 3.3);
  shadow(keep, graphics); shadow(keepRoof, graphics); root.add(keep, keepRoof, gate); collision.addCollider({ x: fort.x, z: fortZ, radius: 5.2, minY: fortY - 1, maxY: fortY + 8.5 });
  const towers = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.4, 1.65, 6.2, 8), stone, 2);
  for (let i = 0; i < 2; i++) { const x = fort.x + (i ? 1 : -1) * 7.2; const y = collision.heightAt(x, fortZ); dummy.position.set(x, y + 3.1, fortZ); dummy.rotation.set(0, Math.PI / 8, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); towers.setMatrixAt(i, dummy.matrix); collision.addCollider({ x, z: fortZ, radius: 1.7, minY: y - 1, maxY: y + 6.5 }); }
  shadow(towers, graphics); root.add(towers);
  const arena = new THREE.Mesh(new THREE.TorusGeometry(9, 0.11, 6, 56), new THREE.MeshBasicMaterial({ color: 0x75d8ff, transparent: true, opacity: 0.34 }));
  arena.rotation.x = Math.PI / 2; arena.position.set(fort.x, collision.heightAt(fort.x, fort.z - 5) + 0.1, fort.z - 5); root.add(arena);

  // ป่าสนแบบ instancing
  const random = mulberry32(20260716); const target = graphics.tier === 'low' ? 24 : graphics.tier === 'medium' ? 38 : 52;
  const spots: { x: number; y: number; z: number; scale: number }[] = [];
  for (let attempt = 0; attempt < target * 40 && spots.length < target; attempt++) { const a = random() * Math.PI * 2; const d = Math.sqrt(random()) * AZURE_FROST_RADIUS * 0.82; const x = AZURE_FROST_CENTER.x + Math.cos(a) * d; const z = AZURE_FROST_CENTER.z + Math.sin(a) * d; const y = collision.heightAt(x, z); if (y < 0.3 || AZURE_FROST_POI_LIST.some((poi) => Math.hypot(x - poi.x, z - poi.z) < poi.safeRadius) || spots.some((spot) => Math.hypot(spot.x - x, spot.z - z) < 3.3)) continue; spots.push({ x, y, z, scale: 0.72 + random() * 0.68 }); }
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.3, 1, 7), darkWood, spots.length);
  const crowns = new THREE.InstancedMesh(new THREE.ConeGeometry(1.65, 3.4, 7), pineMat, spots.length * 2);
  spots.forEach((spot, i) => { const h = 4.5 * spot.scale; dummy.position.set(spot.x, spot.y + h / 2, spot.z); dummy.scale.set(spot.scale, h, spot.scale); dummy.rotation.set(0, i * 0.37, 0); dummy.updateMatrix(); trunks.setMatrixAt(i, dummy.matrix); for (let layer = 0; layer < 2; layer++) { dummy.position.set(spot.x, spot.y + h * (0.62 + layer * 0.2), spot.z); dummy.scale.setScalar(spot.scale * (layer ? 0.72 : 1)); dummy.updateMatrix(); crowns.setMatrixAt(i * 2 + layer, dummy.matrix); } collision.addCollider({ x: spot.x, z: spot.z, radius: 0.42 * spot.scale, minY: spot.y - 1, maxY: spot.y + h }); });
  shadow(trunks, graphics); crowns.castShadow = graphics.tier === 'high'; root.add(trunks, crowns);
  scene.add(root);
  return { root };
}
