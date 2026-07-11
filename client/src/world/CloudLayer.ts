import * as THREE from 'three';
import type { GraphicsProfile } from '../engine/GraphicsQuality';
import { mulberry32 } from './props';

function makeCloudTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const circles = [
    [58, 78, 35],
    [96, 58, 48],
    [142, 70, 43],
    [182, 82, 30],
    [117, 88, 46],
  ];
  for (const [x, y, radius] of circles) {
    const gradient = ctx.createRadialGradient(x, y, 2, x, y, radius);
    gradient.addColorStop(0, 'rgba(255,255,255,.86)');
    gradient.addColorStop(0.65, 'rgba(245,250,255,.62)');
    gradient.addColorStop(1, 'rgba(240,248,255,0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** เมฆรวมเป็น InstancedMesh หนึ่ง draw call */
export class CloudLayer {
  readonly mesh: THREE.InstancedMesh;

  constructor(graphics: GraphicsProfile) {
    const material = new THREE.MeshBasicMaterial({
      map: makeCloudTexture(),
      transparent: true,
      opacity: graphics.tier === 'low' ? 0.42 : 0.55,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    const geometry = new THREE.PlaneGeometry(34, 16);
    geometry.rotateX(-Math.PI / 2);
    this.mesh = new THREE.InstancedMesh(geometry, material, graphics.cloudCount);
    this.mesh.frustumCulled = true;

    const random = mulberry32(24680);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < graphics.cloudCount; i++) {
      const angle = (i / graphics.cloudCount) * Math.PI * 2 + random() * 0.5;
      const distance = 50 + random() * 135;
      dummy.position.set(Math.cos(angle) * distance, 48 + random() * 22, Math.sin(angle) * distance);
      dummy.rotation.y = random() * Math.PI;
      const scale = 0.7 + random() * 1.15;
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();
      this.mesh.setMatrixAt(i, dummy.matrix);
    }
  }

  update(dt: number): void {
    this.mesh.rotation.y += dt * 0.0022;
  }
}
