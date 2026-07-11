import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { CharacterController } from './CharacterController';

type AnimName = 'Idle' | 'Walk' | 'Run';

/** โมเดล Soldier.glb หันหน้าไปทาง -Z จึงต้องกลับด้าน 180 องศา */
const MODEL_YAW_OFFSET = Math.PI;

/**
 * ตัวละครผู้เล่น: โหลดโมเดล GLTF + เล่น animation ตามสถานะการเคลื่อนที่
 */
export class Player {
  readonly group = new THREE.Group();

  private mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<AnimName, THREE.AnimationAction>();
  private current: AnimName = 'Idle';

  constructor(private controller: CharacterController) {}

  async load(scene: THREE.Scene): Promise<void> {
    const gltf = await new GLTFLoader().loadAsync('assets/models/Soldier.glb');
    const model = gltf.scene;
    model.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = false;
      }
    });
    model.rotation.y = MODEL_YAW_OFFSET;
    this.group.add(model);
    scene.add(this.group);

    this.mixer = new THREE.AnimationMixer(model);
    for (const name of ['Idle', 'Walk', 'Run'] as const) {
      const clip = THREE.AnimationClip.findByName(gltf.animations, name);
      if (clip) {
        this.actions.set(name, this.mixer.clipAction(clip));
      }
    }
    this.actions.get('Idle')?.play();
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
    this.group.position.copy(position);
    this.group.rotation.y = heading;

    if (moveState.speed > 5) {
      this.setAnimation('Run');
    } else if (moveState.speed > 0.1) {
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
  }
}
