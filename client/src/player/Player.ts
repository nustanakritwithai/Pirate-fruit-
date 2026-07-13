import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { CharacterController } from './CharacterController';
import type { GraphicsProfile } from '../engine/GraphicsQuality';
import { enhanceLoadedModel } from '../art/ModelEnhancer';
import { PlayerActionAnimator, type PlayerActionSnapshot } from '../animation/PlayerActionAnimator';
import type { CombatState } from '../combat/CombatState';
import type { LoadoutCategory } from '../progression/ProgressionTypes';
import {
  attachmentSocketsFromRig,
  resolveMixamoPlayerRig,
  type CharacterAttachmentSockets,
} from '../art/CharacterRig';

type AnimName = 'Idle' | 'Walk' | 'Run';

/** โมเดล Soldier.glb หันหน้าไปทาง -Z จึงต้องกลับด้าน 180 องศา */
const MODEL_YAW_OFFSET = Math.PI;

/**
 * ตัวละครผู้เล่น: โหลดโมเดล GLTF + เล่น animation ตามสถานะการเคลื่อนที่
 */
export class Player {
  readonly group = new THREE.Group();

  private mixer: THREE.AnimationMixer | null = null;
  private actionAnimator: PlayerActionAnimator | null = null;
  private actions = new Map<AnimName, THREE.AnimationAction>();
  private current: AnimName = 'Idle';
  private readonly sockets: CharacterAttachmentSockets = {
    leftHand: null,
    rightHand: null,
    hips: null,
  };
  private getActionState: () => { combatState: CombatState; category: LoadoutCategory } = () => ({
    combatState: 'idle',
    category: 'style',
  });

  constructor(
    private controller: CharacterController,
    private graphics: GraphicsProfile,
    private maxAnisotropy = 4,
  ) {}

  async load(scene: THREE.Scene): Promise<void> {
    const gltf = await new GLTFLoader().loadAsync('assets/models/Soldier.glb');
    const model = gltf.scene;
    enhanceLoadedModel(model, this.graphics, this.maxAnisotropy);
    model.rotation.y = MODEL_YAW_OFFSET;
    this.group.add(model);
    scene.add(this.group);
    const rig = resolveMixamoPlayerRig(model);
    Object.assign(this.sockets, attachmentSocketsFromRig(rig));
    this.actionAnimator = new PlayerActionAnimator(rig);

    this.mixer = new THREE.AnimationMixer(model);
    for (const name of ['Idle', 'Walk', 'Run'] as const) {
      const clip = THREE.AnimationClip.findByName(gltf.animations, name);
      if (clip) {
        this.actions.set(name, this.mixer.clipAction(clip));
      }
    }
    this.actions.get('Idle')?.play();
  }

  /** late-bind หลัง PlayerCombat ถูกสร้าง เพื่อไม่ให้ Player เป็นเจ้าของ combat logic */
  bindActionState(
    provider: () => { combatState: CombatState; category: LoadoutCategory },
  ): void {
    this.getActionState = provider;
  }

  /** visual-only sockets สำหรับอุปกรณ์ ไม่เปิดให้ระบบ combat แก้ bone */
  get equipmentSockets(): Readonly<CharacterAttachmentSockets> {
    return this.sockets;
  }

  private setAnimation(name: AnimName): void {
    if (name === this.current) return;
    const next = this.actions.get(name);
    const prev = this.actions.get(this.current);
    if (!next) return;
    next.reset().fadeIn(0.2).play();
    prev?.fadeOut(0.2);
    this.current = name;
  }

  update(dt: number): void {
    const { position, heading, moveState } = this.controller;
    const action = this.getActionState();
    this.group.position.copy(position);
    this.group.rotation.y = heading;

    const locomotionLocked = action.combatState === 'casting' ||
      action.combatState === 'blocking' ||
      action.combatState === 'stunned' ||
      action.combatState === 'knockback' ||
      action.combatState === 'knockdown' ||
      action.combatState === 'dead';
    if (!locomotionLocked && moveState.speed > 5) {
      this.setAnimation('Run');
    } else if (!locomotionLocked && moveState.speed > 0.1) {
      this.setAnimation('Walk');
    } else {
      this.setAnimation('Idle');
    }

    // ตอนลอยตัวกลางอากาศให้ animation เดินช้าลง ดูเบาๆ เหมือนลอย
    const timeScale = moveState.onGround ? 1 : 0.4;
    if (this.mixer) {
      this.mixer.timeScale = timeScale;
      this.mixer.update(dt);
    }
    const snapshot: PlayerActionSnapshot = {
      combatState: action.combatState,
      category: action.category,
      onGround: moveState.onGround,
    };
    this.actionAnimator?.update(dt, snapshot);
  }
}
