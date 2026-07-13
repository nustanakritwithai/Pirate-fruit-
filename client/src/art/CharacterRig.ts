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
