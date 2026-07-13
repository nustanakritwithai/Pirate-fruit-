import * as THREE from 'three';
import type { GraphicsProfile } from '../engine/GraphicsQuality';
import type { CollisionSystem } from '../world/Collision';
import type { WorldTextures } from '../world/textures';
import { WORLD_POIS } from '../world/WorldPOI';
import {
  createGlassMaterial,
  createMobileMaterial,
  tiledTexture,
} from '../art/MobilePBRMaterials';

export interface StarterIslandResult {
  nightMaterial: THREE.MeshStandardMaterial;
  nightLights: THREE.PointLight[];
}

interface BuildContext {
  scene: THREE.Scene;
  collision: CollisionSystem;
  textures: WorldTextures;
  graphics: GraphicsProfile;
  nightMaterial: THREE.MeshStandardMaterial;
  nightLights: THREE.PointLight[];
  materials: BuildMaterials;
}

interface BuildMaterials {
  wall: THREE.MeshStandardMaterial;
  darkWood: THREE.MeshStandardMaterial;
  wood: THREE.MeshStandardMaterial;
  roof: THREE.MeshStandardMaterial;
  rope: THREE.MeshStandardMaterial;
  stone: THREE.MeshStandardMaterial;
  foliage: THREE.MeshStandardMaterial;
  fruit: THREE.MeshStandardMaterial;
  window: THREE.MeshPhysicalMaterial;
}

const safeMaterial = new THREE.MeshBasicMaterial({ color: 0x64e7c6, transparent: true, opacity: 0.68 });

function createBuildingMaterials(textures: WorldTextures): BuildMaterials {
  return {
    wall: createMobileMaterial('plaster', {
      color: 0xd7b17e,
      map: tiledTexture(textures.sandColor, 2.2, 1.6),
      normalMap: tiledTexture(textures.sandNormal, 2.2, 1.6),
      normalStrength: 0.34,
    }),
    darkWood: createMobileMaterial('darkWood', {
      color: 0x4a2d1c,
      map: tiledTexture(textures.planksColor, 1.2, 2.4),
      normalMap: tiledTexture(textures.planksNormal, 1.2, 2.4),
      normalStrength: 0.52,
    }),
    wood: createMobileMaterial('wood', {
      color: 0xb88a58,
      map: tiledTexture(textures.planksColor, 1.3, 1.3),
      normalMap: tiledTexture(textures.planksNormal, 1.3, 1.3),
      normalStrength: 0.58,
    }),
    roof: createMobileMaterial('terracotta', { color: 0x8a3929 }),
    rope: createMobileMaterial('rope', { color: 0xa58a5e }),
    stone: createMobileMaterial('stone', {
      color: 0x858b88,
      map: tiledTexture(textures.rockColor, 2.4, 2.4),
      normalMap: tiledTexture(textures.rockNormal, 2.4, 2.4),
      normalStrength: 0.7,
    }),
    foliage: createMobileMaterial('foliage', { color: 0x34764a, roughness: 0.82 }),
    fruit: createMobileMaterial('shell', {
      color: 0xb75cff,
      emissive: 0x351050,
      emissiveIntensity: 0.7,
      roughness: 0.38,
    }),
    window: createGlassMaterial(0x7eb6c8),
  };
}

function shadow(mesh: THREE.Mesh | THREE.InstancedMesh, graphics: GraphicsProfile, receive = true): void {
  mesh.castShadow = graphics.shadows;
  mesh.receiveShadow = receive && graphics.shadows;
}

function makeHut(
  ctx: BuildContext,
  x: number,
  z: number,
  rotation: number,
  scale = 1,
): void {
  const y = ctx.collision.heightAt(x, z);
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.rotation.y = rotation;

  const foundation = new THREE.Mesh(
    new THREE.CylinderGeometry(3.15 * scale, 3.35 * scale, 0.55, 8),
    ctx.materials.stone,
  );
  foundation.position.y = 0.15;
  shadow(foundation, ctx.graphics);
  group.add(foundation);

  const walls = new THREE.Mesh(new THREE.BoxGeometry(5.3 * scale, 3.1, 4.4 * scale), ctx.materials.wall);
  walls.position.y = 1.85;
  shadow(walls, ctx.graphics);
  group.add(walls);

  const roof = new THREE.Mesh(new THREE.ConeGeometry(4.2 * scale, 2.15, 4), ctx.materials.roof);
  roof.position.y = 4.15;
  roof.rotation.y = Math.PI / 4;
  roof.scale.z = 0.82;
  shadow(roof, ctx.graphics, false);
  group.add(roof);

  const door = new THREE.Mesh(new THREE.BoxGeometry(1.25, 2.25, 0.14), ctx.materials.darkWood);
  door.position.set(0, 1.25, 2.27 * scale);
  group.add(door);

  for (const side of [-1, 1]) {
    const window = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.75, 0.1), ctx.materials.window);
    window.position.set(side * 1.55 * scale, 2.05, 2.3 * scale);
    group.add(window);
  }

  const beamGeometry = new THREE.BoxGeometry(0.18, 3.25, 0.2);
  const beams = new THREE.InstancedMesh(beamGeometry, ctx.materials.darkWood, 4);
  const beamDummy = new THREE.Object3D();
  let beamIndex = 0;
  for (const sideX of [-1, 1]) {
    for (const sideZ of [-1, 1]) {
      beamDummy.position.set(sideX * 2.47 * scale, 1.85, sideZ * 2.02 * scale);
      beamDummy.updateMatrix();
      beams.setMatrixAt(beamIndex++, beamDummy.matrix);
    }
  }
  shadow(beams, ctx.graphics);
  group.add(beams);

  ctx.scene.add(group);
  ctx.collision.addCollider({
    x,
    z,
    radius: 3 * scale,
    minY: y - 1,
    maxY: y + 5.5,
  });
}

function buildVillage(ctx: BuildContext): void {
  makeHut(ctx, -11, 12, 1.05, 0.95);
  makeHut(ctx, 11.5, 14, -0.75, 1.05);
  makeHut(ctx, -13, -1, 1.75, 0.86);
  makeHut(ctx, 13.5, 1.5, -1.65, 0.9);

  const center = WORLD_POIS.village;
  const centerY = ctx.collision.heightAt(center.x, center.z) + 0.08;
  const safeRing = new THREE.Mesh(new THREE.TorusGeometry(4.6, 0.08, 6, 48), safeMaterial);
  safeRing.rotation.x = Math.PI / 2;
  safeRing.position.set(center.x, centerY, center.z);
  ctx.scene.add(safeRing);

  const sign = new THREE.Group();
  const signY = ctx.collision.heightAt(-4.5, 3.5);
  sign.position.set(-4.5, signY, 3.5);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 2.2, 8), ctx.materials.darkWood);
  post.position.y = 1.1;
  const board = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.8, 0.16), ctx.materials.darkWood);
  board.position.y = 1.85;
  board.rotation.z = -0.05;
  sign.add(post, board);
  ctx.scene.add(sign);
  ctx.collision.addCollider({ x: -4.5, z: 3.5, radius: 0.25, minY: signY, maxY: signY + 2.4 });

  buildLanterns(ctx, [
    [-5, 7],
    [5, 7],
    [-6, 17],
    [6, 18],
    [0, -8],
  ]);
}

function buildLanterns(ctx: BuildContext, positions: [number, number][]): void {
  const postGeo = new THREE.CylinderGeometry(0.075, 0.1, 2.7, 6);
  const bulbGeo = new THREE.SphereGeometry(0.19, 8, 6);
  const posts = new THREE.InstancedMesh(postGeo, ctx.materials.darkWood, positions.length);
  const bulbs = new THREE.InstancedMesh(bulbGeo, ctx.nightMaterial, positions.length);
  const dummy = new THREE.Object3D();

  positions.forEach(([x, z], index) => {
    const y = ctx.collision.heightAt(x, z);
    dummy.position.set(x, y + 1.35, z);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    posts.setMatrixAt(index, dummy.matrix);
    dummy.position.y = y + 2.62;
    dummy.updateMatrix();
    bulbs.setMatrixAt(index, dummy.matrix);

    if (index < ctx.graphics.pointLights) {
      const light = new THREE.PointLight(0xffbc66, 0, 13, 2);
      light.position.set(x, y + 2.5, z);
      ctx.scene.add(light);
      ctx.nightLights.push(light);
    }
  });
  shadow(posts, ctx.graphics);
  ctx.scene.add(posts, bulbs);
}

function buildHarbor(ctx: BuildContext): void {
  const dockY = 0.42;
  const boardCount = 34;
  const boardGeo = new THREE.BoxGeometry(4.6, 0.16, 0.92);
  const boards = new THREE.InstancedMesh(boardGeo, ctx.materials.wood, boardCount);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < boardCount; i++) {
    dummy.position.set(0, dockY, -28.3 - i * 0.9);
    dummy.rotation.y = (i % 3 - 1) * 0.008;
    dummy.updateMatrix();
    boards.setMatrixAt(i, dummy.matrix);
  }
  shadow(boards, ctx.graphics);
  ctx.scene.add(boards);

  const postCount = 16;
  const posts = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.13, 0.17, 3.1, 7),
    ctx.materials.darkWood,
    postCount,
  );
  for (let i = 0; i < postCount; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const row = Math.floor(i / 2);
    dummy.position.set(side * 2.15, dockY - 1.15, -29 - row * 4.1);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    posts.setMatrixAt(i, dummy.matrix);
  }
  shadow(posts, ctx.graphics);
  ctx.scene.add(posts);

  ctx.collision.addPlatform({ minX: -2.35, maxX: 2.35, minZ: -59, maxZ: -27.7, y: dockY + 0.09 });
}

function buildTrainingBeach(ctx: BuildContext): void {
  const { x, z } = WORLD_POIS.trainingBeach;
  for (let i = -1; i <= 1; i++) {
    const dx = x + i * 3.2;
    const dz = z + Math.abs(i) * 0.8;
    const y = ctx.collision.heightAt(dx, dz);
    const dummy = new THREE.Group();
    dummy.position.set(dx, y, dz);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 2.5, 8), ctx.materials.darkWood);
    pole.position.y = 1.25;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.58, 1.25, 10), ctx.materials.rope);
    body.position.y = 1.55;
    const arms = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.9, 7), ctx.materials.darkWood);
    arms.position.y = 1.9;
    arms.rotation.z = Math.PI / 2;
    dummy.add(pole, body, arms);
    ctx.scene.add(dummy);
    ctx.collision.addCollider({ x: dx, z: dz, radius: 0.62, minY: y, maxY: y + 2.6 });
  }
}

function buildFruitGrove(ctx: BuildContext): void {
  const { x, z } = WORLD_POIS.fruitGrove;
  const y = ctx.collision.heightAt(x, z);
  const tree = new THREE.Group();
  tree.position.set(x, y, z);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.72, 5.6, 12), ctx.materials.darkWood);
  trunk.position.y = 2.8;
  for (const offset of [[0, 5.7, 0], [-1.3, 5.2, 0.2], [1.2, 5.15, -0.3]] as const) {
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.8, 2), ctx.materials.foliage);
    crown.position.set(offset[0], offset[1], offset[2]);
    shadow(crown, ctx.graphics, false);
    tree.add(crown);
  }
  tree.add(trunk);
  ctx.scene.add(tree);

  const fruits = new THREE.InstancedMesh(new THREE.SphereGeometry(0.24, 12, 8), ctx.materials.fruit, 8);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    dummy.position.set(x + Math.cos(angle) * 1.45, y + 4.8 + (i % 3) * 0.35, z + Math.sin(angle) * 1.2);
    dummy.updateMatrix();
    fruits.setMatrixAt(i, dummy.matrix);
  }
  ctx.scene.add(fruits);
  ctx.collision.addCollider({ x, z, radius: 0.85, minY: y, maxY: y + 6 });
}

function buildHillShrine(ctx: BuildContext): void {
  const { x, z } = WORLD_POIS.hillShrine;
  const y = ctx.collision.heightAt(x, z);
  const group = new THREE.Group();
  group.position.set(x, y, z);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(3.1, 3.35, 0.42, 12), ctx.materials.stone);
  base.position.y = 0.2;
  const beam = new THREE.BoxGeometry(0.35, 3.2, 0.35);
  for (const side of [-1, 1]) {
    const pillar = new THREE.Mesh(beam, ctx.materials.roof);
    pillar.position.set(side * 1.7, 1.9, 0);
    group.add(pillar);
  }
  const top = new THREE.Mesh(new THREE.BoxGeometry(4.7, 0.38, 0.48), ctx.materials.roof);
  top.position.y = 3.45;
  group.add(base, top);
  ctx.scene.add(group);
}

/** สร้างสถานที่หลักของเกาะเริ่มต้นโดยใช้ geometry และ material ร่วมกัน */
export function buildStarterIsland(
  scene: THREE.Scene,
  collision: CollisionSystem,
  textures: WorldTextures,
  graphics: GraphicsProfile,
): StarterIslandResult {
  const nightMaterial = createMobileMaterial('shell', {
    color: 0xffc66e,
    emissive: 0xff9d36,
    emissiveIntensity: 0.1,
    roughness: 0.35,
  });
  const nightLights: THREE.PointLight[] = [];
  const materials = createBuildingMaterials(textures);
  const ctx: BuildContext = {
    scene,
    collision,
    textures,
    graphics,
    nightMaterial,
    nightLights,
    materials,
  };
  buildVillage(ctx);
  buildHarbor(ctx);
  buildTrainingBeach(ctx);
  buildFruitGrove(ctx);
  buildHillShrine(ctx);
  return { nightMaterial, nightLights };
}
