import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  DECK_TOP_LOCAL_Y,
  carryRider,
  deckBoundsFor,
  deckHeightAt,
  withinDeck,
  worldToDeckLocal,
} from '../DeckSpace';
import { SAIL_GEAR_RATIO, MAX_SAIL_LEVEL, getBoatDefinition } from '../BoatData';
import { CollisionSystem } from '../../world/Collision';

const DEFN = { width: 2.35, length: 6.2 };

function boatMatrix(x: number, y: number, z: number, heading = 0, pitch = 0, roll = 0): THREE.Matrix4 {
  const obj = new THREE.Object3D();
  obj.rotation.order = 'YXZ';
  obj.position.set(x, y, z);
  obj.rotation.set(pitch, heading, roll);
  obj.updateMatrixWorld();
  return obj.matrixWorld.clone();
}

describe('DeckSpace — กรอบดาดฟ้า + ความสูง', () => {
  const bounds = deckBoundsFor(DEFN);

  it('จุดกลางเรืออยู่ในกรอบ / นอกกราบซ้าย-ขวา-หัว-ท้ายไม่อยู่', () => {
    expect(withinDeck(bounds, 0, 0)).toBe(true);
    expect(withinDeck(bounds, DEFN.width, 0)).toBe(false); // พ้นกราบ
    expect(withinDeck(bounds, 0, DEFN.length * 0.5)).toBe(false); // พ้นหัวเรือ
  });

  it('deckHeightAt คืนความสูงผิวดาดฟ้าตามตำแหน่งเรือ (และ null นอกกรอบ)', () => {
    const m = boatMatrix(10, 0.4, -5);
    expect(deckHeightAt(m, bounds, 0.4, 10, -5)).toBeCloseTo(0.4 + DECK_TOP_LOCAL_Y, 3);
    expect(deckHeightAt(m, bounds, 0.4, 10 + DEFN.width, -5)).toBeNull();
  });

  it('เรือหมุน heading แล้วกรอบหมุนตาม (จุดหน้าเรือใน local ยังอยู่ในกรอบ)', () => {
    const heading = Math.PI / 2; // หันไปทาง +x
    const m = boatMatrix(0, 0.2, 0, heading);
    // จุดห่าง 1.5 ตามแกนหัวเรือ (world +x เพราะหมุน 90°)
    expect(deckHeightAt(m, bounds, 0.2, 1.5, 0)).not.toBeNull();
    // จุดห่าง 1.5 ด้านข้าง world +z = ด้านกราบ (halfWidth ~1.04) → นอกกรอบ
    expect(deckHeightAt(m, bounds, 0.2, 0, 1.5)).toBeNull();
  });

  it('เรือเอียง (roll) แล้วผิวดาดฟ้าสูงต่างกันซ้าย-ขวา', () => {
    const m = boatMatrix(0, 0.3, 0, 0, 0, 0.06);
    const left = deckHeightAt(m, bounds, 0.3, -0.8, 0)!;
    const right = deckHeightAt(m, bounds, 0.3, 0.8, 0)!;
    expect(left).not.toBeCloseTo(right, 4);
  });

  it('worldToDeckLocal กลับด้าน localToWorld ได้', () => {
    const m = boatMatrix(4, 0.5, 7, 1.1);
    const world = new THREE.Vector3(0.5, DECK_TOP_LOCAL_Y, -1).applyMatrix4(m);
    const local = worldToDeckLocal(m, world.x, world.y, world.z);
    expect(local.x).toBeCloseTo(0.5, 4);
    expect(local.z).toBeCloseTo(-1, 4);
  });
});

describe('DeckSpace — carryRider (moving platform)', () => {
  it('เรือเลื่อนตรง → ผู้เล่นเลื่อนตาม delta เดียวกัน', () => {
    const prev = boatMatrix(0, 0.2, 0);
    const curr = boatMatrix(2, 0.2, 3);
    const pos = new THREE.Vector3(0.4, 0.83, -0.5);
    carryRider(prev, curr, pos);
    expect(pos.x).toBeCloseTo(2.4, 4);
    expect(pos.z).toBeCloseTo(2.5, 4);
  });

  it('เรือหมุน → ผู้เล่นหมุนรอบแกนเรือไปด้วย', () => {
    const prev = boatMatrix(0, 0.2, 0, 0);
    const curr = boatMatrix(0, 0.2, 0, Math.PI / 2);
    const pos = new THREE.Vector3(0, 0.83, 1); // ยืนหน้าเรือ (local +z)
    carryRider(prev, curr, pos);
    // heading 90° (YXZ, rotation.y) — local +z → world +x
    expect(pos.x).toBeCloseTo(1, 4);
    expect(pos.z).toBeCloseTo(0, 4);
  });

  it('เรือโยกขึ้นตามคลื่น → ผู้เล่นยกตาม', () => {
    const prev = boatMatrix(0, 0.1, 0);
    const curr = boatMatrix(0, 0.35, 0);
    const pos = new THREE.Vector3(0.2, 0.73, 0.2);
    carryRider(prev, curr, pos);
    expect(pos.y).toBeCloseTo(0.98, 4);
  });
});

describe('เกียร์ใบเรือ + Collision dynamic ground', () => {
  it('อัตราเกียร์ 0→3 ไล่ระดับถูกต้อง (0, 35%, 70%, 100%)', () => {
    expect(SAIL_GEAR_RATIO).toEqual([0, 0.35, 0.7, 1]);
    expect(MAX_SAIL_LEVEL).toBe(3);
    const sloop = getBoatDefinition('swift-sloop')!;
    expect(sloop.maxSpeed * SAIL_GEAR_RATIO[2]).toBeCloseTo(9.8, 3);
  });

  it('dynamic ground provider ถูกรวมใน heightAt และถอนออกได้', () => {
    const collision = new CollisionSystem(() => -2); // ก้นทะเล
    const provider = (x: number, z: number) => (Math.hypot(x, z) < 2 ? 0.8 : null);
    collision.addDynamicGround(provider);
    expect(collision.heightAt(0.5, 0.5)).toBeCloseTo(0.8); // บนดาดฟ้า
    expect(collision.heightAt(5, 5)).toBeCloseTo(-2); // นอกดาดฟ้า → พื้นทะเล
    collision.removeDynamicGround(provider);
    expect(collision.heightAt(0.5, 0.5)).toBeCloseTo(-2); // ถอนแล้วหาย
  });
});
