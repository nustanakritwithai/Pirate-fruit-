import * as THREE from 'three';
import type { CharacterController } from './CharacterController';
import type { GraphicsProfile } from '../engine/GraphicsQuality';
import {
  PlayerActionAnimator,
  type PlayerActionSnapshot,
  type PlayerLocomotion,
} from '../animation/PlayerActionAnimator';
import type { CombatState } from '../combat/CombatState';
import type { SkillRenderType } from '../combat/SkillCasting';
import type { LoadoutCategory } from '../progression/ProgressionTypes';
import {
  attachmentSocketsFromPirateRig,
  type CharacterAttachmentSockets,
} from '../art/CharacterRig';
import { createPiratePlayerVisual } from '../art/PiratePlayerVisual';
import { createQuaterniusPlayerVisual } from '../art/QuaterniusPlayerVisual';

interface PlayerVisualAnimator {
  update(dt: number, snapshot: PlayerActionSnapshot): void;
  dispose?(): void;
}

/**
 * ตัวละครผู้เล่น Pirate V1: visual/rig ของโปรเจกต์เอง + animation ตาม gameplay state
 */
export class Player {
  readonly group = new THREE.Group();

  private actionAnimator: PlayerVisualAnimator | null = null;
  private readonly sockets: CharacterAttachmentSockets = {
    leftHand: null,
    rightHand: null,
    hips: null,
  };
  private getActionState: () => {
    combatState: CombatState;
    category: LoadoutCategory;
    attackProgress?: number;
    hitReactionId?: number;
    hitReactionAngle?: number;
    skillAnimationProgress?: number;
    skillAnimationReleaseProgress?: number;
    skillAnimationType?: SkillRenderType;
    skillAnimationVariant?: number;
    skillAnimationUltimate?: boolean;
    skillAnimationCategory?: LoadoutCategory;
  } = () => ({
    combatState: 'idle',
    category: 'style',
  });

  constructor(
    private controller: CharacterController,
    _graphics: GraphicsProfile,
    _maxAnisotropy = 4,
  ) {}

  async load(scene: THREE.Scene): Promise<void> {
    const external = createQuaterniusPlayerVisual();
    if (external) {
      this.group.name = 'player:gameplay-root';
      this.group.add(external.group);
      scene.add(this.group);
      Object.assign(this.sockets, external.sockets);
      this.actionAnimator = external.animator;
      return;
    }

    const visual = createPiratePlayerVisual();
    this.group.name = 'player:gameplay-root';
    this.group.add(visual.group);
    scene.add(this.group);
    Object.assign(this.sockets, attachmentSocketsFromPirateRig(visual.rig));
    this.actionAnimator = new PlayerActionAnimator(visual.rig);
  }

  /** late-bind หลัง PlayerCombat ถูกสร้าง เพื่อไม่ให้ Player เป็นเจ้าของ combat logic */
  bindActionState(
    provider: () => {
      combatState: CombatState;
      category: LoadoutCategory;
      attackProgress?: number;
      hitReactionId?: number;
      hitReactionAngle?: number;
      skillAnimationProgress?: number;
      skillAnimationReleaseProgress?: number;
      skillAnimationType?: SkillRenderType;
      skillAnimationVariant?: number;
      skillAnimationUltimate?: boolean;
      skillAnimationCategory?: LoadoutCategory;
    },
  ): void {
    this.getActionState = provider;
  }

  /** visual-only sockets สำหรับอุปกรณ์ ไม่เปิดให้ระบบ combat แก้ bone */
  get equipmentSockets(): Readonly<CharacterAttachmentSockets> {
    return this.sockets;
  }

  /**
   * Read the same visual snapshot that drives the local animator. The parent
   * presence publisher calls this every game update before its network
   * throttle, so a short action cannot disappear between 100 ms publishes.
   */
  sampleActionSnapshot(): PlayerActionSnapshot {
    const { moveState } = this.controller;
    const action = this.getActionState();
    const locomotionLocked = action.combatState === 'casting' ||
      action.combatState === 'blocking' ||
      action.combatState === 'stunned' ||
      action.combatState === 'knockback' ||
      action.combatState === 'knockdown' ||
      action.combatState === 'dead';
    let locomotion: PlayerLocomotion = 'idle';
    if (!locomotionLocked && moveState.swimming) locomotion = 'swim';
    else if (!locomotionLocked && !moveState.dashing && moveState.speed > 5) locomotion = 'run';
    else if (!locomotionLocked && !moveState.dashing && moveState.speed > 0.1) locomotion = 'walk';
    return {
      combatState: action.combatState,
      category: action.category,
      locomotion,
      onGround: moveState.onGround,
      dashing: moveState.dashing,
      verticalVelocity: this.controller.verticalSpeed,
      attackProgress: action.attackProgress,
      hitReactionId: action.hitReactionId,
      hitReactionAngle: action.hitReactionAngle,
      skillAnimationProgress: action.skillAnimationProgress,
      skillAnimationReleaseProgress: action.skillAnimationReleaseProgress,
      skillAnimationType: action.skillAnimationType,
      skillAnimationVariant: action.skillAnimationVariant,
      skillAnimationUltimate: action.skillAnimationUltimate,
      skillAnimationCategory: action.skillAnimationCategory,
    };
  }

  update(dt: number): void {
    const { position, heading } = this.controller;
    this.group.position.copy(position);
    this.group.rotation.y = heading;
    const snapshot = this.sampleActionSnapshot();
    this.actionAnimator?.update(dt, snapshot);
  }
}
