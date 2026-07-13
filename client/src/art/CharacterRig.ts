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

/** Bone adapter ของ Soldier.glb — resolve ครั้งเดียวแล้วแชร์ให้ animation กับ equipment */
export interface MixamoPlayerRig {
  modelRoot: THREE.Object3D;
  hips: THREE.Object3D | null;
  spine: THREE.Object3D | null;
  spine2: THREE.Object3D | null;
  head: THREE.Object3D | null;
  leftArm: THREE.Object3D | null;
  leftForeArm: THREE.Object3D | null;
  leftHand: THREE.Object3D | null;
  rightArm: THREE.Object3D | null;
  rightForeArm: THREE.Object3D | null;
  rightHand: THREE.Object3D | null;
  leftLeg: THREE.Object3D | null;
  rightLeg: THREE.Object3D | null;
}

/** Socket ที่ระบบ art ใช้ได้ โดยไม่เปิด skeleton ทั้งชุดให้ gameplay */
export interface CharacterAttachmentSockets {
  leftHand: THREE.Object3D | null;
  rightHand: THREE.Object3D | null;
  hips: THREE.Object3D | null;
}

const MIXAMO_BONE_NAMES: Omit<Record<keyof MixamoPlayerRig, string>, 'modelRoot'> = {
  hips: 'mixamorig:Hips',
  spine: 'mixamorig:Spine',
  spine2: 'mixamorig:Spine2',
  head: 'mixamorig:Head',
  leftArm: 'mixamorig:LeftArm',
  leftForeArm: 'mixamorig:LeftForeArm',
  leftHand: 'mixamorig:LeftHand',
  rightArm: 'mixamorig:RightArm',
  rightForeArm: 'mixamorig:RightForeArm',
  rightHand: 'mixamorig:RightHand',
  leftLeg: 'mixamorig:LeftUpLeg',
  rightLeg: 'mixamorig:RightUpLeg',
};

export function resolveMixamoPlayerRig(modelRoot: THREE.Object3D): MixamoPlayerRig {
  const resolved = Object.fromEntries(
    Object.entries(MIXAMO_BONE_NAMES).map(([key, name]) => [
      key,
      modelRoot.getObjectByName(name) ?? null,
    ]),
  ) as unknown as Omit<MixamoPlayerRig, 'modelRoot'>;
  return { modelRoot, ...resolved };
}

export function attachmentSocketsFromRig(rig: MixamoPlayerRig): CharacterAttachmentSockets {
  return {
    leftHand: rig.leftHand,
    rightHand: rig.rightHand,
    hips: rig.hips,
  };
}
