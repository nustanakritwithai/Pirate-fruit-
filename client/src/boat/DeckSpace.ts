/**
 * เรือ Phase 1 — คณิตของ "ดาดฟ้าเดินได้" (pure ฟังก์ชัน ทดสอบได้)
 * - ดาดฟ้าคือกล่องใน BoatModel: กว้าง width·0.82 ยาว length·0.62 ผิวบนอยู่ local y ≈ 0.63
 * - เรือหมุน/เอียงตามคลื่น (matrixWorld ของ group) — ทุกอย่างจึงคิดผ่าน matrix จริงของเรือ
 */

import * as THREE from 'three';
import type { BoatDefinition } from './BoatData';

/** ผิวบนของกล่องดาดฟ้าใน BoatModel (y 0.55 + หนา 0.16/2) */
export const DECK_TOP_LOCAL_Y = 0.63;
/** เผื่อขอบเล็กน้อยให้เดินถึงราวเรือได้ ไม่ตกง่ายเกิน */
const DECK_MARGIN = 1.08;

export interface DeckBounds {
  halfWidth: number;
  halfLength: number;
}

export function deckBoundsFor(definition: Pick<BoatDefinition, 'width' | 'length'>): DeckBounds {
  return {
    halfWidth: definition.width * 0.41 * DECK_MARGIN,
    halfLength: definition.length * 0.31 * DECK_MARGIN,
  };
}

const tempInverse = new THREE.Matrix4();
const tempPoint = new THREE.Vector3();

/** แปลงจุด world → พิกัด local ของเรือ (ใช้ inverse ของ matrixWorld) */
export function worldToDeckLocal(
  boatMatrixWorld: THREE.Matrix4,
  x: number,
  y: number,
  z: number,
  out: THREE.Vector3 = new THREE.Vector3(),
): THREE.Vector3 {
  tempInverse.copy(boatMatrixWorld).invert();
  return out.set(x, y, z).applyMatrix4(tempInverse);
}

/** จุด local (x,z) อยู่ในกรอบดาดฟ้าไหม */
export function withinDeck(bounds: DeckBounds, localX: number, localZ: number): boolean {
  return Math.abs(localX) <= bounds.halfWidth && Math.abs(localZ) <= bounds.halfLength;
}

/**
 * ความสูงพื้นดาดฟ้า (world Y) ณ จุด world (x,z) — null ถ้าอยู่นอกกรอบ
 * ใช้เป็น DynamicGroundProvider: ผิวเอียงตาม pitch/roll ของคลื่นอัตโนมัติ
 */
export function deckHeightAt(
  boatMatrixWorld: THREE.Matrix4,
  bounds: DeckBounds,
  boatY: number,
  x: number,
  z: number,
): number | null {
  const local = worldToDeckLocal(boatMatrixWorld, x, boatY, z, tempPoint);
  if (!withinDeck(bounds, local.x, local.z)) return null;
  local.y = DECK_TOP_LOCAL_Y;
  local.applyMatrix4(boatMatrixWorld);
  return local.y;
}

/**
 * พาผู้เล่นไปกับเรือ (moving platform carry):
 * เก็บตำแหน่ง local ด้วย matrix เฟรมก่อน แล้ว re-apply ด้วย matrix เฟรมใหม่
 */
export function carryRider(
  prevMatrixWorld: THREE.Matrix4,
  currMatrixWorld: THREE.Matrix4,
  position: THREE.Vector3,
): THREE.Vector3 {
  tempInverse.copy(prevMatrixWorld).invert();
  position.applyMatrix4(tempInverse);
  position.applyMatrix4(currMatrixWorld);
  return position;
}
