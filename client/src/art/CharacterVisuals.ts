import * as THREE from 'three';
import { createMobileMaterial } from './MobilePBRMaterials';

export interface HumanoidVisualOptions {
  clothColor: THREE.ColorRepresentation;
  accentColor?: THREE.ColorRepresentation;
  skinColor?: THREE.ColorRepresentation;
  pirate?: boolean;
  boss?: boolean;
}

export interface CharacterVisualResult {
  group: THREE.Group;
  hull: THREE.Mesh;
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

function capsule(
  radius: number,
  length: number,
  material: THREE.Material,
  position: THREE.Vector3Tuple,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 4, 10), material);
  mesh.position.set(...position);
  return mesh;
}

/** มนุษย์สัดส่วนอ่านง่ายแบบ Stylized Realism ไม่ใช่ chibi และใช้วัสดุ PBR */
export function createHumanoidVisual(options: HumanoidVisualOptions): CharacterVisualResult {
  const group = new THREE.Group();
  const cloth = createMobileMaterial('cloth', { color: options.clothColor });
  const accent = createMobileMaterial('cloth', { color: options.accentColor ?? 0x742f27, roughness: 0.84 });
  const skin = createMobileMaterial('skin', { color: options.skinColor ?? 0xc98f68 });
  const leather = createMobileMaterial('leather', { color: 0x30231c });
  const boot = createMobileMaterial('leather', { color: 0x191716, roughness: 0.76 });
  const metal = createMobileMaterial('iron', { color: 0x9aa3a8, roughness: 0.42 });
  const hair = createMobileMaterial('darkWood', { color: 0x211815, roughness: 0.92 });

  const hull = capsule(0.43, options.boss ? 0.78 : 0.68, cloth, [0, 1.58, 0]);
  hull.scale.set(options.boss ? 1.16 : 1, 1, options.boss ? 1.08 : 1);
  group.add(hull);

  const shirtPanel = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.82, 0.08), accent);
  shirtPanel.position.set(0, 1.58, 0.43);
  group.add(shirtPanel);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.22, 10), skin);
  neck.position.y = 2.22;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.36, 16, 12), skin);
  head.scale.set(0.94, 1.08, 0.92);
  head.position.y = 2.52;
  const hairCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.365, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.48),
    hair,
  );
  hairCap.position.y = 2.65;
  group.add(neck, head, hairCap);

  for (const side of [-1, 1]) {
    const upperArm = capsule(0.14, 0.54, cloth, [side * 0.58, 1.64, 0]);
    upperArm.rotation.z = side * 0.12;
    const forearm = capsule(0.125, 0.48, skin, [side * 0.64, 1.04, 0.02]);
    forearm.rotation.z = side * -0.08;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.145, 10, 8), skin);
    hand.position.set(side * 0.68, 0.67, 0.03);

    const leg = capsule(0.18, 0.58, leather, [side * 0.22, 0.58, 0]);
    const shoe = capsule(0.19, 0.25, boot, [side * 0.22, 0.16, 0.1]);
    shoe.rotation.x = Math.PI / 2;
    group.add(upperArm, forearm, hand, leg, shoe);
  }

  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.055, 6, 20), leather);
  belt.rotation.x = Math.PI / 2;
  belt.position.y = 1.02;
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, 0.06), metal);
  buckle.position.set(0, 1.02, 0.44);
  group.add(belt, buckle);

  if (options.pirate) {
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.56, 0.08, 18), leather);
    brim.position.y = 2.86;
    const crown = new THREE.Mesh(new THREE.ConeGeometry(0.44, 0.5, 3), accent);
    crown.scale.z = 0.78;
    crown.position.y = 3.08;
    crown.rotation.y = Math.PI / 3;
    group.add(brim, crown);

    const beard = new THREE.Mesh(new THREE.ConeGeometry(0.24, options.boss ? 0.66 : 0.42, 9), hair);
    beard.position.set(0, options.boss ? 2.12 : 2.2, 0.27);
    beard.rotation.x = Math.PI;
    group.add(beard);

    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.68, 0.035), metal);
    blade.position.set(-0.76, 1.02, 0.12);
    blade.rotation.z = -0.12;
    const hilt = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.055, 0.08), leather);
    hilt.position.set(-0.73, 0.66, 0.12);
    group.add(blade, hilt);
  }

  if (options.boss) {
    const cape = new THREE.Mesh(new THREE.PlaneGeometry(1.12, 1.75, 2, 3), accent);
    cape.position.set(0, 1.56, -0.45);
    cape.rotation.x = -0.06;
    group.add(cape);
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), metal);
      shoulder.scale.set(1.25, 0.58, 0.86);
      shoulder.position.set(side * 0.55, 2.03, 0);
      group.add(shoulder);
    }
  }

  addShadowFlags(group);
  return { group, hull };
}

/** ปูทะเลผิวเปลือกกึ่งเงา ก้าม/ขาโค้งแทนกล่อง primitive */
export function createCrabVisual(color: THREE.ColorRepresentation): CharacterVisualResult {
  const group = new THREE.Group();
  const shell = createMobileMaterial('shell', { color, roughness: 0.36, envMapIntensity: 0.78 });
  const underside = createMobileMaterial('shell', { color: 0x8e4c37, roughness: 0.54 });
  const joint = createMobileMaterial('leather', { color: 0x43251f, roughness: 0.74 });
  const eyeWhite = createMobileMaterial('shell', { color: 0xe5dfc8, roughness: 0.3 });
  const pupil = createMobileMaterial('shell', { color: 0x11100f, roughness: 0.24 });

  const hull = new THREE.Mesh(new THREE.SphereGeometry(0.72, 20, 13), shell);
  hull.scale.set(1.34, 0.64, 1.02);
  hull.position.y = 0.68;
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.61, 16, 10), underside);
  belly.scale.set(1.28, 0.34, 0.9);
  belly.position.y = 0.48;
  group.add(hull, belly);

  for (const side of [-1, 1]) {
    const clawArm = capsule(0.13, 0.38, joint, [side * 0.86, 0.63, 0.27]);
    clawArm.rotation.z = side * 1.0;
    const claw = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 9), shell);
    claw.scale.set(1.18, 0.72, 1);
    claw.position.set(side * 1.18, 0.72, 0.38);
    const pincer = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.48, 8), shell);
    pincer.position.set(side * 1.37, 0.78, 0.51);
    pincer.rotation.z = side * -1.05;
    group.add(clawArm, claw, pincer);

    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.34, 8), joint);
    stalk.position.set(side * 0.28, 1.03, 0.38);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.105, 10, 8), eyeWhite);
    eye.position.set(side * 0.28, 1.22, 0.39);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.052, 8, 6), pupil);
    dot.position.set(side * 0.28, 1.23, 0.47);
    group.add(stalk, eye, dot);

    for (let i = 0; i < 3; i++) {
      const leg = capsule(0.065, 0.54, joint, [side * (0.72 + i * 0.09), 0.3, -0.38 + i * 0.36]);
      leg.rotation.z = side * (0.82 + i * 0.08);
      leg.rotation.x = -0.16 + i * 0.12;
      group.add(leg);
    }
  }

  addShadowFlags(group);
  return { group, hull };
}
