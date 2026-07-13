import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { PiratePlayerRig } from './CharacterRig';
import { createMobileMaterial } from './MobilePBRMaterials';

export interface PiratePlayerVisualResult {
  group: THREE.Group;
  hull: THREE.Mesh;
  rig: PiratePlayerRig;
}

function namedGroup(name: string, position: THREE.Vector3Tuple): THREE.Group {
  const group = new THREE.Group();
  group.name = name;
  group.position.set(...position);
  return group;
}

function capsule(
  radius: number,
  length: number,
  material: THREE.Material,
  segments = 9,
): THREE.Mesh {
  return new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 4, segments), material);
}

function setMobileMeshFlags(root: THREE.Object3D): void {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    mesh.frustumCulled = true;
  });
}

type PlayerAtlasSurface = 'fabric' | 'skin' | 'metal';

/** bake สีลง vertex แล้วรวม mesh ที่อยู่ pivot เดียวกันให้เหลือ 3 material slots */
function compactPlayerMaterialsAndMeshes(root: THREE.Group, pivots: THREE.Group[]): void {
  const fabric = createMobileMaterial('cloth', { color: 0xffffff, roughness: 0.84 });
  const skin = createMobileMaterial('skin', { color: 0xffffff, roughness: 0.56 });
  const metal = createMobileMaterial('paintedMetal', {
    color: 0xffffff,
    metalness: 0.7,
    roughness: 0.35,
  });
  fabric.vertexColors = skin.vertexColors = metal.vertexColors = true;
  const atlases: Record<PlayerAtlasSurface, THREE.MeshStandardMaterial> = { fabric, skin, metal };
  const sourceMaterials = new Set<THREE.Material>();

  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material)) return;
    const source = mesh.material as THREE.MeshStandardMaterial;
    sourceMaterials.add(source);
    const surface = (source.userData.playerAtlas ?? 'fabric') as PlayerAtlasSurface;
    const geometry = mesh.geometry.clone();
    const colors = new Float32Array(geometry.getAttribute('position').count * 3);
    for (let i = 0; i < colors.length; i += 3) {
      colors[i] = source.color.r;
      colors[i + 1] = source.color.g;
      colors[i + 2] = source.color.b;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    mesh.geometry = geometry;
    mesh.material = atlases[surface];
  });

  for (const pivot of pivots) {
    const directMeshes = pivot.children.filter((child): child is THREE.Mesh => (child as THREE.Mesh).isMesh);
    const byMaterial = new Map<THREE.Material, THREE.Mesh[]>();
    for (const mesh of directMeshes) {
      const material = mesh.material as THREE.Material;
      const list = byMaterial.get(material) ?? [];
      list.push(mesh);
      byMaterial.set(material, list);
    }
    for (const [material, meshes] of byMaterial) {
      if (meshes.length < 2) continue;
      const geometries = meshes.map((mesh) => {
        mesh.updateMatrix();
        return mesh.geometry.clone().applyMatrix4(mesh.matrix);
      });
      const mergedGeometry = mergeGeometries(geometries, false);
      if (!mergedGeometry) continue;
      const merged = new THREE.Mesh(mergedGeometry, material);
      const hullName = meshes.find((mesh) => mesh.name === 'player:hull:torso')?.name;
      merged.name = hullName ?? `player:merged:${pivot.name}:${material.uuid}`;
      pivot.remove(...meshes);
      pivot.add(merged);
    }
  }

  for (const material of sourceMaterials) material.dispose();
}

/**
 * ตัวละครผู้เล่น Pirate V1 สร้างขึ้นใหม่สำหรับ Pirate Fruit
 * เป็น articulated mobile-PBR rig ที่เราควบคุม pivot และ palm socket เองทั้งหมด
 */
export function createPiratePlayerVisual(): PiratePlayerVisualResult {
  const group = new THREE.Group();
  group.name = 'player:pirate-v1';

  const root = namedGroup('player-rig:root', [0, 0, 0]);
  const hips = namedGroup('player-rig:hips', [0, 0.88, 0]);
  const spine = namedGroup('player-rig:spine', [0, 0.1, 0]);
  const chest = namedGroup('player-rig:chest', [0, 0.38, 0]);
  const head = namedGroup('player-rig:head', [0, 0.58, 0]);
  group.add(root);
  root.add(hips);
  hips.add(spine);
  spine.add(chest);
  chest.add(head);

  const coat = createMobileMaterial('cloth', {
    color: 0x17364b,
    roughness: 0.82,
    normalStrength: 0.34,
  });
  const coatEdge = createMobileMaterial('cloth', { color: 0x7d2632, roughness: 0.86 });
  const shirt = createMobileMaterial('cloth', { color: 0xe7ddc5, roughness: 0.94 });
  const pants = createMobileMaterial('cloth', { color: 0x202a32, roughness: 0.9 });
  const skin = createMobileMaterial('skin', { color: 0xb97950, roughness: 0.56 });
  const leather = createMobileMaterial('leather', { color: 0x41271b, roughness: 0.7 });
  const darkLeather = createMobileMaterial('leather', { color: 0x171514, roughness: 0.78 });
  const brass = createMobileMaterial('paintedMetal', {
    color: 0xc69a45,
    metalness: 0.7,
    roughness: 0.35,
  });
  const hair = createMobileMaterial('darkWood', { color: 0x211713, roughness: 0.94 });
  const eyeWhite = createMobileMaterial('shell', { color: 0xe9e5d8, roughness: 0.38 });
  const iris = createMobileMaterial('shell', { color: 0x17232a, roughness: 0.26 });
  skin.userData.playerAtlas = 'skin';
  brass.userData.playerAtlas = 'metal';

  // สะโพกและลำตัว: silhouette แบบ human proportion ไม่ใช่ chibi
  const pelvis = capsule(0.29, 0.18, pants, 10);
  pelvis.name = 'player:hull:pelvis';
  pelvis.position.y = 0.08;
  pelvis.scale.set(1.12, 0.8, 0.84);
  hips.add(pelvis);

  const torso = capsule(0.34, 0.3, coat, 11);
  torso.name = 'player:hull:torso';
  torso.position.y = 0.04;
  torso.scale.set(1.03, 1, 0.76);
  chest.add(torso);

  const shirtPanel = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.56, 0.045), shirt);
  shirtPanel.name = 'player:shirt';
  shirtPanel.position.set(0, 0.06, 0.276);
  const leftLapel = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.58, 0.055), coatEdge);
  leftLapel.position.set(-0.12, 0.08, 0.31);
  leftLapel.rotation.z = -0.17;
  const rightLapel = leftLapel.clone();
  rightLapel.position.x = 0.12;
  rightLapel.rotation.z = 0.17;
  const sash = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.3, 0.14, 14), coatEdge);
  sash.position.y = -0.29;
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.035, 6, 18), leather);
  belt.position.y = -0.24;
  belt.rotation.x = Math.PI / 2;
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.055), brass);
  buckle.position.set(0, -0.24, 0.3);
  chest.add(shirtPanel, leftLapel, rightLapel, sash, belt, buckle);

  for (const side of [-1, 1]) {
    const coatTail = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.58, 0.07), coat);
    coatTail.position.set(side * 0.17, -0.52, -0.08);
    coatTail.rotation.x = -0.08;
    coatTail.rotation.z = side * 0.06;
    chest.add(coatTail);
  }

  // ใบหน้าใหม่และผ้าโพกหัวโจรสลัด
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.13, 0.2, 10), skin);
  neck.position.y = -0.08;
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.255, 16, 11), skin);
  face.name = 'player:face';
  face.scale.set(0.9, 1.08, 0.88);
  face.position.y = 0.18;
  const jaw = capsule(0.145, 0.1, skin, 9);
  jaw.position.set(0, 0.04, 0.05);
  jaw.scale.set(1.12, 0.82, 0.9);
  const hairCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.26, 14, 7, 0, Math.PI * 2, 0, Math.PI * 0.54),
    hair,
  );
  hairCap.position.y = 0.25;
  const bandana = new THREE.Mesh(
    new THREE.CylinderGeometry(0.245, 0.26, 0.14, 14),
    coatEdge,
  );
  bandana.position.y = 0.35;
  const bandanaKnot = new THREE.Mesh(new THREE.SphereGeometry(0.075, 9, 6), coatEdge);
  bandanaKnot.position.set(-0.23, 0.32, -0.06);
  const bandanaTail = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.34, 0.035), coatEdge);
  bandanaTail.position.set(-0.25, 0.16, -0.09);
  bandanaTail.rotation.z = 0.24;
  head.add(neck, face, jaw, hairCap, bandana, bandanaKnot, bandanaTail);

  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.044, 8, 6), eyeWhite);
    eye.position.set(side * 0.082, 0.21, 0.214);
    eye.scale.set(1, 0.72, 0.42);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.022, 7, 5), iris);
    pupil.position.set(side * 0.082, 0.21, 0.247);
    pupil.scale.z = 0.42;
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.022, 0.02), hair);
    brow.position.set(side * 0.085, 0.275, 0.229);
    brow.rotation.z = side * -0.08;
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), skin);
    ear.position.set(side * 0.235, 0.18, 0);
    head.add(eye, pupil, brow, ear);
  }
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.12, 7), skin);
  nose.position.set(0, 0.155, 0.265);
  nose.rotation.x = Math.PI / 2;
  const beard = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.12, 3, 8), hair);
  beard.position.set(0, -0.035, 0.19);
  beard.scale.set(1.35, 1, 0.4);
  const earring = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.012, 5, 10), brass);
  earring.position.set(-0.25, 0.105, 0);
  earring.rotation.y = Math.PI / 2;
  head.add(nose, beard, earring);

  const createArm = (side: -1 | 1): {
    arm: THREE.Group;
    foreArm: THREE.Group;
    hand: THREE.Group;
    palmSocket: THREE.Group;
  } => {
    const arm = namedGroup(
      side < 0 ? 'player-rig:left-arm' : 'player-rig:right-arm',
      [side * 0.43, 0.34, 0],
    );
    arm.rotation.z = side * 0.08;
    const upper = capsule(0.125, 0.22, coat, 9);
    upper.position.y = -0.2;
    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.155, 10, 7), coatEdge);
    shoulder.scale.set(1, 0.72, 0.86);
    shoulder.position.y = -0.02;
    arm.add(upper, shoulder);

    const foreArm = namedGroup(
      side < 0 ? 'player-rig:left-forearm' : 'player-rig:right-forearm',
      [0, -0.4, 0],
    );
    const sleeve = capsule(0.115, 0.2, coat, 9);
    sleeve.position.y = -0.18;
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.105, 0.11, 10), leather);
    cuff.position.y = -0.36;
    foreArm.add(sleeve, cuff);
    arm.add(foreArm);

    const hand = namedGroup(
      side < 0 ? 'player-rig:left-hand' : 'player-rig:right-hand',
      [0, -0.42, 0],
    );
    const palm = capsule(0.105, 0.055, skin, 8);
    palm.name = side < 0 ? 'player:left-palm' : 'player:right-palm';
    palm.position.y = -0.075;
    palm.scale.set(0.88, 1, 0.75);
    hand.add(palm);
    foreArm.add(hand);

    const palmSocket = namedGroup(
      side < 0 ? 'socket:left-palm' : 'socket:right-palm',
      [0, -0.075, 0],
    );
    palmSocket.userData.equipmentAnchor = true;
    hand.add(palmSocket);
    return { arm, foreArm, hand, palmSocket };
  };

  const left = createArm(-1);
  const right = createArm(1);
  chest.add(left.arm, right.arm);

  const createLeg = (side: -1 | 1): {
    leg: THREE.Group;
    lowerLeg: THREE.Group;
    foot: THREE.Group;
  } => {
    const leg = namedGroup(
      side < 0 ? 'player-rig:left-leg' : 'player-rig:right-leg',
      [side * 0.18, 0, 0],
    );
    const thigh = capsule(0.14, 0.22, pants, 9);
    thigh.position.y = -0.22;
    thigh.scale.z = 0.9;
    leg.add(thigh);

    const lowerLeg = namedGroup(
      side < 0 ? 'player-rig:left-lower-leg' : 'player-rig:right-lower-leg',
      [0, -0.43, 0],
    );
    const shin = capsule(0.115, 0.2, pants, 8);
    shin.position.y = -0.18;
    lowerLeg.add(shin);
    leg.add(lowerLeg);

    const foot = namedGroup(
      side < 0 ? 'player-rig:left-foot' : 'player-rig:right-foot',
      [0, -0.39, 0],
    );
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.2, 0.4), darkLeather);
    boot.position.set(0, 0.035, 0.075);
    const bootCuff = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.12, 0.18, 10), leather);
    bootCuff.position.y = 0.12;
    foot.add(boot, bootCuff);
    lowerLeg.add(foot);
    return { leg, lowerLeg, foot };
  };

  const leftLeg = createLeg(-1);
  const rightLeg = createLeg(1);
  hips.add(leftLeg.leg, rightLeg.leg);

  const hipsSocket = namedGroup('socket:hips', [0.34, 0.08, 0]);
  hipsSocket.userData.equipmentAnchor = true;
  hips.add(hipsSocket);

  const rig: PiratePlayerRig = {
    modelRoot: group,
    root,
    hips,
    spine,
    chest,
    head,
    leftArm: left.arm,
    leftForeArm: left.foreArm,
    leftHand: left.hand,
    rightArm: right.arm,
    rightForeArm: right.foreArm,
    rightHand: right.hand,
    leftLeg: leftLeg.leg,
    leftLowerLeg: leftLeg.lowerLeg,
    leftFoot: leftLeg.foot,
    rightLeg: rightLeg.leg,
    rightLowerLeg: rightLeg.lowerLeg,
    rightFoot: rightLeg.foot,
    leftPalmSocket: left.palmSocket,
    rightPalmSocket: right.palmSocket,
    hipsSocket,
  };

  compactPlayerMaterialsAndMeshes(group, [
    hips,
    chest,
    head,
    left.arm,
    left.foreArm,
    left.hand,
    right.arm,
    right.foreArm,
    right.hand,
    leftLeg.leg,
    leftLeg.lowerLeg,
    leftLeg.foot,
    rightLeg.leg,
    rightLeg.lowerLeg,
    rightLeg.foot,
  ]);
  setMobileMeshFlags(group);
  const hull = group.getObjectByName('player:hull:torso') as THREE.Mesh;
  return { group, hull, rig };
}
