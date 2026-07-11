import * as THREE from 'three';
import type { GraphicsProfile } from '../engine/GraphicsQuality';
import type { WorldTextures } from '../world/textures';
import type { BoatDefinition } from './BoatData';
import { createBoatModel } from './BoatModel';

export type BoatState = 'spawned' | 'piloted' | 'docked' | 'destroyed';

export class Boat {
  readonly group: THREE.Group;
  readonly hull: THREE.Mesh;
  readonly wakeLeft: THREE.Mesh;
  readonly wakeRight: THREE.Mesh;
  state: BoatState = 'spawned';
  speed = 0;
  heading = Math.PI;
  hp: number;
  anchor = false;
  boostTimer = 0;
  boostCooldown = 0;
  collisionCooldown = 0;
  destroyCooldown = 0;

  constructor(
    readonly definition: BoatDefinition,
    textures: WorldTextures,
    graphics: GraphicsProfile,
  ) {
    const model = createBoatModel(definition, textures, graphics);
    this.group = model.root;
    this.hull = model.hull;
    this.wakeLeft = model.wakeLeft;
    this.wakeRight = model.wakeRight;
    this.hp = definition.maxHp;
  }

  get hpFraction(): number {
    return Math.max(0, this.hp / this.definition.maxHp);
  }

  get boostCooldownFraction(): number {
    return Math.max(0, this.boostCooldown / 4);
  }

  damage(amount: number): void {
    if (this.state === 'destroyed') return;
    this.hp = Math.max(0, this.hp - amount);
    const material = this.hull.material as THREE.MeshStandardMaterial;
    material.emissive.setHex(0x7a160d);
    material.emissiveIntensity = 1.5;
  }

  updateDamageVisual(dt: number): void {
    const material = this.hull.material as THREE.MeshStandardMaterial;
    material.emissiveIntensity = Math.max(0, material.emissiveIntensity - dt * 4);
  }

  dispose(): void {
    this.group.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) material.dispose();
    });
  }
}
