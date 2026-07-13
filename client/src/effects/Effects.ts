import * as THREE from 'three';

interface ActiveEffect {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  baseScale?: number;
}

interface DamageNumber {
  sprite: THREE.Sprite;
  life: number;
  maxLife: number;
}

export const SLASH_ARC_LENGTH = Math.PI * 0.85;

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

/**
 * เอฟเฟกต์ชั่วคราวในฉาก — ตอนนี้มีคลื่นฟันโจมตี (placeholder ก่อนถึง Phase 5 Combat)
 */
export class Effects {
  private active: ActiveEffect[] = [];
  private numbers: DamageNumber[] = [];
  private slashGeo = new THREE.RingGeometry(0.5, 1.5, 24, 1, 0, SLASH_ARC_LENGTH);

  constructor(private scene: THREE.Scene) {}

  /** คลื่นโค้งหน้าตัวละคร ตอนโจมตี (สีตามอาวุธ, จังหวะคอมโบสุดท้ายใหญ่ขึ้น) */
  spawnSlash(position: THREE.Vector3, heading: number, color = 0x9fdcff, scale = 1): void {
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(this.slashGeo, mat);
    mesh.position.copy(position);
    mesh.position.y += 1.15;
    mesh.position.x += Math.sin(heading) * 0.9;
    mesh.position.z += Math.cos(heading) * 0.9;
    // วางแนวนอน แล้วหมุนให้ส่วนโค้งชี้ไปทางที่ตัวละครหัน
    mesh.rotation.set(-Math.PI / 2, 0, 0);
    mesh.rotateZ(getForwardArcRotation(heading));
    this.scene.add(mesh);
    this.active.push({ mesh, life: 0.22, maxLife: 0.22, baseScale: scale });
  }

  /** วงคลื่นกระแทกขยายรอบจุด (สกิลวงจันทร์ ฯลฯ) */
  spawnShockwave(position: THREE.Vector3, radius: number, color = 0xbfe8ff): void {
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(new THREE.RingGeometry(radius * 0.35, radius * 0.5, 40), mat);
    mesh.position.copy(position);
    mesh.position.y += 0.25;
    mesh.rotation.x = -Math.PI / 2;
    this.scene.add(mesh);
    this.active.push({ mesh, life: 0.4, maxLife: 0.4, baseScale: 1.6 });
  }

  /** ตัวเลขดาเมจลอยขึ้นเหนือเป้า */
  spawnDamageNumber(position: THREE.Vector3, amount: number, color = '#ffe28a'): void {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.font = '800 40px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 7;
    ctx.strokeStyle = 'rgba(0,0,0,.8)';
    ctx.strokeText(`${Math.round(amount)}`, 64, 32);
    ctx.fillStyle = color;
    ctx.fillText(`${Math.round(amount)}`, 64, 32);
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

  spawnBoatImpact(position: THREE.Vector3, destructive = false): void {
    const material = new THREE.MeshBasicMaterial({
      color: destructive ? 0xff6b42 : 0xd9ffff,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const geometry = destructive
      ? new THREE.IcosahedronGeometry(1.1, 1)
      : new THREE.RingGeometry(0.25, 1.35, 20);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    mesh.position.y += destructive ? 0.8 : 0.08;
    if (!destructive) mesh.rotation.x = -Math.PI / 2;
    this.scene.add(mesh);
    this.active.push({ mesh, life: destructive ? 0.65 : 0.38, maxLife: destructive ? 0.65 : 0.38 });
  }

  /** ประกายเล็ก ๆ ตอนดาบโดนมอนสเตอร์ */
  spawnHitSpark(position: THREE.Vector3, color = 0xfff1a8): void {
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(new THREE.RingGeometry(0.12, 0.5, 16), mat);
    mesh.position.copy(position);
    mesh.position.y += 1.1;
    mesh.lookAt(mesh.position.x, mesh.position.y + 0.001, mesh.position.z + 1);
    this.scene.add(mesh);
    this.active.push({ mesh, life: 0.24, maxLife: 0.24 });
  }

  update(dt: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const fx = this.active[i];
      fx.life -= dt;
      const t = Math.max(0, fx.life / fx.maxLife);
      (fx.mesh.material as THREE.MeshBasicMaterial).opacity = t * 0.9;
      const s = (fx.baseScale ?? 1) * (0.7 + (1 - t) * 0.8);
      fx.mesh.scale.set(s, s, s);
      if (fx.life <= 0) {
        this.scene.remove(fx.mesh);
        (fx.mesh.material as THREE.Material).dispose();
        this.active.splice(i, 1);
      }
    }

    for (let i = this.numbers.length - 1; i >= 0; i--) {
      const num = this.numbers[i];
      num.life -= dt;
      const t = Math.max(0, num.life / num.maxLife);
      num.sprite.position.y += dt * 1.7;
      (num.sprite.material as THREE.SpriteMaterial).opacity = t;
      if (num.life <= 0) {
        this.scene.remove(num.sprite);
        (num.sprite.material as THREE.SpriteMaterial).map?.dispose();
        (num.sprite.material as THREE.SpriteMaterial).dispose();
        this.numbers.splice(i, 1);
      }
    }
  }
}
