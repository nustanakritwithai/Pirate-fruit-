import * as THREE from 'three';
import type { GraphicsProfile } from '../engine/GraphicsQuality';
import type { WorldTextures } from '../world/textures';
import type { BoatDefinition } from './BoatData';

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
  const wood = new THREE.MeshStandardMaterial({
    map: textures.planksColor,
    normalMap: textures.planksNormal,
    color: definition.color,
    roughness: 0.83,
  });
  const darkWood = new THREE.MeshStandardMaterial({ color: 0x382317, roughness: 0.9 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x4b5155, metalness: 0.45, roughness: 0.55 });

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
      new THREE.MeshStandardMaterial({
        color: 0xe6d5ad,
        side: THREE.DoubleSide,
        roughness: 0.95,
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

  const lantern = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 7, 5),
    new THREE.MeshStandardMaterial({ color: 0xffc777, emissive: 0xff9f40, emissiveIntensity: 1.8 }),
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

  return { root, hull, wakeLeft, wakeRight };
}
