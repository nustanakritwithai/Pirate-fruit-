import * as THREE from 'three';

interface ActiveEffect {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
}

/**
 * เอฟเฟกต์ชั่วคราวในฉาก — ตอนนี้มีคลื่นฟันโจมตี (placeholder ก่อนถึง Phase 5 Combat)
 */
export class Effects {
  private active: ActiveEffect[] = [];
  private slashGeo = new THREE.RingGeometry(0.5, 1.5, 24, 1, 0, Math.PI * 0.85);

  constructor(private scene: THREE.Scene) {}

  /** คลื่นโค้งสีฟ้าหน้าตัวละคร ตอนกดปุ่มโจมตี */
  spawnSlash(position: THREE.Vector3, heading: number): void {
    const mat = new THREE.MeshBasicMaterial({
      color: 0x9fdcff,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(this.slashGeo, mat);
    mesh.position.copy(position);
    mesh.position.y += 1.15;
    mesh.position.x += Math.sin(heading) * 0.9;
    mesh.position.z += Math.cos(heading) * 0.9;
    // วางแนวนอน แล้วหมุนให้ส่วนโค้งชี้ไปทางที่ตัวละครหัน
    mesh.rotation.set(-Math.PI / 2, 0, 0);
    mesh.rotateZ(heading - Math.PI * 0.4);
    this.scene.add(mesh);
    this.active.push({ mesh, life: 0.22, maxLife: 0.22 });
  }

  update(dt: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const fx = this.active[i];
      fx.life -= dt;
      const t = Math.max(0, fx.life / fx.maxLife);
      (fx.mesh.material as THREE.MeshBasicMaterial).opacity = t * 0.9;
      const s = 0.7 + (1 - t) * 0.8;
      fx.mesh.scale.set(s, s, s);
      if (fx.life <= 0) {
        this.scene.remove(fx.mesh);
        (fx.mesh.material as THREE.Material).dispose();
        this.active.splice(i, 1);
      }
    }
  }
}
