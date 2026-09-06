import * as THREE from 'three';
import {
  instantiateSpellFxAsset,
  preloadSpellFxAssets,
  type SpellFxAssetId,
} from '../art/SpellFxAssetLibrary';

interface ActiveEffect {
  owner?: object;
  root: THREE.Object3D;
  life: number;
  maxLife: number;
  materials: THREE.Material[];
  geometries: THREE.BufferGeometry[];
  animate: (progress: number, remaining: number, dt: number) => void;
}

interface DamageNumber {
  sprite: THREE.Sprite;
  life: number;
  maxLife: number;
}

/** visual handle ของลูกพลัง — PlayerCombat ขยับตำแหน่ง แต่ Effects เป็นเจ้าของ animation/material */
export interface EnergyProjectileVisual {
  readonly root: THREE.Group;
  readonly color: number;
  readonly scale: number;
  readonly direction: THREE.Vector3;
  readonly core: THREE.Mesh;
  readonly aura: THREE.Mesh;
  readonly rings: readonly THREE.Mesh[];
  readonly materials: readonly THREE.MeshBasicMaterial[];
  readonly assetRoot?: THREE.Object3D;
  readonly assetMaterials?: readonly THREE.Material[];
  elapsed: number;
  trailTimer: number;
}

export const SLASH_ARC_LENGTH = Math.PI * 0.85;

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

function additiveMaterial(color: THREE.ColorRepresentation, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
}

function easeOutCubic(value: number): number {
  const inverse = 1 - THREE.MathUtils.clamp(value, 0, 1);
  return 1 - inverse * inverse * inverse;
}

function selectSpellFxAsset(color: number, phase: 'projectile' | 'launch' | 'impact'): SpellFxAssetId {
  const hsl = new THREE.Color(color).getHSL({ h: 0, s: 0, l: 0 });
  if (hsl.h < 0.06 || hsl.h > 0.94) return phase === 'impact' ? 'fire-grenade' : 'fireball';
  if (hsl.h < 0.16) return phase === 'impact' ? 'earth-bending' : 'magic-rock';
  if (hsl.h < 0.28) return phase === 'impact' ? 'smoke' : 'fire-grenade';
  if (hsl.h < 0.48) return phase === 'impact' ? 'earth-bending' : 'smoke';
  if (hsl.h < 0.64) return phase === 'impact' ? 'ice-block' : 'water-element';
  return phase === 'launch' ? 'lightning-hands' : 'fireball';
}

/**
 * RingGeometry เริ่มจากแกน +X และถูกวางราบด้วย rotation.x = -PI/2
 * จึงต้องชดเชยมุมกึ่งกลางของ arc เพื่อให้มันหันตรงกับ forward ของตัวละคร
 */
export function getForwardArcRotation(
  heading: number,
  thetaLength = SLASH_ARC_LENGTH,
  thetaStart = 0,
): number {
  const arcMidpoint = thetaStart + thetaLength / 2;
  return heading - Math.PI / 2 - arcMidpoint;
}

/** เอฟเฟกต์การต่อสู้แบบ procedural และงบต่ำสำหรับมือถือ */
export class Effects {
  private currentOwner: object | undefined;
  private readonly active: ActiveEffect[] = [];
  private readonly numbers: DamageNumber[] = [];
  private readonly slashGeo = new THREE.RingGeometry(0.5, 1.5, 24, 1, 0, SLASH_ARC_LENGTH);
  private readonly sparkGeo = new THREE.RingGeometry(0.12, 0.5, 16);
  private readonly energyCoreGeo = new THREE.IcosahedronGeometry(0.34, 1);
  private readonly energyAuraGeo = new THREE.SphereGeometry(0.5, 12, 8);
  private readonly energyRingGeo = new THREE.TorusGeometry(0.56, 0.045, 6, 18, Math.PI * 1.48);
  private readonly energyTrailGeo = new THREE.IcosahedronGeometry(0.16, 0);
  private readonly tracerGeo = new THREE.CylinderGeometry(0.026, 0.042, 1, 6, 1, true);
  private readonly bulletGeo = new THREE.IcosahedronGeometry(0.075, 0);
  private readonly muzzleConeGeo = new THREE.ConeGeometry(0.2, 0.52, 6, 1, true);
  private readonly muzzleCoreGeo = new THREE.SphereGeometry(0.12, 8, 6);
  private readonly muzzleRingGeo = new THREE.TorusGeometry(0.14, 0.025, 5, 12);

  constructor(private scene: THREE.Scene) {
    preloadSpellFxAssets();
  }

  /** คลื่นโค้งหน้าตัวละคร สำหรับหมัด/ท่าพุ่งที่ไม่มีใบดาบ */
  spawnSlash(position: THREE.Vector3, heading: number, color = 0x9fdcff, scale = 1, assetId?: SpellFxAssetId): void {
    const material = additiveMaterial(color, 0.9);
    const mesh = new THREE.Mesh(this.slashGeo, material);
    mesh.name = 'effect:slash';
    mesh.position.copy(position);
    mesh.position.y += 1.15;
    mesh.position.x += Math.sin(heading) * 0.9;
    mesh.position.z += Math.cos(heading) * 0.9;
    mesh.rotation.set(-Math.PI / 2, 0, 0);
    mesh.rotateZ(getForwardArcRotation(heading));
    const root = new THREE.Group();
    root.name = 'effect:slash';
    root.add(mesh);
    const asset = instantiateSpellFxAsset(assetId ?? selectSpellFxAsset(color, 'launch'), color);
    if (asset) {
      asset.root.scale.setScalar(scale * 0.8);
      asset.root.position.y = 1.05;
      root.add(asset.root);
    }
    this.scene.add(root);
    this.track(root, 0.22, [material, ...(asset?.materials ?? [])], [], (progress, remaining) => {
      material.opacity = remaining * 0.9;
      const animatedScale = scale * (0.7 + progress * 0.8);
      mesh.scale.setScalar(animatedScale);
      if (asset) {
        asset.root.rotation.y += 0.2;
        asset.root.scale.setScalar(scale * (0.7 + progress * 0.7));
      }
    });
  }

  /**
   * ริบบิ้นแสงที่กวาดจากตำแหน่งใบดาบจริง โดยขอบสุดท้ายทับกับ blade socket ณ hit event
   * สลับทิศตามคอมโบและขยาย sweep ของท่าปิดคอมโบ โดยไม่แตะ hitbox/damage
   */
  spawnBladeTrail(
    bladeBase: THREE.Vector3,
    bladeTip: THREE.Vector3,
    playerPosition: THREE.Vector3,
    heading: number,
    comboIndex: number,
    color = 0x9fdcff,
    finisher = false,
  ): void {
    const pivot = playerPosition.clone();
    pivot.y += 0.98;
    const baseOffset = bladeBase.clone().sub(pivot);
    const tipOffset = bladeTip.clone().sub(pivot);
    const sweepSign = comboIndex % 2 === 0 ? 1 : -1;
    const sweep = (finisher ? 1.48 : 0.92 + comboIndex * 0.08) * sweepSign;
    const segments = finisher ? 10 : 7;
    const positions: number[] = [];
    const edgePositions: number[] = [];
    const indices: number[] = [];
    const rotation = new THREE.Quaternion();
    const sweptBase = new THREE.Vector3();
    const sweptTip = new THREE.Vector3();

    for (let segment = 0; segment <= segments; segment++) {
      const t = segment / segments;
      // t=1 คือใบดาบจริงในเฟรมที่ hitbox ทำงาน ส่วนด้านหลังคือ after-image ของ sweep
      rotation.setFromAxisAngle(Y_AXIS, sweep * (t - 1));
      sweptBase.copy(baseOffset).applyQuaternion(rotation).add(pivot);
      sweptTip.copy(tipOffset).applyQuaternion(rotation).add(pivot);
      const diagonalLift = Math.sin(t * Math.PI) * (comboIndex === 2 ? 0.34 : comboIndex === 3 ? -0.16 : 0.12);
      sweptBase.y += diagonalLift * 0.35;
      sweptTip.y += diagonalLift;
      positions.push(
        sweptBase.x, sweptBase.y, sweptBase.z,
        sweptTip.x, sweptTip.y, sweptTip.z,
      );
      edgePositions.push(sweptTip.x, sweptTip.y, sweptTip.z);
      if (segment < segments) {
        const index = segment * 2;
        indices.push(index, index + 1, index + 2, index + 1, index + 3, index + 2);
      }
    }

    const ribbonGeometry = new THREE.BufferGeometry();
    ribbonGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    ribbonGeometry.setIndex(indices);
    const edgeGeometry = new THREE.BufferGeometry();
    edgeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(edgePositions, 3));

    const glow = additiveMaterial(color, finisher ? 0.78 : 0.64);
    const edgeColor = new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.68);
    const edge = new THREE.LineBasicMaterial({
      color: edgeColor,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const ribbon = new THREE.Mesh(ribbonGeometry, glow);
    const cuttingEdge = new THREE.Line(edgeGeometry, edge);
    const root = new THREE.Group();
    root.name = 'effect:blade-trail';
    root.add(ribbon, cuttingEdge);
    root.renderOrder = 18;
    this.scene.add(root);

    const forward = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
    this.track(root, finisher ? 0.3 : 0.22, [glow, edge], [ribbonGeometry, edgeGeometry], (_progress, remaining, dt) => {
      glow.opacity = remaining * (finisher ? 0.78 : 0.64);
      edge.opacity = remaining * remaining;
      root.position.addScaledVector(forward, dt * (finisher ? 1.2 : 0.55));
    });
  }

  /** muzzle flash + tracer + หัวกระสุนที่วิ่งจากปากกระบอกไปยังจุดโดนจริง */
  spawnGunShot(
    origin: THREE.Vector3,
    endpoint: THREE.Vector3,
    color = 0xffd477,
    impacted = false,
    power = 1,
  ): void {
    const delta = endpoint.clone().sub(origin);
    const distance = delta.length();
    if (distance < 0.05) return;
    const direction = delta.multiplyScalar(1 / distance);
    this.spawnMuzzleFlash(origin, direction, color, power);

    const coreMaterial = additiveMaterial(new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.72), 1);
    const glowMaterial = additiveMaterial(color, 0.36);
    const bulletMaterial = additiveMaterial(0xffffff, 1);
    const core = new THREE.Mesh(this.tracerGeo, coreMaterial);
    core.name = 'effect:gun-tracer';
    const glow = new THREE.Mesh(this.tracerGeo, glowMaterial);
    const bullet = new THREE.Mesh(this.bulletGeo, bulletMaterial);
    bullet.name = 'effect:gun-bullet';
    const root = new THREE.Group();
    root.name = 'effect:gun-shot';
    root.add(glow, core, bullet);
    this.scene.add(root);

    const orientation = new THREE.Quaternion().setFromUnitVectors(Y_AXIS, direction);
    core.quaternion.copy(orientation);
    glow.quaternion.copy(orientation);
    const middle = new THREE.Vector3();
    const duration = Math.min(0.2, 0.1 + distance * 0.008);
    let impactSpawned = false;
    this.track(root, duration, [coreMaterial, glowMaterial, bulletMaterial], [], (progress, remaining) => {
      const grow = easeOutCubic(progress / 0.42);
      const visibleLength = Math.max(0.03, distance * grow);
      middle.copy(origin).addScaledVector(direction, visibleLength * 0.5);
      core.position.copy(middle);
      glow.position.copy(middle);
      core.scale.set(power, visibleLength, power);
      glow.scale.set(power * 2.7, visibleLength, power * 2.7);
      bullet.position.copy(origin).addScaledVector(direction, distance * easeOutCubic(progress / 0.68));
      bullet.scale.setScalar(power * (0.75 + remaining * 0.45));
      const fade = progress < 0.5 ? 1 : remaining * 2;
      coreMaterial.opacity = THREE.MathUtils.clamp(fade, 0, 1);
      glowMaterial.opacity = THREE.MathUtils.clamp(fade * 0.36, 0, 0.36);
      bulletMaterial.opacity = THREE.MathUtils.clamp(fade, 0, 1);
      if (impacted && !impactSpawned && progress >= 0.62) {
        impactSpawned = true;
        this.spawnBulletImpact(endpoint, direction, color, power);
      }
    });
  }

  /** สร้างลูกพลังหลายชั้น: core, aura และวงโคจร — collision ยังอยู่ใน PlayerCombat */
  createEnergyProjectile(
    position: THREE.Vector3,
    direction: THREE.Vector3,
    color = 0x74e8ff,
    scale = 1,
    _lifetimeMs = 6_000,
  ): EnergyProjectileVisual {
    const normalizedDirection = direction.clone().normalize();
    const coreMaterial = additiveMaterial(new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.48), 0.98);
    const auraMaterial = additiveMaterial(color, 0.26);
    const ringMaterialA = additiveMaterial(new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.35), 0.86);
    const ringMaterialB = additiveMaterial(color, 0.62);
    const core = new THREE.Mesh(this.energyCoreGeo, coreMaterial);
    core.name = 'effect:energy-core';
    const aura = new THREE.Mesh(this.energyAuraGeo, auraMaterial);
    const ringA = new THREE.Mesh(this.energyRingGeo, ringMaterialA);
    const ringB = new THREE.Mesh(this.energyRingGeo, ringMaterialB);
    ringB.rotation.y = Math.PI / 2;
    ringB.scale.setScalar(0.82);
    const root = new THREE.Group();
    root.name = 'effect:energy-projectile';
    root.position.copy(position);
    root.quaternion.setFromUnitVectors(Z_AXIS, normalizedDirection);
    root.scale.setScalar(scale);
    root.add(aura, core, ringA, ringB);
    const asset = instantiateSpellFxAsset(selectSpellFxAsset(color, 'projectile'), color);
    if (asset) {
      asset.root.scale.setScalar(0.72 * scale);
      root.add(asset.root);
      core.visible = false;
      aura.visible = false;
      ringA.visible = false;
      ringB.visible = false;
    }
    this.scene.add(root);
    return {
      root,
      color,
      scale,
      direction: normalizedDirection,
      core,
      aura,
      rings: [ringA, ringB],
      materials: [coreMaterial, auraMaterial, ringMaterialA, ringMaterialB],
      assetRoot: asset?.root,
      assetMaterials: asset?.materials,
      elapsed: 0,
      trailTimer: 0,
    };
  }

  /** อัปเดต animation ของลูกพลังหลัง PlayerCombat ขยับตำแหน่งแล้ว */
  updateEnergyProjectile(visual: EnergyProjectileVisual, dt: number, lifeFraction: number, _metadata?: { elapsed?: number; remainingMs?: number; direction?: THREE.Vector3 }): void {
    visual.elapsed += dt;
    visual.trailTimer += dt;
    visual.core.rotation.x += dt * 7.2;
    visual.core.rotation.z -= dt * 8.6;
    visual.rings[0].rotation.z += dt * 8.5;
    visual.rings[1].rotation.z -= dt * 6.2;
    if (visual.assetRoot) {
      visual.assetRoot.rotation.y += dt * 4.2;
      visual.assetRoot.rotation.x += dt * 2.4;
      visual.assetRoot.scale.setScalar(visual.scale * (0.68 + Math.sin(visual.elapsed * 12) * 0.06));
      visual.assetMaterials?.forEach((material) => {
        const alphaMaterial = material as THREE.Material & { opacity?: number };
        if ('opacity' in alphaMaterial) alphaMaterial.opacity = Math.max(0, lifeFraction);
      });
    }
    const pulse = 1 + Math.sin(visual.elapsed * 20) * 0.1;
    visual.core.scale.setScalar(pulse);
    visual.aura.scale.setScalar(1.05 + Math.sin(visual.elapsed * 15 + 0.8) * 0.13);
    const fade = THREE.MathUtils.clamp(lifeFraction * 2.5, 0, 1);
    visual.materials[0].opacity = fade * 0.98;
    visual.materials[1].opacity = fade * 0.26;
    visual.materials[2].opacity = fade * 0.86;
    visual.materials[3].opacity = fade * 0.62;

    if (visual.trailTimer >= 0.065) {
      visual.trailTimer %= 0.065;
      this.spawnEnergyTrail(
        visual.root.position,
        visual.direction,
        visual.color,
        visual.scale,
        visual.elapsed,
      );
    }
  }

  /** ลบ visual/material ของลูกพลังและสร้าง burst สุดท้าย */
  destroyEnergyProjectile(visual: EnergyProjectileVisual, burstScale = 0.8): void {
    this.removeEnergyProjectile(visual);
    this.spawnEnergyImpact(visual.root.position, visual.color, visual.scale * burstScale);
  }

  /** ออกจากโลกหรือข้อมูลหมดอายุไม่ใช่การชน จึงล้างโดยไม่มี burst */
  removeEnergyProjectile(visual: EnergyProjectileVisual): void {
    this.scene.remove(visual.root);
    for (const material of visual.materials) material.dispose();
    visual.assetMaterials?.forEach((material) => material.dispose());
  }

  /** ใช้ phase เดียวกับ local โดยไม่สร้าง trail ย้อนหลังเมื่อเพิ่งเห็นลูกพลัง */
  seekEnergyProjectile(visual: EnergyProjectileVisual, elapsed: number, lifeFraction: number): void {
    const delta = elapsed - visual.elapsed;
    visual.trailTimer = (elapsed % 0.065) - delta;
    this.updateEnergyProjectile(visual, delta, lifeFraction);
  }

  /** เก็บเจ้าของของเอฟเฟกต์เพื่อให้ leave/zone change ล้างได้ตรงคน */
  replayForOwner(owner: object, emit: () => void): void {
    const previousOwner = this.currentOwner;
    this.currentOwner = owner;
    try { emit(); } finally { this.currentOwner = previousOwner; }
  }

  clearOwner(owner: object): void {
    for (const effect of [...this.active]) if (effect.owner === owner) this.removeEffect(effect);
  }

  dispose(): void {
    for (const effect of [...this.active]) this.removeEffect(effect);
    for (const number of this.numbers.splice(0)) {
      this.scene.remove(number.sprite);
      number.sprite.material.map?.dispose();
      number.sprite.material.dispose();
    }
    for (const value of Object.values(this)) if (value instanceof THREE.BufferGeometry) value.dispose();
  }

  /** วงพลังที่หด/ดีดออกจากมือในเฟรมปล่อยสกิล */
  spawnEnergyLaunch(
    position: THREE.Vector3,
    direction: THREE.Vector3,
    color = 0x74e8ff,
    scale = 1,
  ): void {
    const material = additiveMaterial(color, 0.9);
    const coreMaterial = additiveMaterial(new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.6), 0.85);
    const ring = new THREE.Mesh(this.energyRingGeo, material);
    const core = new THREE.Mesh(this.energyCoreGeo, coreMaterial);
    const root = new THREE.Group();
    root.name = 'effect:energy-launch';
    root.position.copy(position);
    root.quaternion.setFromUnitVectors(Z_AXIS, direction.clone().normalize());
    root.add(ring, core);
    const asset = instantiateSpellFxAsset(selectSpellFxAsset(color, 'launch'), color);
    if (asset) {
      asset.root.scale.setScalar(0.75 * scale);
      root.add(asset.root);
      ring.visible = false;
      core.visible = false;
    }
    this.scene.add(root);
    this.track(root, 0.24, [material, coreMaterial, ...(asset?.materials ?? [])], [], (progress, remaining) => {
      ring.rotation.z += 0.18;
      ring.scale.setScalar(scale * (0.45 + easeOutCubic(progress) * 1.35));
      core.scale.setScalar(scale * Math.max(0.05, remaining * 0.8));
      material.opacity = remaining * 0.9;
      coreMaterial.opacity = remaining * remaining * 0.85;
      if (asset) {
        asset.root.rotation.y += 0.16;
        asset.root.scale.setScalar(scale * (0.68 + progress * 0.5));
      }
    });
  }

  /** วงคลื่นกระแทกขยายรอบจุด (สกิลวงจันทร์ ฯลฯ) */
  spawnShockwave(position: THREE.Vector3, radius: number, color = 0xbfe8ff, assetId?: SpellFxAssetId): void {
    const material = additiveMaterial(color, 0.85);
    const geometry = new THREE.RingGeometry(radius * 0.35, radius * 0.5, 40);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'effect:shockwave-ring';
    mesh.position.copy(position);
    mesh.position.y += 0.25;
    mesh.rotation.x = -Math.PI / 2;
    const root = new THREE.Group();
    root.name = 'effect:shockwave';
    root.add(mesh);
    const asset = instantiateSpellFxAsset(assetId ?? selectSpellFxAsset(color, 'impact'), color);
    if (asset) {
      asset.root.scale.setScalar(Math.max(0.5, radius * 0.22));
      asset.root.position.y = 0.6;
      root.add(asset.root);
    }
    this.scene.add(root);
    this.track(root, 0.4, [material, ...(asset?.materials ?? [])], [geometry], (progress, remaining) => {
      material.opacity = remaining * 0.85;
      mesh.scale.setScalar(0.7 + progress * 0.9);
      if (asset) {
        asset.root.rotation.y += 0.16;
        asset.root.scale.setScalar(Math.max(0.5, radius * (0.18 + progress * 0.28)));
      }
    });
  }

  /** ลำแสงต่อเนื่อง 1 tick — เส้นยาวจาก origin ไปตาม direction (สกิล beam) */
  spawnBeam(origin: THREE.Vector3, direction: THREE.Vector3, length: number, color = 0xbfe8ff): void {
    const material = additiveMaterial(color, 0.82);
    const geometry = new THREE.CylinderGeometry(0.28, 0.28, Math.max(1, length), 12, 1, true);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'effect:beam';
    const dir = direction.clone().normalize();
    mesh.position.copy(origin).addScaledVector(dir, length / 2);
    mesh.quaternion.setFromUnitVectors(Y_AXIS, dir);
    this.scene.add(mesh);
    this.track(mesh, 0.13, [material], [geometry], (progress, remaining) => {
      material.opacity = remaining * 0.82;
      const s = 1 + progress * 0.6;
      mesh.scale.set(s, 1, s);
    });
  }

  /** ตัวเลขดาเมจลอยขึ้นเหนือเป้า */
  spawnDamageNumber(position: THREE.Vector3, amount: number, color = '#ffe28a', prefix = ''): void {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.font = '800 40px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 7;
    ctx.strokeStyle = 'rgba(0,0,0,.8)';
    ctx.strokeText(`${prefix}${Math.round(amount)}`, 64, 32);
    ctx.fillStyle = color;
    ctx.fillText(`${prefix}${Math.round(amount)}`, 64, 32);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    sprite.scale.set(1.5, 0.75, 1);
    sprite.position.copy(position);
    sprite.position.y += 1.9 + Math.random() * 0.4;
    sprite.position.x += (Math.random() - 0.5) * 0.6;
    sprite.renderOrder = 998;
    this.scene.add(sprite);
    this.numbers.push({ sprite, life: 0.75, maxLife: 0.75 });
  }

  /** Incoming player damage uses a negative prefix so it cannot be mistaken for a reward. */
  spawnPlayerDamageNumber(position: THREE.Vector3, amount: number): void {
    this.spawnDamageNumber(position, amount, '#ff6b6b', '-');
  }

  spawnBoatImpact(position: THREE.Vector3, destructive = false): void {
    const material = additiveMaterial(destructive ? 0xff6b42 : 0xd9ffff, 0.95);
    const geometry = destructive
      ? new THREE.IcosahedronGeometry(1.1, 1)
      : new THREE.RingGeometry(0.25, 1.35, 20);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'effect:boat-impact';
    mesh.position.copy(position);
    mesh.position.y += destructive ? 0.8 : 0.08;
    if (!destructive) mesh.rotation.x = -Math.PI / 2;
    this.scene.add(mesh);
    const duration = destructive ? 0.65 : 0.38;
    this.track(mesh, duration, [material], [geometry], (progress, remaining) => {
      material.opacity = remaining * 0.95;
      mesh.scale.setScalar(0.7 + progress * 0.8);
    });
  }

  /** ประกายเล็ก ๆ ตอนโดนโจมตี */
  spawnHitSpark(position: THREE.Vector3, color = 0xfff1a8): void {
    const material = additiveMaterial(color, 0.95);
    const mesh = new THREE.Mesh(this.sparkGeo, material);
    mesh.name = 'effect:hit-spark';
    mesh.position.copy(position);
    mesh.position.y += 1.1;
    mesh.lookAt(mesh.position.x, mesh.position.y + 0.001, mesh.position.z + 1);
    this.scene.add(mesh);
    this.track(mesh, 0.24, [material], [], (progress, remaining) => {
      material.opacity = remaining * 0.95;
      mesh.scale.setScalar(0.65 + progress * 1.05);
    });
  }

  update(dt: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const effect = this.active[i];
      this.advanceEffect(effect, dt, i);
    }

    for (let i = this.numbers.length - 1; i >= 0; i--) {
      const number = this.numbers[i];
      number.life -= dt;
      const remaining = Math.max(0, number.life / number.maxLife);
      number.sprite.position.y += dt * 1.7;
      (number.sprite.material as THREE.SpriteMaterial).opacity = remaining;
      if (number.life <= 0) {
        this.scene.remove(number.sprite);
        (number.sprite.material as THREE.SpriteMaterial).map?.dispose();
        (number.sprite.material as THREE.SpriteMaterial).dispose();
        this.numbers.splice(i, 1);
      }
    }
  }

  private advanceEffect(effect: ActiveEffect, dt: number, index: number): void {
    effect.life -= dt;
    const remaining = THREE.MathUtils.clamp(effect.life / effect.maxLife, 0, 1);
    effect.animate(1 - remaining, remaining, dt);
    if (effect.life <= 0) this.removeEffect(effect, index);
  }

  private removeEffect(effect: ActiveEffect, knownIndex?: number): void {
    this.scene.remove(effect.root);
    for (const material of effect.materials) material.dispose();
    for (const geometry of effect.geometries) geometry.dispose();
    const index = knownIndex ?? this.active.indexOf(effect);
    if (index >= 0) this.active.splice(index, 1);
  }

  private track(
    root: THREE.Object3D,
    maxLife: number,
    materials: THREE.Material[],
    geometries: THREE.BufferGeometry[],
    animate: ActiveEffect['animate'],
  ): void {
    this.active.push({ root, life: maxLife, maxLife, materials, geometries, animate, owner: this.currentOwner });
  }

  private spawnMuzzleFlash(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    color: number,
    power: number,
  ): void {
    const flashMaterial = additiveMaterial(new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.55), 1);
    const glowMaterial = additiveMaterial(color, 0.72);
    const cone = new THREE.Mesh(this.muzzleConeGeo, flashMaterial);
    cone.quaternion.setFromUnitVectors(Y_AXIS, direction);
    cone.position.copy(origin).addScaledVector(direction, 0.24 * power);
    const core = new THREE.Mesh(this.muzzleCoreGeo, glowMaterial);
    core.position.copy(origin);
    const ring = new THREE.Mesh(this.muzzleRingGeo, flashMaterial);
    ring.quaternion.setFromUnitVectors(Z_AXIS, direction);
    ring.position.copy(origin).addScaledVector(direction, 0.05);
    const root = new THREE.Group();
    root.name = 'effect:muzzle-flash';
    root.add(cone, core, ring);
    this.scene.add(root);
    this.track(root, 0.12, [flashMaterial, glowMaterial], [], (progress, remaining) => {
      const scale = power * (0.65 + progress * 1.1);
      cone.scale.setScalar(scale);
      core.scale.setScalar(scale * (1.1 + progress));
      ring.scale.setScalar(scale * (0.8 + progress * 1.4));
      flashMaterial.opacity = remaining * remaining;
      glowMaterial.opacity = remaining * remaining * 0.72;
    });
  }

  private spawnBulletImpact(
    position: THREE.Vector3,
    direction: THREE.Vector3,
    color: number,
    power: number,
  ): void {
    const ringMaterial = additiveMaterial(color, 0.92);
    const coreMaterial = additiveMaterial(0xffffff, 0.96);
    const ring = new THREE.Mesh(this.sparkGeo, ringMaterial);
    ring.quaternion.setFromUnitVectors(Z_AXIS, direction);
    const core = new THREE.Mesh(this.bulletGeo, coreMaterial);
    const root = new THREE.Group();
    root.name = 'effect:bullet-impact';
    root.position.copy(position);
    root.add(ring, core);
    this.scene.add(root);
    this.track(root, 0.18, [ringMaterial, coreMaterial], [], (progress, remaining) => {
      ring.scale.setScalar(power * (0.35 + progress * 1.5));
      core.scale.setScalar(power * (0.8 + progress * 1.6));
      ringMaterial.opacity = remaining * 0.92;
      coreMaterial.opacity = remaining * remaining * 0.96;
    });
  }

  private spawnEnergyTrail(
    position: THREE.Vector3,
    direction: THREE.Vector3,
    color: number,
    scale: number,
    seed: number,
  ): void {
    const material = additiveMaterial(color, 0.42);
    const mesh = new THREE.Mesh(this.energyTrailGeo, material);
    mesh.name = 'effect:energy-trail';
    const right = new THREE.Vector3(direction.z, 0, -direction.x);
    mesh.position.copy(position)
      .addScaledVector(direction, -0.28 * scale)
      .addScaledVector(right, Math.sin(seed * 31) * 0.14 * scale);
    mesh.scale.setScalar(scale * (0.75 + Math.sin(seed * 17) * 0.12));
    this.scene.add(mesh);
    this.track(mesh, 0.26, [material], [], (_progress, remaining, dt) => {
      mesh.position.addScaledVector(direction, -dt * 1.25);
      mesh.rotation.x += dt * 5;
      mesh.rotation.y -= dt * 4;
      mesh.scale.multiplyScalar(Math.max(0.8, 1 - dt * 2.2));
      material.opacity = remaining * remaining * 0.42;
    });
  }

  /** burst เมื่อพลังชนเป้าหมาย (projectile ผ่านได้หลายตัว จึงเรียกซ้ำต่อเป้าได้) */
  spawnEnergyImpact(position: THREE.Vector3, color: number, scale: number): void {
    const coreMaterial = additiveMaterial(new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.42), 0.9);
    const ringMaterial = additiveMaterial(color, 0.82);
    const core = new THREE.Mesh(this.energyAuraGeo, coreMaterial);
    const ringA = new THREE.Mesh(this.sparkGeo, ringMaterial);
    const ringB = new THREE.Mesh(this.sparkGeo, ringMaterial);
    ringA.rotation.x = Math.PI / 2;
    ringB.rotation.y = Math.PI / 2;
    const root = new THREE.Group();
    root.name = 'effect:energy-impact';
    root.position.copy(position);
    root.add(core, ringA, ringB);
    const asset = instantiateSpellFxAsset(selectSpellFxAsset(color, 'impact'), color);
    if (asset) {
      asset.root.scale.setScalar(0.8 * scale);
      root.add(asset.root);
      core.visible = false;
      ringA.visible = false;
      ringB.visible = false;
    }
    this.scene.add(root);
    this.track(root, 0.34, [coreMaterial, ringMaterial, ...(asset?.materials ?? [])], [], (progress, remaining) => {
      const expanded = scale * (0.35 + easeOutCubic(progress) * 1.8);
      core.scale.setScalar(expanded);
      ringA.scale.setScalar(expanded * 1.15);
      ringB.scale.setScalar(expanded * 0.95);
      ringA.rotation.z += 0.12;
      ringB.rotation.x -= 0.1;
      coreMaterial.opacity = remaining * remaining * 0.9;
      ringMaterial.opacity = remaining * 0.82;
      if (asset) {
        asset.root.rotation.y += 0.12;
        asset.root.rotation.z += 0.08;
        asset.root.scale.setScalar(scale * (0.72 + progress * 1.1));
      }
    });
  }
}
