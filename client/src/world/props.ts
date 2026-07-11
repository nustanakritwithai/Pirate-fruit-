import * as THREE from 'three';
import type { CollisionSystem } from './Collision';
import type { WorldTextures } from './textures';

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

/** noise ตายตัวตามตำแหน่ง (จุดซ้ำกันได้ค่าเดิม — ผิว mesh ไม่แตกตะเข็บ) */
function hashNoise(x: number, y: number, z: number): number {
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * วาดใบปาล์มลง canvas (ก้านกลาง + ใบย่อยแบบขนนก) ใช้เป็น alpha texture
 * ไม่ต้องดาวน์โหลด asset เพิ่ม
 */
function makeFrondTexture(): THREE.CanvasTexture {
  const w = 256;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, w, h);

  // ก้านกลาง (โคนล่าง → ปลายบน)
  const stem = ctx.createLinearGradient(0, h, 0, 0);
  stem.addColorStop(0, '#7a6a3d');
  stem.addColorStop(1, '#5f7a35');
  ctx.strokeStyle = stem;
  ctx.lineWidth = 9;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(w / 2, h - 4);
  ctx.lineTo(w / 2, 6);
  ctx.stroke();

  // ใบย่อยสองฝั่ง เฉียงขึ้น สั้นลงเรื่อยๆ เมื่อใกล้ปลาย
  const rand = mulberry32(7);
  const steps = 34;
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const y = h - 18 - t * (h - 40);
    const len = (1 - t * 0.55) * 105 * (0.85 + rand() * 0.3);
    const lift = 38 + t * 30; // ปลายใบเชิดขึ้น
    const g = 105 + Math.floor(rand() * 55);
    ctx.strokeStyle = `rgba(${30 + Math.floor(rand() * 25)}, ${g}, ${40 + Math.floor(rand() * 25)}, 0.95)`;
    ctx.lineWidth = 5.5 - t * 2.5;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(w / 2, y);
      ctx.quadraticCurveTo(
        w / 2 + side * len * 0.55,
        y - lift * 0.35,
        w / 2 + side * len,
        y - lift,
      );
      ctx.stroke();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

interface PropMaterials {
  bark: THREE.MeshStandardMaterial;
  frond: THREE.MeshStandardMaterial;
  rock: THREE.MeshStandardMaterial;
  crate: THREE.MeshStandardMaterial;
}

function makeMaterials(t: WorldTextures): PropMaterials {
  t.barkColor.repeat.set(1, 2);
  t.barkNormal.repeat.set(1, 2);
  return {
    bark: new THREE.MeshStandardMaterial({
      map: t.barkColor,
      normalMap: t.barkNormal,
      roughness: 0.9,
    }),
    frond: new THREE.MeshStandardMaterial({
      map: makeFrondTexture(),
      alphaTest: 0.35,
      side: THREE.DoubleSide,
      roughness: 0.65,
    }),
    rock: new THREE.MeshStandardMaterial({
      map: t.rockColor,
      normalMap: t.rockNormal,
      roughness: 0.95,
    }),
    crate: new THREE.MeshStandardMaterial({
      map: t.planksColor,
      normalMap: t.planksNormal,
      roughness: 0.8,
    }),
  };
}

/** ใบปาล์มโค้งปลายตก (bend ระนาบตามความยาว) */
function makeFrondGeometry(): THREE.PlaneGeometry {
  const geo = new THREE.PlaneGeometry(0.95, 2.9, 1, 6);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const v = (pos.getY(i) + 1.45) / 2.9; // 0 โคน → 1 ปลาย
    pos.setZ(i, -0.6 * v * v);
  }
  geo.computeVertexNormals();
  return geo;
}

function makePalmTree(rand: () => number, mats: PropMaterials, frondGeo: THREE.PlaneGeometry): THREE.Group {
  const tree = new THREE.Group();

  // ลำต้นโค้งเล็กน้อยแบบปาล์มริมหาด
  const trunkHeight = 4 + rand() * 2.2;
  const bendDir = rand() * Math.PI * 2;
  const bendAmt = 0.35 + rand() * 0.5;
  const trunkGeo = new THREE.CylinderGeometry(0.15, 0.3, trunkHeight, 8, 6);
  const tp = trunkGeo.attributes.position;
  for (let i = 0; i < tp.count; i++) {
    const v = (tp.getY(i) + trunkHeight / 2) / trunkHeight;
    tp.setX(i, tp.getX(i) + Math.cos(bendDir) * bendAmt * v * v);
    tp.setZ(i, tp.getZ(i) + Math.sin(bendDir) * bendAmt * v * v);
  }
  trunkGeo.computeVertexNormals();
  const trunk = new THREE.Mesh(trunkGeo, mats.bark);
  trunk.position.y = trunkHeight / 2;
  trunk.castShadow = true;
  tree.add(trunk);

  // พุ่มใบ: ใบระนาบ alpha กางรอบยอด ปลายตกลง
  const crown = new THREE.Group();
  crown.position.set(
    Math.cos(bendDir) * bendAmt,
    trunkHeight - 0.05,
    Math.sin(bendDir) * bendAmt,
  );
  const frondCount = 9;
  for (let i = 0; i < frondCount; i++) {
    const frond = new THREE.Mesh(frondGeo, mats.frond);
    const angle = (i / frondCount) * Math.PI * 2 + rand() * 0.4;
    frond.position.y = 0.1;
    // ตั้งใบให้กางออกจากยอดแล้วกดปลายลง
    frond.rotation.order = 'YXZ';
    frond.rotation.y = angle;
    frond.rotation.x = -(Math.PI / 2) + 0.55 + rand() * 0.35;
    // ขยับโคนใบออกจากแกนเล็กน้อย
    frond.translateY(1.25);
    frond.castShadow = true;
    crown.add(frond);
  }
  tree.add(crown);
  return tree;
}

function makeRock(rand: () => number, mats: PropMaterials): THREE.Mesh {
  const size = 0.6 + rand() * 1.2;
  const geo = new THREE.IcosahedronGeometry(size, 2);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.set(pos.getX(i), pos.getY(i), pos.getZ(i));
    // ดันผิวเข้า/ออกตาม noise ตำแหน่ง ให้ก้อนหินไม่กลมเนียน
    const n = 0.78 + hashNoise(v.x * 1.7, v.y * 1.7, v.z * 1.7) * 0.42;
    v.multiplyScalar(n);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const rock = new THREE.Mesh(geo, mats.rock);
  rock.scale.y = 0.62 + rand() * 0.3;
  rock.castShadow = true;
  rock.receiveShadow = true;
  return rock;
}

function makeCrate(rand: () => number, mats: PropMaterials): THREE.Mesh {
  const size = 0.8 + rand() * 0.5;
  const crate = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), mats.crate);
  crate.position.y = size / 2;
  crate.castShadow = true;
  crate.receiveShadow = true;
  return crate;
}

/**
 * โปรยต้นไม้/หิน/ลังบนเกาะ พร้อมลงทะเบียน collider ให้เดินชนได้
 */
export function scatterProps(
  scene: THREE.Scene,
  collision: CollisionSystem,
  heightAt: (x: number, z: number) => number,
  islandRadius: number,
  textures: WorldTextures,
): void {
  const rand = mulberry32(20260711);
  const mats = makeMaterials(textures);
  const frondGeo = makeFrondGeometry();
  const placed: { x: number; z: number }[] = [];

  const tryPlace = (minGround: number): { x: number; z: number; y: number } | null => {
    for (let attempt = 0; attempt < 20; attempt++) {
      const angle = rand() * Math.PI * 2;
      const dist = Math.sqrt(rand()) * islandRadius * 0.85;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      const y = heightAt(x, z);
      if (y < minGround) continue;
      // เว้นจุดเกิดผู้เล่นกลางเกาะ และอย่าวางซ้อนกัน
      if (Math.hypot(x, z) < 6) continue;
      if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < 3.5)) continue;
      placed.push({ x, z });
      return { x, z, y };
    }
    return null;
  };

  for (let i = 0; i < 40; i++) {
    const spot = tryPlace(0.8);
    if (!spot) continue;
    const tree = makePalmTree(rand, mats, frondGeo);
    tree.position.set(spot.x, spot.y - 0.1, spot.z);
    tree.rotation.y = rand() * Math.PI * 2;
    scene.add(tree);
    collision.addCollider({ x: spot.x, z: spot.z, radius: 0.4, minY: spot.y - 1, maxY: spot.y + 4 });
  }

  for (let i = 0; i < 25; i++) {
    const spot = tryPlace(0.3);
    if (!spot) continue;
    const rock = makeRock(rand, mats);
    rock.position.set(spot.x, spot.y + 0.1, spot.z);
    rock.rotation.y = rand() * Math.PI * 2;
    scene.add(rock);
    const r = Math.max(rock.geometry.boundingSphere?.radius ?? 1, 0.6) * 0.8;
    collision.addCollider({ x: spot.x, z: spot.z, radius: r, minY: spot.y - 1, maxY: spot.y + 1.2 });
  }

  for (let i = 0; i < 10; i++) {
    const spot = tryPlace(0.8);
    if (!spot) continue;
    const crate = makeCrate(rand, mats);
    crate.position.x = spot.x;
    crate.position.z = spot.z;
    crate.position.y += spot.y;
    crate.rotation.y = rand() * Math.PI * 2;
    scene.add(crate);
    collision.addCollider({ x: spot.x, z: spot.z, radius: 0.7, minY: spot.y - 1, maxY: spot.y + 1 });
  }
}
