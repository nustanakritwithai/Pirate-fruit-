import * as THREE from 'three';
import type { MonsterType } from './MonsterData';
import {
  createCrabVisual,
  createHumanoidVisual,
  type CharacterVisualResult,
} from '../art/CharacterVisuals';
import { ProceduralCharacterAnimator, type ProceduralLoopAction } from '../animation/ProceduralCharacterAnimator';
import { GltfMonsterAnimator } from '../animation/GltfCharacterAnimator';
import {
  instantiatePirateAsset,
  pirateAssetForMonster,
} from '../art/PirateAssetLibrary';

export type MonsterState = 'idle' | 'chase' | 'attack' | 'return' | 'dead';

/** สร้าง visual แบบ Mobile PBR คืน group + hull (ตัวหลักไว้แฟลชตอนโดนตี) */
function createModel(type: MonsterType): CharacterVisualResult {
  const ancientConstruct = type.id === 'ruin-guardian'
    || type.id === 'sand-golem'
    || type.id === 'sun-guardian-boss'
    || type.id === 'crystal-golem'
    || type.id === 'frost-king-boss'
    || type.id === 'storm-golem'
    || type.id === 'tempest-lord-boss'
    || type.id === 'obsidian-golem'
    || type.id === 'magma-titan-boss';
  const frostConstruct = type.id === 'crystal-golem' || type.id === 'frost-king-boss';
  const stormConstruct = type.id === 'storm-golem' || type.id === 'tempest-lord-boss';
  const magmaConstruct = type.id === 'obsidian-golem' || type.id === 'magma-titan-boss';
  const visual = type.kind === 'crab'
    ? createCrabVisual(type.color)
    : createHumanoidVisual({
        clothColor: type.color,
        accentColor: magmaConstruct ? 0xff6b2b : stormConstruct ? 0xbed9ff : frostConstruct ? 0x87d8e8 : ancientConstruct ? 0x5e4934 : type.kind === 'boss' ? 0x7b2030 : 0x825033,
        skinColor: magmaConstruct ? 0x3b3034 : stormConstruct ? 0x687cab : frostConstruct ? 0x5e94aa : ancientConstruct ? 0x957c5e : type.kind === 'boss' ? 0x9a664b : 0xb9825f,
        pirate: !ancientConstruct,
        boss: type.kind === 'boss',
      });
  const { group } = visual;

  group.scale.setScalar(type.scale);
  return visual;
}

interface MonsterVisualAnimator {
  triggerAttack(heavy?: boolean): void;
  triggerHit(): void;
  reset(): void;
  update(dt: number, action: ProceduralLoopAction, deathProgress?: number): void;
  dispose?(): void;
}

function flashableMaterials(root: THREE.Object3D): THREE.MeshStandardMaterial[] {
  const found = new Set<THREE.MeshStandardMaterial>();
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      const standard = material as THREE.MeshStandardMaterial;
      if (standard.isMeshStandardMaterial) found.add(standard);
    }
  });
  return [...found];
}

/** แถบ HP ลอยหัวมอนสเตอร์ (canvas sprite) */
class HealthBar {
  readonly sprite: THREE.Sprite;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private texture: THREE.CanvasTexture;

  constructor(private level: number, private isBoss: boolean, headHeight: number) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 128;
    this.canvas.height = 30;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({ map: this.texture, transparent: true, depthTest: false, depthWrite: false });
    this.sprite = new THREE.Sprite(material);
    this.sprite.scale.set(isBoss ? 3 : 2, isBoss ? 0.7 : 0.47, 1);
    this.sprite.position.y = headHeight;
    this.sprite.renderOrder = 999;
    this.draw(1);
  }

  draw(fraction: number): void {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // ป้ายเลเวล
    ctx.fillStyle = this.isBoss ? '#ffcf6b' : '#ffe9a8';
    ctx.font = '700 13px sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(`Lv.${this.level}`, 2, 9);
    // หลอด
    const x = 2, y = 16, w = canvas.width - 4, h = 10;
    ctx.fillStyle = 'rgba(0,0,0,.6)';
    ctx.fillRect(x, y, w, h);
    const c = fraction > 0.5 ? '#5fd66a' : fraction > 0.22 ? '#e9c341' : '#e0432e';
    ctx.fillStyle = c;
    ctx.fillRect(x + 1, y + 1, Math.max(0, (w - 2) * fraction), h - 2);
    ctx.strokeStyle = 'rgba(255,255,255,.55)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.texture.dispose();
    (this.sprite.material as THREE.SpriteMaterial).dispose();
  }
}

/** มอนสเตอร์หนึ่งตัว: ถือ state/hp/โมเดล ส่วน AI ขับจาก MonsterManager */
export class Monster {
  readonly group: THREE.Group;
  private readonly healthBar: HealthBar;
  private readonly animator: MonsterVisualAnimator;
  private readonly visualRoot: THREE.Group;
  private readonly proceduralRoot: THREE.Group | null;
  private readonly flashMaterials: THREE.MeshStandardMaterial[];
  private readonly disposeExternalMaterials: (() => void) | null;

  hp: number;
  state: MonsterState = 'idle';
  readonly home = new THREE.Vector2();
  attackCooldown = 0;
  respawnTimer = 0;
  wanderAngle = Math.random() * Math.PI * 2;
  wanderTimer = 0;
  /** ความเร็วผลักจาก knockback (ลดทอนเองใน manager) */
  kbX = 0;
  kbZ = 0;
  /** ระหว่างเซอยู่ AI ขยับเข้าตีไม่ได้ */
  staggerTimer = 0;
  /** นับจำนวนครั้งที่ตี (ไว้จับจังหวะท่าหนักทุกครั้งที่ N) */
  attackCount = 0;
  /** เกิน leash จากบ้าน — บังคับเดินกลับจนใกล้บ้านก่อนถึงจะ aggro ใหม่ได้ */
  returningHome = false;
  /** กำลังง้างท่าหนัก — แฟลชเตือนจนกว่าจะครบเวลาแล้วปล่อย */
  telegraphTimer = 0;
  pendingHeavy = false;
  private hitFlash = 0;
  /** Presentation-only recoil. Never changes the authoritative group transform. */
  private readonly hitOffset = new THREE.Vector2();
  private deathTimer = 0;

  constructor(
    readonly type: MonsterType,
    x: number,
    z: number,
    y: number,
    private readonly respawnDelay = 12,
  ) {
    this.group = new THREE.Group();
    this.group.name = `monster:${type.id}`;
    // ตำแหน่งเกิดเป็น seed คงที่ ทำให้มอนในค่ายเดียวกันสลับ silhouette ได้
    // แต่ respawn จุดเดิมแล้วไม่เปลี่ยนตัวแบบแบบสุ่ม
    const assetSelection = pirateAssetForMonster(type, x * 997.3 + z * 619.1);
    const external = assetSelection
      ? instantiatePirateAsset(assetSelection.id, assetSelection)
      : null;
    let externalHeight: number | null = null;
    const phase = Math.abs(Math.sin(x * 12.9898 + z * 78.233)) * Math.PI * 2;
    if (external && assetSelection) {
      this.visualRoot = external.root;
      externalHeight = assetSelection.baseHeight * type.scale;
      const modelScale = externalHeight / external.bounds.height;
      this.visualRoot.scale.setScalar(modelScale);
      this.visualRoot.position.y = -external.bounds.minY * modelScale;
      this.proceduralRoot = null;
      this.animator = new GltfMonsterAnimator(this.visualRoot, external.animations);
      this.disposeExternalMaterials = external.disposeMaterials;
    } else {
      const model = createModel(type);
      this.visualRoot = model.group;
      this.proceduralRoot = model.group;
      this.animator = new ProceduralCharacterAnimator(model.rig, phase);
      this.disposeExternalMaterials = null;
    }
    this.group.add(this.visualRoot);
    this.flashMaterials = flashableMaterials(this.visualRoot);
    this.group.position.set(x, y, z);
    this.home.set(x, z);
    this.hp = type.maxHp;
    const headHeight = externalHeight !== null
      ? externalHeight + Math.max(0.32, externalHeight * 0.12)
      : (type.kind === 'crab' ? 1.5 : 3.4) * type.scale;
    this.healthBar = new HealthBar(type.level, type.kind === 'boss', headHeight);
    this.group.add(this.healthBar.sprite);
  }

  get alive(): boolean {
    return this.state !== 'dead';
  }

  get hpFraction(): number {
    return Math.max(0, this.hp / this.type.maxHp);
  }

  /**
   * Apply absolute S16 world state without letting the render client simulate HP.
   * SharedMonsterClient reuses this method so the authoritative path gets the
   * same preloaded GLB, fallback visual, health bar and animation lifecycle as
   * local monsters.
   */
  applyAuthoritativeState(hp: number, maxHp: number, state: MonsterState): void {
    const nextHp = THREE.MathUtils.clamp(Number.isFinite(hp) ? hp : 0, 0, Math.max(1, maxHp));
    const wasDead = this.state === 'dead';

    if (state === 'dead') {
      this.hp = 0;
      this.healthBar.draw(0);
      if (!wasDead) this.die();
      return;
    }

    if (wasDead) {
      this.deathTimer = 0;
      this.animator.reset();
      this.group.scale.set(1, 1, 1);
      this.group.rotation.x = 0;
      this.group.rotation.z = 0;
    }
    this.hp = nextHp;
    this.state = state;
    this.group.visible = true;
    this.healthBar.sprite.visible = true;
    this.healthBar.draw(nextHp / Math.max(1, maxHp));
  }

  /** รับดาเมจ คืน true ถ้าตายจากครั้งนี้ */
  takeDamage(amount: number, sourceX?: number, sourceZ?: number): boolean {
    if (this.state === 'dead') return false;
    this.hp = Math.max(0, this.hp - amount);
    this.healthBar.draw(this.hpFraction);
    this.playHitReaction(sourceX, sourceZ);
    if (this.hp <= 0) {
      this.die();
      return true;
    }
    return false;
  }

  /**
   * Read-only combat presentation: flash, hit animation and a short model-only recoil.
   * The root transform remains controlled by local collision or the Server snapshot.
   */
  playHitReaction(sourceX?: number, sourceZ?: number, strength = 0.52): void {
    if (this.state === 'dead') return;
    this.hitFlash = 0.18;
    this.animator.triggerHit();
    for (const material of this.flashMaterials) {
      material.emissive.setHex(0xff3a20);
      material.emissiveIntensity = 1.4;
    }
    let dx: number;
    let dz: number;
    if (Number.isFinite(sourceX) && Number.isFinite(sourceZ)) {
      dx = this.group.position.x - sourceX!;
      dz = this.group.position.z - sourceZ!;
    } else {
      // A shared delta does not yet carry the attacker position. Recoil opposite facing
      // so every observer still gets one deterministic impact beat.
      dx = -Math.sin(this.group.rotation.y);
      dz = -Math.cos(this.group.rotation.y);
    }
    this.playHitReactionDirection(dx, dz, strength);
  }

  /** Apply a Server-provided presentation impulse without changing the authoritative group. */
  playHitReactionDirection(directionX: number, directionZ: number, strength = 0.52): void {
    if (this.state === 'dead') return;
    const length = Math.hypot(directionX, directionZ) || 1;
    const resistance = this.type.kind === 'boss' ? 0.35 : 1;
    const amount = Math.min(0.8, Math.max(0.15, strength) * resistance);
    this.hitOffset.x = (directionX / length) * amount;
    this.hitOffset.y = (directionZ / length) * amount;
  }

  private die(): void {
    this.state = 'dead';
    this.deathTimer = 0.7;
    this.respawnTimer = this.respawnDelay;
    this.healthBar.sprite.visible = false;
  }

  /** visual event จาก MonsterManager เท่านั้น ไม่เปลี่ยน hit timing หรือ damage */
  playAttackAnimation(heavy = false): void {
    this.animator.triggerAttack(heavy);
  }

  /** ตั้งค่ากลับมาเกิดใหม่ที่บ้าน */
  respawn(y: number): void {
    this.hp = this.type.maxHp;
    this.state = 'idle';
    this.attackCooldown = 0;
    this.attackCount = 0;
    this.pendingHeavy = false;
    this.telegraphTimer = 0;
    this.kbX = 0;
    this.kbZ = 0;
    this.staggerTimer = 0;
    this.hitOffset.set(0, 0);
    this.visualRoot.position.x = 0;
    this.visualRoot.position.z = 0;
    this.group.position.set(this.home.x, y, this.home.y);
    this.group.scale.set(1, 1, 1);
    this.group.rotation.x = 0;
    this.group.rotation.z = 0;
    this.animator.reset();
    this.group.visible = true;
    this.healthBar.sprite.visible = true;
    this.healthBar.draw(1);
  }

  /** อนิเมชัน/แฟลช/บ๊อบ คืน true เมื่ออนิเมชันตายจบ (ให้ manager ซ่อน) */
  updateVisual(dt: number): boolean {
    const recoilDamp = Math.exp(-10 * Math.min(dt, 0.05));
    this.hitOffset.multiplyScalar(recoilDamp);
    if (this.hitOffset.lengthSq() < 1e-5) this.hitOffset.set(0, 0);
    if (this.hitFlash > 0) {
      this.hitFlash -= dt;
      for (const material of this.flashMaterials) {
        material.emissiveIntensity = Math.max(0, material.emissiveIntensity - dt * 8);
      }
    } else if (this.pendingHeavy) {
      // telegraph ท่าหนัก: กะพริบส้มเตือนให้ผู้เล่นหลบ
      for (const material of this.flashMaterials) {
        material.emissive.setHex(0xff9020);
        material.emissiveIntensity = 0.6 + Math.sin(performance.now() * 0.03) * 0.5;
      }
    } else if (this.state !== 'dead') {
      for (const material of this.flashMaterials) {
        if (material.emissiveIntensity > 0 && this.hitFlash <= 0) {
          material.emissiveIntensity = Math.max(0, material.emissiveIntensity - dt * 6);
        }
      }
    }
    let deathProgress = 0;
    if (this.state === 'dead') {
      this.deathTimer -= dt;
      deathProgress = 1 - Math.max(0, this.deathTimer / 0.7);
    }

    const action: ProceduralLoopAction = this.pendingHeavy
      ? 'heavy'
      : this.state === 'chase'
        ? 'run'
        : this.state === 'return'
          ? 'walk'
          : 'idle';
    this.animator.update(dt, action, deathProgress);
    // GLTF animation tracks can write root translation. Apply presentation recoil last
    // so imported and procedural enemies both visibly react on the rendered frame.
    this.visualRoot.position.x = this.hitOffset.x;
    this.visualRoot.position.z = this.hitOffset.y;

    if (this.state === 'dead') {
      if (this.deathTimer <= 0) {
        this.group.visible = false;
        return true;
      }
    }
    return false;
  }

  dispose(): void {
    this.healthBar.dispose();
    this.animator.dispose?.();
    this.proceduralRoot?.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) material.dispose();
    });
    this.disposeExternalMaterials?.();
  }
}
