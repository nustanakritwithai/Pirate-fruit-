import * as THREE from 'three';
import type { ActiveLoadoutItem, LoadoutCategory } from '../progression/ProgressionTypes';
import { createMobileMaterial } from './MobilePBRMaterials';
import type { CharacterAttachmentSockets } from './CharacterRig';

const EQUIPMENT_NAME: Record<LoadoutCategory, string> = {
  style: 'equipment:style',
  sword: 'equipment:sword',
  gun: 'equipment:gun',
  fruit: 'equipment:fruit',
  utility: 'equipment:utility',
};

const TRAINING_SWORD_SCALE = 0.85;
/** เฉียงใบดาบออกจากลำตัว (+Z ด้านหน้า, +X ด้านขวาของผู้เล่น) */
const TRAINING_SWORD_ROTATION: THREE.Vector3Tuple = [1.34, 0.08, -0.28];
/**
 * Calibration จาก Weapon_Sword ใน Pirate Kit โดยตรง:
 * - Sword clip ของชุดนี้ขยับมือซ้าย
 * - หมุนแกนใบดาบจาก +Y ของ procedural mesh ให้ตรงกับ -Y ของ asset ต้นฉบับ
 * - วาง origin กลับเข้ากลางฝ่ามือ ไม่ซ้อนลำตัว
 */
const QUATERNIUS_SWORD_POSITION: THREE.Vector3Tuple = [0.05, 0.13, -0.09];
const QUATERNIUS_SWORD_ROTATION: THREE.Vector3Tuple = [2.901, -0.01, -1.513];
const QUATERNIUS_GUN_ROTATION: THREE.Vector3Tuple = [-Math.PI / 2, 0, 0];
/** อาวุธทุกชิ้นใช้ origin เป็นจุดจับ ส่วน socket ของ Pirate V1 อยู่กลางฝ่ามือ */
const GRIP_ORIGIN: THREE.Vector3Tuple = [0, 0, 0];

function colorFromId(id: string): THREE.Color {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const hue = (hash >>> 0) / 0xffffffff;
  return new THREE.Color().setHSL(hue, 0.72, 0.48);
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

/**
 * อุปกรณ์ 3D บนตัวผู้เล่นตามชุดสกิลที่ active
 * เป็น visual adapter อย่างเดียว: อ่าน ActiveLoadoutItem แต่ไม่แก้ Loadout/Combat
 */
export class EquipmentVisuals {
  private readonly sword = new THREE.Group();
  private readonly wraps = new THREE.Group();
  private readonly leftWrap = new THREE.Group();
  private readonly rightWrap = new THREE.Group();
  private readonly gun = new THREE.Group();
  private readonly fruit = new THREE.Group();
  private readonly utility = new THREE.Group();
  private readonly groups: Record<LoadoutCategory, THREE.Group>;
  private readonly fruitBodyMaterial: THREE.MeshStandardMaterial;
  private readonly fruitAccentMaterial: THREE.MeshStandardMaterial;
  private readonly fruitRestY = 0.94;
  private readonly socketWorldPosition = new THREE.Vector3();
  private readonly socketWorldQuaternion = new THREE.Quaternion();
  private readonly rootWorldQuaternion = new THREE.Quaternion();
  private readonly socketLocalQuaternion = new THREE.Quaternion();
  private readonly socketOffset = new THREE.Vector3();
  private readonly socketOffsetQuaternion = new THREE.Quaternion();
  private readonly socketOffsetEuler = new THREE.Euler();
  private elapsed = 0;
  private lastItemKey = '';

  constructor(
    private readonly playerRoot: THREE.Group,
    private getActiveItem: () => ActiveLoadoutItem,
    private readonly sockets: Readonly<CharacterAttachmentSockets> = {
      leftHand: null,
      rightHand: null,
      hips: null,
    },
  ) {
    this.sword.name = EQUIPMENT_NAME.sword;
    this.wraps.name = EQUIPMENT_NAME.style;
    this.gun.name = EQUIPMENT_NAME.gun;
    this.fruit.name = EQUIPMENT_NAME.fruit;
    this.utility.name = EQUIPMENT_NAME.utility;
    this.groups = {
      style: this.wraps,
      sword: this.sword,
      gun: this.gun,
      fruit: this.fruit,
      utility: this.utility,
    };

    const steel = createMobileMaterial('iron', {
      color: 0xc7d0d4,
      metalness: 0.9,
      roughness: 0.24,
      envMapIntensity: 1.1,
    });
    const leather = createMobileMaterial('leather', { color: 0x4a2c1c, roughness: 0.64 });
    const darkLeather = createMobileMaterial('leather', { color: 0x241813, roughness: 0.74 });
    const brass = createMobileMaterial('paintedMetal', {
      color: 0xc59a47,
      metalness: 0.72,
      roughness: 0.36,
    });

    // ดาบฝึก: สันคมโลหะ + guard ทองเหลือง อ่าน silhouette ได้แม้จอเล็ก
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.9, 0.035), steel);
    blade.name = 'equipment:sword:blade';
    blade.position.y = 0.68;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.052, 0.22, 4), steel);
    tip.name = 'equipment:sword:tip';
    tip.position.y = 1.24;
    tip.rotation.y = Math.PI / 4;
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.07, 0.09), brass);
    guard.position.y = 0.19;
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.32, 9), leather);
    grip.name = 'equipment:sword:grip';
    grip.position.y = 0;
    const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), brass);
    pommel.position.y = -0.19;
    this.sword.add(blade, tip, guard, grip, pommel);
    this.sword.position.set(0.58, 1, 0.12);
    this.sword.rotation.set(0.08, 0.04, -0.16);

    // ผ้าพันหมัดสำหรับ Fighting Style
    const wrapMaterial = createMobileMaterial('cloth', { color: 0xa97448, roughness: 0.96 });
    this.leftWrap.name = 'equipment:style:left-hand';
    this.rightWrap.name = 'equipment:style:right-hand';
    for (const hand of [this.leftWrap, this.rightWrap]) {
      for (let ring = 0; ring < 2; ring++) {
        const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.035, 6, 12), wrapMaterial);
        wrap.position.y = -0.04 + ring * 0.09;
        wrap.rotation.x = Math.PI / 2;
        hand.add(wrap);
      }
    }
    // fallback เมื่อ visual asset ไม่มี palm socket
    this.leftWrap.position.set(-0.62, 0.76, 0.04);
    this.rightWrap.position.set(0.62, 0.76, 0.04);
    this.wraps.add(this.leftWrap, this.rightWrap);

    // ปืน flintlock แบบ procedural — ใช้ geometry ต่ำและวัสดุร่วม
    const gunGrip = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.42, 0.13), darkLeather);
    gunGrip.name = 'equipment:gun:grip';
    gunGrip.position.set(0, 0, 0);
    gunGrip.rotation.z = -0.28;
    const gunBody = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, 0.58), leather);
    gunBody.position.set(0, 0.2, 0.23);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.72, 10), steel);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.28, 0.48);
    const muzzle = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.018, 6, 10), brass);
    muzzle.name = 'equipment:gun:muzzle';
    muzzle.position.set(0, 0.28, 0.84);
    const hammer = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.08), brass);
    hammer.position.set(0, 0.38, 0.05);
    hammer.rotation.x = -0.42;
    this.gun.add(gunGrip, gunBody, barrel, muzzle, hammer);
    this.gun.position.set(-0.58, 1.02, 0.04);
    this.gun.rotation.set(0.05, -0.2, 0.12);

    // ผลไม้พลัง: palette สร้างจาก itemId จึงแยกสีได้ครบทั้ง databook โดยไม่เพิ่ม texture
    this.fruitBodyMaterial = createMobileMaterial('fruit', {
      color: 0xb85cff,
      emissive: 0x281040,
      emissiveIntensity: 0.32,
    });
    this.fruitAccentMaterial = createMobileMaterial('fruit', {
      color: 0xffc2ff,
      roughness: 0.32,
      emissive: 0x4a1b50,
      emissiveIntensity: 0.42,
    });
    const fruitBody = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 12), this.fruitBodyMaterial);
    fruitBody.scale.set(1, 1.12, 0.96);
    const spiralPoints: THREE.Vector3[] = [];
    for (let i = 0; i <= 28; i++) {
      const t = i / 28;
      const y = (t - 0.5) * 0.43;
      const radius = 0.245 * Math.sqrt(Math.max(0.08, 1 - (y / 0.25) ** 2));
      const angle = t * Math.PI * 6;
      spiralPoints.push(new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius));
    }
    const spiral = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(spiralPoints), 36, 0.014, 4, false),
      this.fruitAccentMaterial,
    );
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.2, 7), darkLeather);
    stem.position.y = 0.34;
    stem.rotation.z = 0.22;
    const leaf = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 8, 5),
      createMobileMaterial('foliage', { color: 0x3b8b55, roughness: 0.78 }),
    );
    leaf.scale.set(1.5, 0.28, 0.65);
    leaf.position.set(0.11, 0.4, 0);
    leaf.rotation.z = -0.35;
    this.fruit.add(fruitBody, spiral, stem, leaf);
    this.fruit.position.set(0.7, this.fruitRestY, 0.18);

    // Utility placeholder ที่ดูเป็นของจริง: กระเป๋าหนัง + เข็มทิศโลหะ
    const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.38, 0.16), leather);
    pouch.position.y = -0.06;
    const flap = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.16, 0.18), darkLeather);
    flap.position.set(0, 0.12, 0.01);
    const compass = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.05, 16), brass);
    compass.rotation.x = Math.PI / 2;
    compass.position.set(0, 0.38, 0.04);
    const needle = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.2, 3), steel);
    needle.position.set(0, 0.41, 0.08);
    needle.rotation.z = -0.2;
    this.utility.add(pouch, flap, compass, needle);
    this.utility.position.set(-0.45, 1.02, 0.34);

    for (const root of Object.values(this.groups)) {
      addShadowFlags(root);
      playerRoot.add(root);
    }
    this.render();
  }

  update(dt = 0): void {
    this.elapsed += dt;
    const fruitMounted = this.updateSocketTransforms();
    if (this.fruit.visible) {
      if (fruitMounted) {
        this.fruit.rotateY(this.elapsed * 0.85);
        this.fruit.position.y += Math.sin(this.elapsed * 2.4) * 0.035;
      } else {
        this.fruit.rotation.y = this.elapsed * 0.85;
        this.fruit.position.y = this.fruitRestY + Math.sin(this.elapsed * 2.4) * 0.035;
      }
    }

    const item = this.getActiveItem();
    const itemKey = `${item.category}:${item.itemId}`;
    if (itemKey === this.lastItemKey) return;
    this.render();
  }

  /**
   * คืนแนวใบดาบจริงใน world space ณ pose ปัจจุบันให้ระบบ VFX วาด blade trail
   * ใช้สำเนา Vector3 เพื่อไม่เปิดให้ combat แก้ transform ของอุปกรณ์
   */
  getSwordBladeWorldSegment(): { base: THREE.Vector3; tip: THREE.Vector3 } | null {
    const blade = this.sword.getObjectByName('equipment:sword:blade');
    const tipMesh = this.sword.getObjectByName('equipment:sword:tip');
    if (!blade || !tipMesh) return null;
    this.updateSocketTransforms();
    this.playerRoot.updateMatrixWorld(true);
    return {
      // ใบดาบ BoxGeometry เริ่มเหนือ guard ที่ local y=0.23
      base: this.sword.localToWorld(new THREE.Vector3(0, 0.23, 0)),
      // ปลาย ConeGeometry สูง 0.22 และมี center ที่ local y=1.24
      tip: tipMesh.localToWorld(new THREE.Vector3(0, 0.11, 0)),
    };
  }

  /** จุดปากกระบอกและแนวลำกล้องจริงใน world space สำหรับ muzzle flash/tracer */
  getGunMuzzleWorldRay(): { origin: THREE.Vector3; direction: THREE.Vector3 } | null {
    const muzzle = this.gun.getObjectByName('equipment:gun:muzzle');
    if (!muzzle) return null;
    this.updateSocketTransforms();
    this.playerRoot.updateMatrixWorld(true);
    const quaternion = this.gun.getWorldQuaternion(new THREE.Quaternion());
    return {
      origin: muzzle.localToWorld(new THREE.Vector3(0, 0, 0.05)),
      direction: new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion).normalize(),
    };
  }

  private render(): void {
    const item = this.getActiveItem();
    this.lastItemKey = `${item.category}:${item.itemId}`;
    for (const [category, group] of Object.entries(this.groups) as [LoadoutCategory, THREE.Group][]) {
      group.visible = category === item.category;
    }
    if (item.category === 'fruit') this.applyFruitPalette(item.itemId);
  }

  /** ผูก visual กับ calibrated socket หลัง animation อัปเดต โดยไม่แตะ gameplay state */
  private updateSocketTransforms(): boolean {
    const quaternius = this.sockets.assetProfile === 'quaternius';
    this.followSocket(this.leftWrap, this.sockets.leftHand, GRIP_ORIGIN, [0, 0, 0], 0.9);
    this.followSocket(this.rightWrap, this.sockets.rightHand, GRIP_ORIGIN, [0, 0, 0], 0.9);
    this.followSocket(
      this.sword,
      quaternius ? this.sockets.leftHand : this.sockets.rightHand,
      quaternius ? QUATERNIUS_SWORD_POSITION : GRIP_ORIGIN,
      quaternius ? QUATERNIUS_SWORD_ROTATION : TRAINING_SWORD_ROTATION,
      quaternius ? 0.9 : TRAINING_SWORD_SCALE,
    );
    this.followSocket(
      this.gun,
      this.sockets.rightHand,
      GRIP_ORIGIN,
      quaternius ? QUATERNIUS_GUN_ROTATION : [0, 0, 0],
      0.75,
    );
    const fruitMounted = this.followSocket(
      this.fruit,
      this.sockets.leftHand,
      [0, 0.2, 0],
      [0, 0, 0],
      0.85,
    );
    this.followSocket(this.utility, this.sockets.hips, GRIP_ORIGIN, [0, 0, 0], 0.9);
    return fruitMounted;
  }

  private followSocket(
    visual: THREE.Object3D,
    socket: THREE.Object3D | null,
    positionOffset: THREE.Vector3Tuple,
    rotationOffset: THREE.Vector3Tuple,
    scale: number,
  ): boolean {
    if (!socket) return false;

    socket.getWorldPosition(this.socketWorldPosition);
    this.playerRoot.worldToLocal(this.socketWorldPosition);
    socket.getWorldQuaternion(this.socketWorldQuaternion);
    this.playerRoot.getWorldQuaternion(this.rootWorldQuaternion).invert();
    this.socketLocalQuaternion
      .copy(this.rootWorldQuaternion)
      .multiply(this.socketWorldQuaternion);

    visual.position.copy(this.socketWorldPosition);
    this.socketOffset.set(...positionOffset).applyQuaternion(this.socketLocalQuaternion);
    visual.position.add(this.socketOffset);
    this.socketOffsetQuaternion.setFromEuler(this.socketOffsetEuler.set(...rotationOffset));
    visual.quaternion
      .copy(this.socketLocalQuaternion)
      .multiply(this.socketOffsetQuaternion);
    visual.scale.setScalar(scale);
    return true;
  }

  private applyFruitPalette(itemId: string): void {
    const base = colorFromId(itemId);
    const accent = base.clone().offsetHSL(0.1, -0.08, 0.2);
    this.fruitBodyMaterial.color.copy(base);
    this.fruitBodyMaterial.emissive.copy(base).multiplyScalar(0.2);
    this.fruitAccentMaterial.color.copy(accent);
    this.fruitAccentMaterial.emissive.copy(accent).multiplyScalar(0.22);
  }
}
