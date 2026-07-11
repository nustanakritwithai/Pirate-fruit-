import * as THREE from 'three';
import type { CollisionSystem } from './Collision';

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

function makePalmTree(rand: () => number): THREE.Group {
  const tree = new THREE.Group();

  const trunkHeight = 3.5 + rand() * 2;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.3, trunkHeight, 6),
    new THREE.MeshStandardMaterial({ color: 0x8a6240, roughness: 0.9 }),
  );
  trunk.position.y = trunkHeight / 2;
  trunk.castShadow = true;
  tree.add(trunk);

  const leafMat = new THREE.MeshStandardMaterial({
    color: 0x2e8b3d,
    roughness: 0.8,
    side: THREE.DoubleSide,
  });
  const leafCount = 6;
  for (let i = 0; i < leafCount; i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.6, 4), leafMat);
    const angle = (i / leafCount) * Math.PI * 2;
    leaf.position.set(Math.cos(angle) * 0.9, trunkHeight + 0.2, Math.sin(angle) * 0.9);
    leaf.rotation.set(Math.sin(angle) * 1.1, 0, -Math.cos(angle) * 1.1);
    leaf.castShadow = true;
    tree.add(leaf);
  }
  return tree;
}

function makeRock(rand: () => number): THREE.Mesh {
  const size = 0.6 + rand() * 1.2;
  const rock = new THREE.Mesh(
    new THREE.DodecahedronGeometry(size, 0),
    new THREE.MeshStandardMaterial({ color: 0x7d7f84, roughness: 1 }),
  );
  rock.scale.y = 0.6 + rand() * 0.3;
  rock.castShadow = true;
  rock.receiveShadow = true;
  return rock;
}

function makeCrate(rand: () => number): THREE.Mesh {
  const size = 0.8 + rand() * 0.5;
  const crate = new THREE.Mesh(
    new THREE.BoxGeometry(size, size, size),
    new THREE.MeshStandardMaterial({ color: 0xb08945, roughness: 0.85 }),
  );
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
): void {
  const rand = mulberry32(20260711);
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
    const tree = makePalmTree(rand);
    tree.position.set(spot.x, spot.y - 0.1, spot.z);
    tree.rotation.y = rand() * Math.PI * 2;
    scene.add(tree);
    collision.addCollider({ x: spot.x, z: spot.z, radius: 0.4, minY: spot.y - 1, maxY: spot.y + 4 });
  }

  for (let i = 0; i < 25; i++) {
    const spot = tryPlace(0.3);
    if (!spot) continue;
    const rock = makeRock(rand);
    rock.position.set(spot.x, spot.y + 0.1, spot.z);
    rock.rotation.y = rand() * Math.PI * 2;
    scene.add(rock);
    const r = Math.max(rock.geometry.boundingSphere?.radius ?? 1, 0.6) * 0.8;
    collision.addCollider({ x: spot.x, z: spot.z, radius: r, minY: spot.y - 1, maxY: spot.y + 1.2 });
  }

  for (let i = 0; i < 10; i++) {
    const spot = tryPlace(0.8);
    if (!spot) continue;
    const crate = makeCrate(rand);
    crate.position.x = spot.x;
    crate.position.z = spot.z;
    crate.position.y += spot.y;
    crate.rotation.y = rand() * Math.PI * 2;
    scene.add(crate);
    collision.addCollider({ x: spot.x, z: spot.z, radius: 0.7, minY: spot.y - 1, maxY: spot.y + 1 });
  }
}
