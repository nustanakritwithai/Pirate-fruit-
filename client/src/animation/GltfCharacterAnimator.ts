import * as THREE from 'three';
import type { PlayerActionSnapshot, PlayerLocomotion } from './PlayerActionAnimator';
import type { ProceduralLoopAction } from './ProceduralCharacterAnimator';

type ClipSemantic =
  | 'death'
  | 'duck'
  | 'hit'
  | 'idle'
  | 'jump-idle'
  | 'jump-land'
  | 'jump'
  | 'punch'
  | 'run'
  | 'sword'
  | 'walk'
  | 'wave';

const CLIP_TOKEN: Record<ClipSemantic, string> = {
  death: 'Death',
  duck: 'Duck',
  hit: 'HitReact',
  idle: 'Idle',
  'jump-idle': 'Jump_Idle',
  'jump-land': 'Jump_Land',
  jump: 'Jump',
  punch: 'Punch',
  run: 'Run',
  sword: 'Sword',
  walk: 'Walk',
  wave: 'Wave',
};

function clipFor(
  clips: readonly THREE.AnimationClip[],
  semantic: ClipSemantic,
): THREE.AnimationClip | undefined {
  const token = CLIP_TOKEN[semantic];
  return clips.find((clip) => clip.name.includes(`|${token}|`));
}

/** ตัวเล่น clip เล็ก ๆ ที่ทำ crossfade และกันการ reset animation ซ้ำทุก frame */
class ClipPlayer {
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<ClipSemantic, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private currentKey = '';

  constructor(root: THREE.Object3D, clips: readonly THREE.AnimationClip[]) {
    this.mixer = new THREE.AnimationMixer(root);
    for (const semantic of Object.keys(CLIP_TOKEN) as ClipSemantic[]) {
      const clip = clipFor(clips, semantic);
      if (clip) this.actions.set(semantic, this.mixer.clipAction(clip));
    }
  }

  playLoop(semantic: ClipSemantic, key: string = semantic, speed = 1, fade = 0.12): void {
    const action = this.actions.get(semantic) ?? this.actions.get('idle');
    if (!action) return;
    if (this.current === action && this.currentKey === key) {
      action.timeScale = speed;
      return;
    }
    this.activate(action, key, fade);
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = false;
    action.timeScale = speed;
  }

  playOnce(
    semantic: ClipSemantic,
    key: string,
    duration?: number,
    fade = 0.08,
  ): void {
    const action = this.actions.get(semantic) ?? this.actions.get('idle');
    if (!action) return;
    if (this.current === action && this.currentKey === key) return;
    this.activate(action, key, fade);
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.timeScale = 1;
    if (duration && duration > 0) action.setDuration(duration);
  }

  setNormalizedProgress(progress: number): void {
    if (!this.current) return;
    const duration = this.current.getClip().duration;
    this.current.time = THREE.MathUtils.clamp(progress, 0, 0.999) * duration;
  }

  update(dt: number): void {
    this.mixer.update(dt);
  }

  reset(): void {
    this.mixer.stopAllAction();
    this.current = null;
    this.currentKey = '';
    this.playLoop('idle');
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.mixer.getRoot());
  }

  private activate(action: THREE.AnimationAction, key: string, fade: number): void {
    if (this.current && this.current !== action) this.current.fadeOut(fade);
    action.reset();
    action.enabled = true;
    action.setEffectiveWeight(1);
    action.fadeIn(fade).play();
    this.current = action;
    this.currentKey = key;
  }
}

function isAttack(state: PlayerActionSnapshot['combatState']): boolean {
  return state === 'attack1' || state === 'attack2' || state === 'attack3' || state === 'attack4';
}

function attackDuration(snapshot: PlayerActionSnapshot): number {
  const index = snapshot.combatState === 'attack2' ? 1 : snapshot.combatState === 'attack3' ? 2 : snapshot.combatState === 'attack4' ? 3 : 0;
  if (snapshot.category === 'sword') return [0.52, 0.52, 0.58, 0.89][index];
  if (snapshot.category === 'style') return [0.4, 0.4, 0.46, 0.73][index];
  return [0.44, 0.46, 0.5, 0.68][index];
}

function locomotionClip(locomotion: PlayerLocomotion): ClipSemantic {
  if (locomotion === 'run') return 'run';
  if (locomotion === 'walk') return 'walk';
  if (locomotion === 'swim') return 'jump-idle';
  return 'idle';
}

/** Adapter animation ของผู้เล่น GLB; อ่าน snapshot เดิมและไม่แตะ combat timing */
export class GltfPlayerAnimator {
  readonly rigReady = true;
  private readonly clips: ClipPlayer;
  private previousOnGround = true;
  private lastHitReactionId = 0;
  private hitTimer = 0;
  private landingTimer = 0;

  constructor(root: THREE.Object3D, animations: readonly THREE.AnimationClip[]) {
    this.clips = new ClipPlayer(root, animations);
    this.clips.playLoop('idle');
  }

  update(dt: number, snapshot: PlayerActionSnapshot): void {
    const hitId = snapshot.hitReactionId ?? 0;
    if (hitId !== this.lastHitReactionId) {
      this.lastHitReactionId = hitId;
      this.hitTimer = 0.3;
      this.clips.playOnce('hit', `hit:${hitId}`, 0.3);
    }

    this.hitTimer = Math.max(0, this.hitTimer - dt);

    if (!this.previousOnGround && snapshot.onGround) this.landingTimer = 0.28;
    this.previousOnGround = snapshot.onGround;
    this.landingTimer = Math.max(0, this.landingTimer - dt);

    const state = snapshot.combatState;
    if (state === 'dead') {
      this.clips.playOnce('death', 'dead', 0.75);
    } else if (this.hitTimer > 0) {
      // ให้ hit reaction เล่นจบช่วงสั้น ๆ ก่อน locomotion เพื่อไม่ถูก idle ทับในเฟรมถัดไป
    } else if (isAttack(state)) {
      const semantic: ClipSemantic = snapshot.category === 'sword' ? 'sword' : 'punch';
      this.clips.playOnce(semantic, `${state}:${snapshot.category}`, attackDuration(snapshot));
      if (Number.isFinite(snapshot.attackProgress)) {
        this.clips.setNormalizedProgress(snapshot.attackProgress!);
      }
    } else if (state === 'casting') {
      const semantic: ClipSemantic = snapshot.skillAnimationCategory === 'sword'
        ? 'sword'
        : snapshot.skillAnimationCategory === 'style'
          ? 'punch'
          : 'wave';
      const key = `casting:${snapshot.skillAnimationType ?? 'skill'}:${snapshot.skillAnimationVariant ?? 0}`;
      this.clips.playOnce(semantic, key, 0.82);
      if (Number.isFinite(snapshot.skillAnimationProgress)) {
        this.clips.setNormalizedProgress(snapshot.skillAnimationProgress!);
      }
    } else if (state === 'blocking') {
      this.clips.playLoop('duck', 'blocking', 0.55);
    } else if (state === 'knockback' || state === 'knockdown' || state === 'stunned') {
      this.clips.playOnce('hit', state, 0.48);
    } else if (!snapshot.onGround) {
      if ((snapshot.verticalVelocity ?? 0) > 0.7) {
        this.clips.playOnce('jump', 'jump-rise', 0.34);
      } else {
        this.clips.playLoop('jump-idle', 'jump-air', 0.9);
      }
    } else if (this.landingTimer > 0) {
      this.clips.playOnce('jump-land', 'jump-land', 0.28);
    } else if (snapshot.dashing) {
      this.clips.playLoop('run', 'dash', 1.65, 0.05);
    } else {
      const semantic = locomotionClip(snapshot.locomotion);
      const speed = snapshot.locomotion === 'run' ? 1.12 : snapshot.locomotion === 'walk' ? 0.92 : 1;
      this.clips.playLoop(semantic, `locomotion:${snapshot.locomotion}`, speed);
    }

    this.clips.update(dt);
  }

  dispose(): void {
    this.clips.dispose();
  }
}

/** Adapter animation ของมอนสเตอร์ GLB; MonsterManager ยังเป็นเจ้าของ AI/hit timing เหมือนเดิม */
export class GltfMonsterAnimator {
  private readonly clips: ClipPlayer;
  private attackTimer = 0;
  private hitTimer = 0;
  private deathStarted = false;
  private actionNonce = 0;

  constructor(root: THREE.Object3D, animations: readonly THREE.AnimationClip[]) {
    this.clips = new ClipPlayer(root, animations);
    this.clips.playLoop('idle');
  }

  triggerAttack(heavy = false): void {
    this.attackTimer = heavy ? 0.62 : 0.4;
    this.actionNonce++;
    this.clips.playOnce('sword', `attack:${this.actionNonce}`, this.attackTimer);
  }

  triggerHit(): void {
    this.hitTimer = 0.26;
    this.actionNonce++;
    this.clips.playOnce('hit', `hit:${this.actionNonce}`, this.hitTimer);
  }

  update(dt: number, action: ProceduralLoopAction, deathProgress = 0): void {
    this.attackTimer = Math.max(0, this.attackTimer - dt);
    this.hitTimer = Math.max(0, this.hitTimer - dt);

    if (deathProgress > 0) {
      if (!this.deathStarted) {
        this.deathStarted = true;
        this.clips.playOnce('death', 'death', 0.7);
      }
    } else if (this.hitTimer > 0 || this.attackTimer > 0) {
      // one-shot ปัจจุบันเป็นผู้ควบคุม pose จน timer จบ
    } else if (action === 'run') {
      this.clips.playLoop('run', 'run', 1.08);
    } else if (action === 'walk') {
      this.clips.playLoop('walk', 'walk', 0.9);
    } else if (action === 'heavy') {
      this.clips.playLoop('duck', 'heavy-telegraph', 0.48);
    } else {
      this.clips.playLoop('idle');
    }
    this.clips.update(dt);
  }

  reset(): void {
    this.attackTimer = 0;
    this.hitTimer = 0;
    this.deathStarted = false;
    this.clips.reset();
  }

  dispose(): void {
    this.clips.dispose();
  }
}
