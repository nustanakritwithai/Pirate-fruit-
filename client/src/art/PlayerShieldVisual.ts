import * as THREE from 'three';

export function createPlayerShieldVisual(): THREE.Mesh {
  const shield = new THREE.Mesh(
    new THREE.SphereGeometry(1.25, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.62),
    new THREE.MeshBasicMaterial({ color: 0x8fd4ff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
  );
  shield.name = 'effect:player-shield';
  shield.position.y = 0.35;
  shield.visible = false;
  return shield;
}
