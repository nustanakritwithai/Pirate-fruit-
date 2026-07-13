import * as THREE from 'three';
import type { CharacterRig } from './CharacterRig';
import { createMobileMaterial } from './MobilePBRMaterials';

export interface HumanoidVisualOptions {
  clothColor: THREE.ColorRepresentation;
  accentColor?: THREE.ColorRepresentation;
  skinColor?: THREE.ColorRepresentation;
  pirate?: boolean;
  boss?: boolean;
}

export interface CharacterVisualResult {
  /** world root — gameplay ย้าย/หมุน object นี้ */
  group: THREE.Group;
  /** mesh หลักสำหรับ hit flash */
  hull: THREE.Mesh;
  /** articulated pivots — animation เปลี่ยนเฉพาะส่วนนี้ */
  rig: CharacterRig;
}

function addShadowFlags(root: THREE.Object3D): void {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    mesh.frustumCulled = true;
  });
}

function capsule(radius: number, length: number, material: THREE.Material): THREE.Mesh {
  return new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 4, 10), material);
}

function namedGroup(name: string, position: THREE.Vector3Tuple): THREE.Group {
  const group = new THREE.Group();
  group.name = name;
  group.position.set(...position);
  return group;
}

/** มนุษย์ articulated แบบ Stylized Realism — pivot พร้อม Idle/Walk/Attack/Talk */
export function createHumanoidVisual(options: HumanoidVisualOptions): CharacterVisualResult {
  const group = new THREE.Group();
  const motionRoot = namedGroup('rig:root', [0, 0, 0]);
  group.add(motionRoot);

  const cloth = createMobileMaterial('cloth', { color: options.clothColor });
  const accent = createMobileMaterial('cloth', {
    color: options.accentColor ?? 0x742f27,
    roughness: 0.84,
  });
  const skin = createMobileMaterial('skin', { color: options.skinColor ?? 0xc98f68 });
  const leather = createMobileMaterial('leather', { color: 0x30231c });
  const boot = createMobileMaterial('leather', { color: 0x191716, roughness: 0.76 });
  const metal = createMobileMaterial('iron', { color: 0x9aa3a8, roughness: 0.42 });
  const hair = createMobileMaterial('darkWood', { color: 0x211815, roughness: 0.92 });
  const eye = createMobileMaterial('shell', { color: 0x171515, roughness: 0.28 });

  const body = namedGroup('rig:body', [0, 1.02, 0]);
  const hull = capsule(0.43, options.boss ? 0.78 : 0.68, cloth);
  hull.name = 'character:hull';
  hull.position.y = 0.56;
  hull.scale.set(options.boss ? 1.16 : 1, 1, options.boss ? 1.08 : 1);
  const shirtPanel = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.82, 0.08), accent);
  shirtPanel.position.set(0, 0.56, 0.43);
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.055, 6, 20), leather);
  belt.rotation.x = Math.PI / 2;
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, 0.06), metal);
  buckle.position.set(0, 0, 0.44);
  body.add(hull, shirtPanel, belt, buckle);

  const head = namedGroup('rig:head', [0, 2.18, 0]);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.22, 10), skin);
  neck.position.y = 0.08;
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.36, 16, 12), skin);
  face.scale.set(0.94, 1.08, 0.92);
  face.position.y = 0.34;
  const hairCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.365, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.48),
    hair,
  );
  hairCap.position.y = 0.47;
  head.add(neck, face, hairCap);
  for (const side of [-1, 1]) {
    const eyeDot = new THREE.Mesh(new THREE.SphereGeometry(0.045, 7, 5), eye);
    eyeDot.position.set(side * 0.12, 0.38, 0.33);
    head.add(eyeDot);
  }

  const makeArm = (side: -1 | 1): THREE.Group => {
    const arm = namedGroup(side < 0 ? 'rig:left-arm' : 'rig:right-arm', [side * 0.57, 2.02, 0]);
    arm.rotation.z = side * 0.07;
    const upper = capsule(0.14, 0.5, cloth);
    upper.position.y = -0.32;
    const forearm = capsule(0.125, 0.46, skin);
    forearm.position.set(side * 0.035, -0.87, 0.02);
    forearm.rotation.z = side * -0.04;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.145, 10, 8), skin);
    hand.position.set(side * 0.055, -1.28, 0.03);
    arm.add(upper, forearm, hand);
    return arm;
  };

  const makeLeg = (side: -1 | 1): THREE.Group => {
    const leg = namedGroup(side < 0 ? 'rig:left-leg' : 'rig:right-leg', [side * 0.22, 0.98, 0]);
    const thigh = capsule(0.18, 0.54, leather);
    thigh.position.y = -0.39;
    const shoe = capsule(0.19, 0.25, boot);
    shoe.position.set(0, -0.82, 0.1);
    shoe.rotation.x = Math.PI / 2;
    leg.add(thigh, shoe);
    return leg;
  };

  const leftArm = makeArm(-1);
  const rightArm = makeArm(1);
  const leftLeg = makeLeg(-1);
  const rightLeg = makeLeg(1);
  motionRoot.add(body, head, leftArm, rightArm, leftLeg, rightLeg);

  if (options.pirate) {
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.56, 0.08, 18), leather);
    brim.position.y = 0.68;
    const crown = new THREE.Mesh(new THREE.ConeGeometry(0.44, 0.5, 3), accent);
    crown.scale.z = 0.78;
    crown.position.y = 0.9;
    crown.rotation.y = Math.PI / 3;
    const beard = new THREE.Mesh(
      new THREE.ConeGeometry(0.24, options.boss ? 0.66 : 0.42, 9),
      hair,
    );
    beard.position.set(0, options.boss ? -0.06 : 0.02, 0.27);
    beard.rotation.x = Math.PI;
    head.add(brim, crown, beard);

    // Cutlass อยู่กับ pivot แขน จึงตามท่าโจมตีโดยไม่ต้องสร้างระบบอาวุธมอนสเตอร์ใหม่
    const cutlass = new THREE.Group();
    cutlass.name = 'attachment:cutlass';
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.68, 0.035), metal);
    blade.position.set(0.05, -0.96, 0.12);
    blade.rotation.z = -0.12;
    const hilt = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.055, 0.08), leather);
    hilt.position.set(0.02, -1.34, 0.12);
    cutlass.add(blade, hilt);
    rightArm.add(cutlass);
  }

  if (options.boss) {
    const cape = new THREE.Mesh(new THREE.PlaneGeometry(1.12, 1.75, 2, 3), accent);
    cape.position.set(0, 0.54, -0.45);
    cape.rotation.x = -0.06;
    body.add(cape);
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), metal);
      shoulder.scale.set(1.25, 0.58, 0.86);
      shoulder.position.set(side * 0.55, 1.01, 0);
      body.add(shoulder);
    }
  }

  const rig: CharacterRig = {
    kind: 'humanoid',
    root: motionRoot,
    body,
    head,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
  };
  addShadowFlags(group);
  return { group, hull, rig };
}

/** ปู articulated: body, ก้าม และขาแยก pivot สำหรับ scuttle/attack/heavy */
export function createCrabVisual(color: THREE.ColorRepresentation): CharacterVisualResult {
  const group = new THREE.Group();
  const motionRoot = namedGroup('rig:root', [0, 0, 0]);
  group.add(motionRoot);
  const shell = createMobileMaterial('shell', { color, roughness: 0.36, envMapIntensity: 0.78 });
  const underside = createMobileMaterial('shell', { color: 0x8e4c37, roughness: 0.54 });
  const joint = createMobileMaterial('leather', { color: 0x43251f, roughness: 0.74 });
  const eyeWhite = createMobileMaterial('shell', { color: 0xe5dfc8, roughness: 0.3 });
  const pupil = createMobileMaterial('shell', { color: 0x11100f, roughness: 0.24 });

  const body = namedGroup('rig:body', [0, 0, 0]);
  const hull = new THREE.Mesh(new THREE.SphereGeometry(0.72, 20, 13), shell);
  hull.name = 'character:hull';
  hull.scale.set(1.34, 0.64, 1.02);
  hull.position.y = 0.68;
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.61, 16, 10), underside);
  belly.scale.set(1.28, 0.34, 0.9);
  belly.position.y = 0.48;
  body.add(hull, belly);

  const head = namedGroup('rig:head', [0, 0, 0]);
  for (const side of [-1, 1]) {
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.34, 8), joint);
    stalk.position.set(side * 0.28, 1.03, 0.38);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.105, 10, 8), eyeWhite);
    eye.position.set(side * 0.28, 1.22, 0.39);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.052, 8, 6), pupil);
    dot.position.set(side * 0.28, 1.23, 0.47);
    head.add(stalk, eye, dot);
  }

  const makeClaw = (side: -1 | 1): THREE.Group => {
    const arm = namedGroup(side < 0 ? 'rig:left-claw' : 'rig:right-claw', [side * 0.72, 0.56, 0.22]);
    const clawArm = capsule(0.13, 0.38, joint);
    clawArm.position.set(side * 0.14, 0.07, 0.05);
    clawArm.rotation.z = side * 1;
    const claw = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 9), shell);
    claw.scale.set(1.18, 0.72, 1);
    claw.position.set(side * 0.46, 0.16, 0.16);
    const pincer = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.48, 8), shell);
    pincer.position.set(side * 0.65, 0.22, 0.29);
    pincer.rotation.z = side * -1.05;
    arm.add(clawArm, claw, pincer);
    return arm;
  };

  const makeLegBank = (side: -1 | 1): THREE.Group => {
    const bank = namedGroup(side < 0 ? 'rig:left-legs' : 'rig:right-legs', [side * 0.55, 0.34, 0]);
    for (let i = 0; i < 3; i++) {
      const leg = capsule(0.065, 0.54, joint);
      leg.position.set(side * (0.17 + i * 0.09), -0.04, -0.38 + i * 0.36);
      leg.rotation.z = side * (0.82 + i * 0.08);
      leg.rotation.x = -0.16 + i * 0.12;
      bank.add(leg);
    }
    return bank;
  };

  const leftArm = makeClaw(-1);
  const rightArm = makeClaw(1);
  const leftLeg = makeLegBank(-1);
  const rightLeg = makeLegBank(1);
  motionRoot.add(body, head, leftArm, rightArm, leftLeg, rightLeg);

  const rig: CharacterRig = {
    kind: 'crab',
    root: motionRoot,
    body,
    head,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
  };
  addShadowFlags(group);
  return { group, hull, rig };
}
