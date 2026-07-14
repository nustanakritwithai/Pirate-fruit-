import * as THREE from 'three';
import { THOUGHT_STATE_COLORS, MONSTER_CELLULAR_CONFIG } from './MonsterCellularConfig';
import type { MonsterThoughtState } from './MonsterCellularTypes';
import type { Monster } from '../Monster';

const MARKER_RADIUS = 0.35;

export class MonsterThoughtMarker {
  private readonly mesh: THREE.Mesh;
  private readonly markers = new Map<string, THREE.Mesh>();

  constructor(private scene: THREE.Scene) {
    const geo = new THREE.SphereGeometry(MARKER_RADIUS, 8, 8);
    this.mesh = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.85, depthTest: false }),
    );
  }

  setEnabled(enabled: boolean): void {
    for (const mesh of this.markers.values()) {
      mesh.visible = enabled;
    }
  }

  sync(monster: Monster, state: MonsterThoughtState): void {
    const id = monster.cellularId;
    if (!id) return;
    let marker = this.markers.get(id);
    if (!marker) {
      marker = this.mesh.clone() as THREE.Mesh;
      marker.renderOrder = 1000;
      this.scene.add(marker);
      this.markers.set(id, marker);
    }
    const mat = marker.material as THREE.MeshBasicMaterial;
    mat.color.setHex(THOUGHT_STATE_COLORS[state] ?? 0xffffff);
    marker.position.set(
      monster.group.position.x,
      monster.group.position.y + MONSTER_CELLULAR_CONFIG.debugMarkerHeight,
      monster.group.position.z,
    );
    marker.visible = true;
  }

  hide(id: string): void {
    const marker = this.markers.get(id);
    if (marker) marker.visible = false;
  }

  remove(id: string): void {
    const marker = this.markers.get(id);
    if (!marker) return;
    this.scene.remove(marker);
    marker.geometry.dispose();
    (marker.material as THREE.Material).dispose();
    this.markers.delete(id);
  }

  dispose(): void {
    for (const id of [...this.markers.keys()]) this.remove(id);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
