import * as THREE from 'three';
import type { ActiveLoadoutItem } from '../progression/ProgressionTypes';
import { createMobileMaterial } from './MobilePBRMaterials';

/** visual equipment แยกจาก Combat/Loadout logic — อ่าน active item อย่างเดียว */
export class EquipmentVisuals {
  private readonly sword = new THREE.Group();
  private readonly wraps = new THREE.Group();
  private lastItemId = '';

  constructor(
    playerRoot: THREE.Group,
    private getActiveItem: () => ActiveLoadoutItem,
  ) {
    const steel = createMobileMaterial('iron', {
      color: 0xc7d0d4,
      metalness: 0.9,
      roughness: 0.24,
      envMapIntensity: 1.1,
    });
    const leather = createMobileMaterial('leather', { color: 0x4a2c1c, roughness: 0.64 });
    const brass = createMobileMaterial('paintedMetal', {
      color: 0xc59a47,
      metalness: 0.72,
      roughness: 0.36,
    });

    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.9, 0.035), steel);
    blade.position.y = 0.62;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.052, 0.22, 4), steel);
    tip.position.y = 1.18;
    tip.rotation.y = Math.PI / 4;
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.07, 0.09), brass);
    guard.position.y = 0.13;
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.32, 9), leather);
    grip.position.y = -0.06;
    const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), brass);
    pommel.position.y = -0.25;
    this.sword.add(blade, tip, guard, grip, pommel);
    this.sword.position.set(0.58, 1.0, 0.12);
    this.sword.rotation.set(0.08, 0.04, -0.16);

    const wrapMaterial = createMobileMaterial('cloth', { color: 0xa97448, roughness: 0.96 });
    for (const side of [-1, 1]) {
      const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.045, 6, 12), wrapMaterial);
      wrap.position.set(side * 0.62, 0.76, 0.04);
      wrap.rotation.x = Math.PI / 2;
      this.wraps.add(wrap);
    }

    for (const root of [this.sword, this.wraps]) {
      root.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.isMesh) mesh.castShadow = true;
      });
      playerRoot.add(root);
    }
    this.render();
  }

  update(): void {
    const item = this.getActiveItem();
    if (item.itemId === this.lastItemId) return;
    this.render();
  }

  private render(): void {
    const item = this.getActiveItem();
    this.lastItemId = item.itemId;
    this.sword.visible = item.category === 'sword';
    this.wraps.visible = item.category === 'style';
  }
}
