import type * as THREE from 'three';

export type CharacterRigKind = 'humanoid' | 'crab';

/** จุดขยับมาตรฐานของ asset procedural ทุกตัว เพื่อให้ animator ไม่ผูกกับ geometry */
export interface CharacterRig {
  kind: CharacterRigKind;
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
}

/**
 * Rig ของผู้เล่น Pirate V1 ที่สร้างในโปรเจกต์เอง
 * ทุก pivot ใช้แกนเดียวกัน และ hand socket คือจุดกึ่งกลางฝ่ามือจริง ไม่ใช่ข้อมือ
 */
export interface PiratePlayerRig {
  modelRoot: THREE.Object3D;
  root: THREE.Group;
  hips: THREE.Group;
  spine: THREE.Group;
  chest: THREE.Group;
  head: THREE.Group;
  leftArm: THREE.Group;
  leftForeArm: THREE.Group;
  leftHand: THREE.Group;
  rightArm: THREE.Group;
  rightForeArm: THREE.Group;
  rightHand: THREE.Group;
  leftLeg: THREE.Group;
  leftLowerLeg: THREE.Group;
  leftFoot: THREE.Group;
  rightLeg: THREE.Group;
  rightLowerLeg: THREE.Group;
  rightFoot: THREE.Group;
  leftPalmSocket: THREE.Group;
  rightPalmSocket: THREE.Group;
  hipsSocket: THREE.Group;
}

/** Socket ที่ระบบ art ใช้ได้ โดยไม่เปิด skeleton ทั้งชุดให้ gameplay */
export interface CharacterAttachmentSockets {
  leftHand: THREE.Object3D | null;
  rightHand: THREE.Object3D | null;
  hips: THREE.Object3D | null;
  /** true เมื่อ object เป็น anchor ที่ศิลปินวางตรงจุดจับแล้ว ไม่ต้องใช้ bone offset */
  calibrated?: boolean;
}

export function attachmentSocketsFromPirateRig(rig: PiratePlayerRig): CharacterAttachmentSockets {
  return {
    leftHand: rig.leftPalmSocket,
    rightHand: rig.rightPalmSocket,
    hips: rig.hipsSocket,
    calibrated: true,
  };
}
