import * as THREE from 'three';
import type { MonsterCellularWorld } from '../../monster/cellular/MonsterCellularWorld';
import type { DevilFruitInfluenceWorld } from '../../devilfruit/influence/DevilFruitInfluenceWorld';
import { INFLUENCE_RING_COLORS } from './HeatmapModes';

const MAX_RINGS = 120;

interface RingEntry {
  mesh: THREE.Mesh;
  life: number;
}

/** Colored influence rings in the world — attack=red, alert=yellow, flee=blue, fire=orange, smoke=purple */
export class InfluenceVisualizer {
  private readonly group = new THREE.Group();
  private readonly pool: RingEntry[] = [];
  private enabled = false;

  constructor(
    scene: THREE.Scene,
    private cellularWorld: MonsterCellularWorld,
    private influenceWorld: DevilFruitInfluenceWorld,
  ) {
    this.group.name = 'sim-influence-visualizer';
    scene.add(this.group);
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.group.visible = on;
    if (!on) this.clear();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  update(dt: number): void {
    if (!this.enabled) return;

    for (let i = this.pool.length - 1; i >= 0; i--) {
      const entry = this.pool[i]!;
      entry.life -= dt;
      const fade = Math.max(0, entry.life / 1.2);
      const mat = entry.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = fade * 0.55;
      entry.mesh.scale.setScalar(1 + (1 - fade) * 0.35);
      if (entry.life <= 0) {
        this.group.remove(entry.mesh);
        entry.mesh.geometry.dispose();
        mat.dispose();
        this.pool.splice(i, 1);
      }
    }

    if (this.pool.length >= MAX_RINGS) return;

    for (const cell of this.cellularWorld.getAllCells()) {
      if (cell.currentState === 'dead') continue;
      const snap = this.cellularWorld.snapshots.get(cell.id);
      if (!snap) continue;

      if (snap.attackInfluence > 0.8) {
        this.spawnRing(cell.position.x, cell.position.z, snap.attackInfluence, INFLUENCE_RING_COLORS.attack);
      } else if (snap.alertInfluence > 0.8) {
        this.spawnRing(cell.position.x, cell.position.z, snap.alertInfluence, INFLUENCE_RING_COLORS.alert);
      } else if (snap.fleeInfluence > 0.8) {
        this.spawnRing(cell.position.x, cell.position.z, snap.fleeInfluence, INFLUENCE_RING_COLORS.flee);
      }
    }

    const sampleStep = 4;
    for (let gx = -24; gx <= 24; gx += sampleStep) {
      for (let gz = -16; gz <= 16; gz += sampleStep) {
        if (this.pool.length >= MAX_RINGS) break;
        const s = this.influenceWorld.sampleAt(gx, gz);
        if (s.fire > 0.35) {
          this.spawnRing(gx, gz, s.fire, INFLUENCE_RING_COLORS.fire, 3.5);
        } else if (s.smoke > 0.35) {
          this.spawnRing(gx, gz, s.smoke, INFLUENCE_RING_COLORS.smoke, 3.5);
        }
      }
    }
  }

  clear(): void {
    for (const entry of this.pool) {
      this.group.remove(entry.mesh);
      entry.mesh.geometry.dispose();
      (entry.mesh.material as THREE.Material).dispose();
    }
    this.pool.length = 0;
  }

  dispose(): void {
    this.clear();
    this.group.parent?.remove(this.group);
  }

  private spawnRing(x: number, z: number, strength: number, color: string, baseRadius = 2): void {
    if (this.pool.length >= MAX_RINGS) return;
    const radius = baseRadius + strength * 2.5;
    const geo = new THREE.RingGeometry(radius * 0.65, radius, 24);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.35, z);
    this.group.add(mesh);
    this.pool.push({ mesh, life: 1.2 });
  }
}
