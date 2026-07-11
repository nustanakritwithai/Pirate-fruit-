import * as THREE from 'three';
import type { GraphicsProfile } from '../engine/GraphicsQuality';
import type { CollisionSystem } from './Collision';
import type { WorldTextures } from './textures';
import { WORLD_POI_LIST } from './WorldPOI';

/** สุ่มแบบกำหนด seed ได้ เพื่อให้เกาะหน้าตาเหมือนเดิมทุกครั้งที่โหลด */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeFrondTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createLinearGradient(0, 256, 0, 0);
  gradient.addColorStop(0, '#597439');
  gradient.addColorStop(1, '#2f8c4d');
  ctx.strokeStyle = gradient;
  ctx.lineCap = 'round';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(64, 252);
  ctx.lineTo(64, 4);
  ctx.stroke();
  const random = mulberry32(7);
  for (let i = 0; i < 24; i++) {
    const t = i / 23;
    const y = 244 - t * 225;
    const length = (1 - t * 0.48) * (48 + random() * 7);
    ctx.strokeStyle = `rgba(${28 + random() * 16},${112 + random() * 40},${45 + random() * 18},.97)`;
    ctx.lineWidth = 3.4 - t * 1.5;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(64, y);
      ctx.quadraticCurveTo(64 + side * length * 0.5, y - 10, 64 + side * length, y - 25 - t * 9);
      ctx.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 2;
  return texture;
}

function isProtected(x: number, z: number): boolean {
  return WORLD_POI_LIST.some((poi) => Math.hypot(x - poi.x, z - poi.z) < poi.safeRadius);
}

interface Spot {
  x: number;
  y: number;
  z: number;
  rotation: number;
  scale: number;
}

function createSpots(
  count: number,
  minGround: number,
  islandRadius: number,
  heightAt: (x: number, z: number) => number,
  random: () => number,
  occupied: Spot[],
  spacing: number,
): Spot[] {
  const result: Spot[] = [];
  for (let i = 0; i < count; i++) {
    for (let attempt = 0; attempt < 45; attempt++) {
      const angle = random() * Math.PI * 2;
      const distance = Math.sqrt(random()) * islandRadius * 0.86;
      const x = Math.cos(angle) * distance;
      const z = Math.sin(angle) * distance;
      const y = heightAt(x, z);
      if (y < minGround || isProtected(x, z)) continue;
      if (occupied.some((spot) => Math.hypot(spot.x - x, spot.z - z) < spacing)) continue;
      const spot = { x, y, z, rotation: random() * Math.PI * 2, scale: 0.82 + random() * 0.42 };
      occupied.push(spot);
      result.push(spot);
      break;
    }
  }
  return result;
}

function addPalms(
  scene: THREE.Scene,
  collision: CollisionSystem,
  spots: Spot[],
  textures: WorldTextures,
  graphics: GraphicsProfile,
): void {
  const bark = new THREE.MeshStandardMaterial({
    map: textures.barkColor,
    normalMap: textures.barkNormal,
    roughness: 0.92,
  });
  const frond = new THREE.MeshStandardMaterial({
    map: makeFrondTexture(),
    alphaTest: 0.42,
    side: THREE.DoubleSide,
    roughness: 0.72,
  });
  const trunkGeometry = new THREE.CylinderGeometry(0.18, 0.3, 1, 7, 2);
  const frondGeometry = new THREE.PlaneGeometry(0.9, 3.05, 1, 3);
  frondGeometry.translate(0, 1.52, 0);
  const trunks = new THREE.InstancedMesh(trunkGeometry, bark, spots.length);
  const leaves = new THREE.InstancedMesh(
    frondGeometry,
    frond,
    spots.length * graphics.palmFronds,
  );
  const dummy = new THREE.Object3D();
  let leafIndex = 0;

  spots.forEach((spot, index) => {
    const height = 4.6 * spot.scale;
    dummy.position.set(spot.x, spot.y + height / 2, spot.z);
    dummy.rotation.set(0, spot.rotation, 0);
    dummy.scale.set(spot.scale, height, spot.scale);
    dummy.updateMatrix();
    trunks.setMatrixAt(index, dummy.matrix);

    for (let f = 0; f < graphics.palmFronds; f++) {
      const angle = spot.rotation + (f / graphics.palmFronds) * Math.PI * 2;
      dummy.position.set(spot.x, spot.y + height - 0.1, spot.z);
      dummy.rotation.order = 'YXZ';
      dummy.rotation.set(-Math.PI / 2 + 0.62 + (f % 2) * 0.12, angle, 0);
      dummy.scale.setScalar(0.92 * spot.scale);
      dummy.updateMatrix();
      leaves.setMatrixAt(leafIndex++, dummy.matrix);
    }
    collision.addCollider({
      x: spot.x,
      z: spot.z,
      radius: 0.42 * spot.scale,
      minY: spot.y - 1,
      maxY: spot.y + height,
    });
  });
  trunks.castShadow = graphics.shadows;
  trunks.receiveShadow = graphics.shadows;
  // ใบไม้ alpha + เงาเป็นคอขวดใหญ่ เปิดเฉพาะโหมดสวย
  leaves.castShadow = graphics.tier === 'high';
  scene.add(trunks, leaves);
}

function addRocks(
  scene: THREE.Scene,
  collision: CollisionSystem,
  spots: Spot[],
  textures: WorldTextures,
  graphics: GraphicsProfile,
): void {
  const geometry = new THREE.IcosahedronGeometry(1, graphics.tier === 'high' ? 2 : 1);
  const material = new THREE.MeshStandardMaterial({
    map: textures.rockColor,
    normalMap: textures.rockNormal,
    roughness: 0.96,
  });
  const rocks = new THREE.InstancedMesh(geometry, material, spots.length);
  const dummy = new THREE.Object3D();
  spots.forEach((spot, index) => {
    dummy.position.set(spot.x, spot.y + 0.45 * spot.scale, spot.z);
    dummy.rotation.set(spot.rotation * 0.25, spot.rotation, spot.rotation * 0.1);
    dummy.scale.set(spot.scale, spot.scale * 0.62, spot.scale * 0.9);
    dummy.updateMatrix();
    rocks.setMatrixAt(index, dummy.matrix);
    collision.addCollider({
      x: spot.x,
      z: spot.z,
      radius: 0.78 * spot.scale,
      minY: spot.y - 1,
      maxY: spot.y + 1.2 * spot.scale,
    });
  });
  rocks.castShadow = graphics.shadows;
  rocks.receiveShadow = graphics.shadows;
  scene.add(rocks);
}

function addCrates(
  scene: THREE.Scene,
  collision: CollisionSystem,
  spots: Spot[],
  textures: WorldTextures,
  graphics: GraphicsProfile,
): void {
  const material = new THREE.MeshStandardMaterial({
    map: textures.planksColor,
    normalMap: textures.planksNormal,
    roughness: 0.86,
  });
  const crates = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, spots.length);
  const dummy = new THREE.Object3D();
  spots.forEach((spot, index) => {
    dummy.position.set(spot.x, spot.y + spot.scale / 2, spot.z);
    dummy.rotation.set(0, spot.rotation, 0);
    dummy.scale.setScalar(spot.scale);
    dummy.updateMatrix();
    crates.setMatrixAt(index, dummy.matrix);
    collision.addCollider({
      x: spot.x,
      z: spot.z,
      radius: 0.65 * spot.scale,
      minY: spot.y - 1,
      maxY: spot.y + spot.scale,
    });
  });
  crates.castShadow = graphics.shadows;
  crates.receiveShadow = graphics.shadows;
  scene.add(crates);
}

/** โปรยธรรมชาติด้วย InstancedMesh ลดหลายร้อย draw calls เหลือไม่กี่ calls */
export function scatterProps(
  scene: THREE.Scene,
  collision: CollisionSystem,
  heightAt: (x: number, z: number) => number,
  islandRadius: number,
  textures: WorldTextures,
  graphics: GraphicsProfile,
): void {
  const random = mulberry32(20260711);
  const occupied: Spot[] = [];
  const palms = createSpots(graphics.palmCount, 0.55, islandRadius, heightAt, random, occupied, 3.3);
  const rocks = createSpots(graphics.rockCount, 0.15, islandRadius, heightAt, random, occupied, 2.5);
  const crates = createSpots(graphics.crateCount, 0.55, islandRadius, heightAt, random, occupied, 2.2);
  addPalms(scene, collision, palms, textures, graphics);
  addRocks(scene, collision, rocks, textures, graphics);
  addCrates(scene, collision, crates, textures, graphics);
}
