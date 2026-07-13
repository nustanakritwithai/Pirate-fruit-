import * as THREE from 'three';
import type { GraphicsProfile } from '../engine/GraphicsQuality';
import type { WorldTextures } from '../world/textures';
import type { BoatDefinition } from './BoatData';
import { createMobileMaterial } from '../art/MobilePBRMaterials';

export interface BoatModelResult {
  root: THREE.Group;
  hull: THREE.Mesh;
  wakeLeft: THREE.Mesh;
  wakeRight: THREE.Mesh;
}

function makeWakeMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: 0xd9ffff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

/** โมเดลเรือ procedural ใช้ geometry ขนาดเล็กและ material ร่วม เหมาะกับมือถือ */
export function createBoatModel(
  definition: BoatDefinition,
  textures: WorldTextures,
  graphics: GraphicsProfile,
): BoatModelResult {
  const root = new THREE.Group();
  root.name = `boat:${definition.id}`;
  const wood = createMobileMaterial('wood', {
    map: textures.planksColor,
    normalMap: textures.planksNormal,
    color: definition.color,
    roughness: 0.72,
    normalStrength: 0.58,
    envMapIntensity: 0.62,
  });
  const darkWood = createMobileMaterial('darkWood', { color: 0x382317, roughness: 0.78 });
  const metal = createMobileMaterial('iron', { color: 0x626a70, roughness: 0.38, metalness: 0.78 });
  const rope = createMobileMaterial('rope', { color: 0xa88b5d });

  const hull = new THREE.Mesh(
    new THREE.CapsuleGeometry(definition.width * 0.43, definition.length - definition.width, 3, 8),
    wood,
  );
  hull.rotation.x = Math.PI / 2;
  hull.scale.y = 0.68;
  hull.position.y = 0.02;
  hull.castShadow = graphics.shadows;
  hull.receiveShadow = graphics.shadows;
  root.add(hull);

  const sideBandGeometry = new THREE.BoxGeometry(0.13, 0.2, definition.length * 0.78);
  for (const side of [-1, 1]) {
    const band = new THREE.Mesh(sideBandGeometry, metal);
    band.position.set(side * definition.width * 0.43, 0.38, -0.02);
    root.add(band);
  }

  const prow = new THREE.Mesh(
    new THREE.ConeGeometry(definition.width * 0.32, 1.05, 10),
    wood,
  );
  prow.position.set(0, 0.32, definition.length * 0.48);
  prow.rotation.x = Math.PI / 2;
  root.add(prow);

  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(definition.width * 0.82, 0.16, definition.length * 0.62),
    darkWood,
  );
  deck.position.y = 0.55;
  deck.castShadow = graphics.shadows;
  root.add(deck);

  const railGeometry = new THREE.CylinderGeometry(0.055, 0.07, definition.length * 0.68, 5);
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(railGeometry, darkWood);
    rail.rotation.x = Math.PI / 2;
    rail.position.set(side * definition.width * 0.42, 0.92, -0.12);
    root.add(rail);
  }

  for (const z of [-1.05, 0.25, 1.25]) {
    if (Math.abs(z) > definition.length * 0.3) continue;
    const bench = new THREE.Mesh(new THREE.BoxGeometry(definition.width * 0.78, 0.14, 0.36), darkWood);
    bench.position.set(0, 0.79, z);
    root.add(bench);
  }

  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.055, 6, 12), darkWood);
  wheel.position.set(0, 1.4, -definition.length * 0.21);
  wheel.rotation.x = -0.22;
  root.add(wheel);

  if (definition.hasSail) {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 4.8, 7), darkWood);
    mast.position.set(0, 2.75, 0.35);
    const sail = new THREE.Mesh(
      new THREE.PlaneGeometry(2.7, 3.35),
      createMobileMaterial('cloth', {
        color: 0xe6d5ad,
        side: THREE.DoubleSide,
        roughness: 0.88,
        normalStrength: 0.3,
      }),
    );
    sail.position.set(0.05, 3.15, 0.42);
    sail.rotation.y = Math.PI / 2;
    sail.castShadow = graphics.shadows;
    root.add(mast, sail);
  } else {
    const oarGeometry = new THREE.CylinderGeometry(0.045, 0.055, 3.2, 5);
    for (const side of [-1, 1]) {
      const oar = new THREE.Mesh(oarGeometry, darkWood);
      oar.position.set(side * 1.1, 0.82, 0.25);
      oar.rotation.z = side * 1.08;
      oar.rotation.x = 0.18;
      root.add(oar);
    }
  }

  const ropeRailGeometry = new THREE.CylinderGeometry(0.035, 0.04, definition.length * 0.64, 6);
  for (const side of [-1, 1]) {
    const ropeRail = new THREE.Mesh(ropeRailGeometry, rope);
    ropeRail.rotation.x = Math.PI / 2;
    ropeRail.position.set(side * definition.width * 0.43, 1.05, -0.12);
    root.add(ropeRail);
  }

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.3, 0.65, 12), darkWood);
  barrel.position.set(definition.width * 0.23, 1.02, -definition.length * 0.12);
  const barrelBand = new THREE.Mesh(new THREE.TorusGeometry(0.285, 0.025, 6, 14), metal);
  barrelBand.rotation.x = Math.PI / 2;
  barrelBand.position.copy(barrel.position);
  root.add(barrel, barrelBand);

  const lantern = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 7, 5),
    createMobileMaterial('shell', {
      color: 0xffc777,
      emissive: 0xff9f40,
      emissiveIntensity: 1.8,
      roughness: 0.24,
    }),
  );
  lantern.position.set(0, 1.15, definition.length * 0.38);
  root.add(lantern);

  const wakeGeometry = new THREE.PlaneGeometry(0.85, 3.8);
  wakeGeometry.rotateX(-Math.PI / 2);
  const wakeLeft = new THREE.Mesh(wakeGeometry, makeWakeMaterial());
  const wakeRight = new THREE.Mesh(wakeGeometry, makeWakeMaterial());
  wakeLeft.position.set(-definition.width * 0.38, -0.34, -definition.length * 0.55);
  wakeRight.position.set(definition.width * 0.38, -0.34, -definition.length * 0.55);
  root.add(wakeLeft, wakeRight);

  const bumper = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.08, 6, 10), metal);
  bumper.position.set(0, 0.35, definition.length * 0.51);
  bumper.rotation.x = Math.PI / 2;
  root.add(bumper);

  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || mesh === wakeLeft || mesh === wakeRight) return;
    mesh.castShadow = graphics.shadows;
    mesh.receiveShadow = graphics.tier === 'high';
    mesh.frustumCulled = true;
  });

  return { root, hull, wakeLeft, wakeRight };
}
