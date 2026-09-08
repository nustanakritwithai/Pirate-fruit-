import { assertAssetHandle } from '../handle-contract.mjs';
import { registerOwned, disposeHandle } from '../ownership.mjs';
import { applyMonsterFourSide } from '../monster-texture.mjs';

export const SLIME_TYPES = Object.freeze([
  'Normal', 'Fire', 'Water', 'Electric', 'Grass', 'Ice', 'Fighting', 'Poison',
  'Ground', 'Flying', 'Psychic', 'Bug', 'Rock', 'Ghost', 'Dragon', 'Dark', 'Steel', 'Fairy',
]);

export const ANIMAL_FORMS = Object.freeze([
  'plainpup', 'flameling', 'aquapuff', 'voltkit', 'mossbun', 'frostowl',
  'punchcub', 'toxitoad', 'sandmole', 'galebird', 'mindcoon', 'buglet',
  'rockhorn', 'ghostpurr', 'emberdrake', 'voidhorn', 'ironbug', 'fairimp',
  'flame_wolf', 'magma_bear',
]);

export const BIGHEAD_SLIME_BODY = Object.freeze({ w: 0.92, h: 0.84, d: 0.80, y: 0.48 });
export const MONSTER_ANCHOR_Y = Object.freeze({
  hitText: 1.35,
  label: 2.15,
  bossLabel: 2.55,
  impact: 0.80,
});

const TYPE_ACCENT = Object.freeze({
  Normal: 0x8a8a78, Fire: 0xef6c32, Water: 0x4f87e8, Electric: 0xe8bd22, Grass: 0x63b34b,
  Ice: 0x79c9c9, Fighting: 0xb9342c, Poison: 0x93489e, Ground: 0xcba94e, Flying: 0x8d7cdb,
  Psychic: 0xec4d7f, Bug: 0x9cab25, Rock: 0xa48e38, Ghost: 0x61568f, Dragon: 0x6a45d3,
  Dark: 0x584b43, Steel: 0x8e8eaa, Fairy: 0xdc87b8,
});

function animalKind(def) {
  const raw = def?.metrics?.kind || def?.metrics?.silhouette || 'quadruped';
  if (raw === 'bird' || raw === 'serpent') return raw;
  return 'quadruped';
}

function tag(node, part, extra = {}) {
  node.userData.part = part;
  Object.assign(node.userData, extra);
  return node;
}

export function createBigheadMonsterProvider({
  THREE,
  box,
  cone,
  torus,
  material,
  basicMaterial,
} = {}) {
  if (!THREE?.Group || typeof box !== 'function' || typeof material !== 'function') {
    throw new Error('bighead monster provider needs THREE, box(), and material()');
  }
  const makeCone = typeof cone === 'function'
    ? cone
    : (r, h) => box(r * 2, h, r * 2);
  const makeTorus = typeof torus === 'function'
    ? torus
    : (r, t) => box(r * 2, t * 2, r * 2);
  const makeBasic = typeof basicMaterial === 'function'
    ? basicMaterial
    : (color) => material(color, 1, 0);

  function mat(color, rough = 0.72, metal = 0.06) {
    return material(color, rough, metal);
  }

  function boxMesh(w, h, d, color, rough, metal, part, extra) {
    const mesh = new THREE.Mesh(box(w, h, d), mat(color, rough, metal));
    mesh.castShadow = true;
    return tag(mesh, part, extra);
  }

  function paintBody(mesh, type, color, rough, metal, { facial = true } = {}) {
    applyMonsterFourSide(mesh, type, color, THREE, { roughness: rough, metalness: metal, facial });
    return mesh;
  }

  function coneMesh(r, h, color, rough, metal, part, extra) {
    const mesh = new THREE.Mesh(makeCone(r, h, 4), mat(color, rough, metal));
    mesh.castShadow = true;
    return tag(mesh, part, extra);
  }

  function addBoxEyes(g, { y, z, spread, size }) {
    for (const sx of [-spread, spread]) {
      const eye = new THREE.Mesh(box(size, size, size * 0.5), makeBasic(0x111827));
      eye.position.set(sx, y, z);
      eye.castShadow = true;
      g.add(tag(eye, 'eye'));
    }
  }

  function addBoxMouth(g, { y, z, w = 0.20, h = 0.04 }) {
    const mouth = new THREE.Mesh(box(w, h, 0.02), makeBasic(0x1f2937));
    mouth.position.set(0, y, z);
    g.add(tag(mouth, 'mouth'));
  }

  function addDecoration(g, mesh, type) {
    tag(mesh, 'decoration', { decoType: type });
    mesh.castShadow = true;
    g.add(mesh);
    return mesh;
  }

  function addBigheadSlimeDecoration(g, type, scale) {
    switch (type) {
      case 'Normal':
        for (const sx of [-0.40, 0.40]) {
          const ear = boxMesh(0.08 * scale, 0.15 * scale, 0.04 * scale, 0xd6c4a5, 0.7, 0, 'decoration', { decoType: type });
          ear.position.set(sx * scale, 0.85 * scale, -0.01 * scale);
          g.add(ear);
        }
        break;
      case 'Fire':
        for (const [x, r, h] of [[-0.15, 0.06, 0.18], [0, 0.07, 0.22], [0.15, 0.06, 0.18]]) {
          const flame = coneMesh(r * scale, h * scale, 0xff7a2f, 0.3, 0.1, 'decoration', { decoType: type });
          flame.position.set(x * scale, 1.10 * scale, -0.02 * scale);
          g.add(flame);
        }
        break;
      case 'Water':
        for (const sx of [-0.40, 0.40]) {
          const fin = boxMesh(0.04 * scale, 0.20 * scale, 0.30 * scale, 0x8ed8ff, 0.4, 0, 'decoration', { decoType: type });
          fin.position.set(sx * scale, 0.62 * scale, 0.10 * scale);
          g.add(fin);
        }
        break;
      case 'Electric':
        for (const sx of [-0.25, 0.25]) {
          const bolt = boxMesh(0.06 * scale, 0.20 * scale, 0.04 * scale, 0xffef66, 0.4, 0.1, 'decoration', { decoType: type });
          bolt.position.set(sx * scale, 1.05 * scale, -0.02 * scale);
          bolt.rotation.z = sx > 0 ? 0.8 : -0.8;
          g.add(bolt);
        }
        break;
      case 'Grass': {
        const leaf = coneMesh(0.08 * scale, 0.20 * scale, 0x7bdc63, 0.5, 0, 'decoration', { decoType: type });
        leaf.position.set(0, 1.10 * scale, -0.02 * scale);
        g.add(leaf);
        break;
      }
      case 'Ice':
        for (const [x, h] of [[-0.10, 0.14], [0, 0.18], [0.10, 0.14]]) {
          const crystal = coneMesh(0.05 * scale, h * scale, 0xdafdff, 0.08, 0, 'decoration', { decoType: type });
          crystal.position.set(x * scale, 1.08 * scale, -0.02 * scale);
          g.add(crystal);
        }
        {
          const slab = boxMesh(0.22 * scale, 0.05 * scale, 0.16 * scale, 0xbfefff, 0.12, 0, 'decoration', { decoType: type });
          slab.position.set(0, 0.94 * scale, -0.04 * scale);
          g.add(slab);
        }
        break;
      case 'Fighting':
        for (const sx of [-0.42, 0.42]) {
          const fist = boxMesh(0.08 * scale, 0.08 * scale, 0.08 * scale, 0xd84c43, 0.6, 0, 'decoration', { decoType: type });
          fist.position.set(sx * scale, 0.52 * scale, -0.25 * scale);
          g.add(fist);
        }
        break;
      case 'Poison':
        for (const [x, y, z, s] of [[-0.20, 0.84, -0.05, 0.08], [0.18, 0.98, -0.02, 0.10], [0.03, 1.10, -0.06, 0.06]]) {
          const orb = boxMesh(s * scale, s * scale, s * scale, 0xd68dff, 0.35, 0, 'decoration', { decoType: type });
          orb.position.set(x * scale, y * scale, z * scale);
          g.add(orb);
        }
        break;
      case 'Ground': {
        const plate = boxMesh(0.18 * scale, 0.08 * scale, 0.12 * scale, 0x8b6a37, 0.8, 0, 'decoration', { decoType: type });
        plate.position.set(0, 0.93 * scale, -0.03 * scale);
        g.add(plate);
        for (const sx of [-0.10, 0.10]) {
          const ear = coneMesh(0.05 * scale, 0.12 * scale, 0xe6d089, 0.6, 0, 'decoration', { decoType: type });
          ear.position.set(sx * scale, 1.02 * scale, -0.03 * scale);
          g.add(ear);
        }
        break;
      }
      case 'Flying':
        for (const sx of [-0.50, 0.50]) {
          const wing = boxMesh(0.08 * scale, 0.35 * scale, 0.45 * scale, 0xd4cbff, 0.5, 0, 'decoration', { decoType: type });
          wing.position.set(sx * scale, 0.70 * scale, 0.05 * scale);
          g.add(wing);
        }
        break;
      case 'Psychic': {
        const ring = new THREE.Mesh(makeTorus(0.13 * scale, 0.015 * scale, 8, 16), mat(0xff9ac8, 0.4, 0));
        ring.position.set(0, 1.03 * scale, -0.01 * scale);
        ring.rotation.x = Math.PI / 2;
        addDecoration(g, ring, type);
        const gem = boxMesh(0.08 * scale, 0.08 * scale, 0.08 * scale, 0xffc7de, 0.35, 0, 'decoration', { decoType: type });
        gem.position.set(0, 1.16 * scale, -0.03 * scale);
        g.add(gem);
        break;
      }
      case 'Bug':
        for (const sx of [-0.10, 0.10]) {
          const horn = coneMesh(0.04 * scale, 0.16 * scale, 0xa9ca3b, 0.5, 0, 'decoration', { decoType: type });
          horn.position.set(sx * scale, 1.04 * scale, -0.02 * scale);
          horn.rotation.z = sx > 0 ? -0.25 : 0.25;
          g.add(horn);
        }
        {
          const plate = boxMesh(0.20 * scale, 0.05 * scale, 0.04 * scale, 0x6f8f1e, 0.7, 0, 'decoration', { decoType: type });
          plate.position.set(0, 0.74 * scale, 0.20 * scale);
          g.add(plate);
        }
        break;
      case 'Rock':
        for (const [x, y, s] of [[-0.14, 0.94, 0.10], [0, 1.06, 0.12], [0.13, 0.96, 0.09]]) {
          const rock = boxMesh(s * scale, s * scale, s * scale, 0xc9b574, 0.85, 0.02, 'decoration', { decoType: type });
          rock.position.set(x * scale, y * scale, -0.02 * scale);
          g.add(rock);
        }
        break;
      case 'Ghost': {
        for (const [x, y, z, s] of [[-0.16, 0.90, -0.06, 0.09], [0.14, 1.02, -0.04, 0.08]]) {
          const orb = boxMesh(s * scale, s * scale, s * scale, 0xcabfff, 0.3, 0, 'decoration', { decoType: type });
          orb.position.set(x * scale, y * scale, z * scale);
          g.add(orb);
        }
        const ring = new THREE.Mesh(makeTorus(0.10 * scale, 0.012 * scale, 8, 16), mat(0xa89cf0, 0.35, 0));
        ring.position.set(0, 0.38 * scale, -0.14 * scale);
        addDecoration(g, ring, type);
        break;
      }
      case 'Dragon':
        for (const sx of [-0.18, 0.18]) {
          const horn = coneMesh(0.06 * scale, 0.22 * scale, 0xa78bfa, 0.4, 0.15, 'decoration', { decoType: type });
          horn.position.set(sx * scale, 1.15 * scale, -0.02 * scale);
          horn.rotation.x = -0.2;
          g.add(horn);
        }
        break;
      case 'Dark':
        for (const sx of [-0.40, 0.40]) {
          const ear = boxMesh(0.08 * scale, 0.16 * scale, 0.04 * scale, 0x3a312c, 0.7, 0, 'decoration', { decoType: type });
          ear.position.set(sx * scale, 0.85 * scale, -0.01 * scale);
          g.add(ear);
        }
        {
          const plate = boxMesh(0.18 * scale, 0.04 * scale, 0.03 * scale, 0x3d3330, 0.8, 0, 'decoration', { decoType: type });
          plate.position.set(0, 0.71 * scale, -0.22 * scale);
          g.add(plate);
        }
        break;
      case 'Steel': {
        const mask = boxMesh(0.22 * scale, 0.08 * scale, 0.06 * scale, 0xc9cfdf, 0.45, 0.2, 'decoration', { decoType: type });
        mask.position.set(0, 0.94 * scale, -0.04 * scale);
        g.add(mask);
        for (const sx of [-0.07, 0.07]) {
          const rivet = boxMesh(0.04 * scale, 0.04 * scale, 0.04 * scale, 0xe7edf8, 0.4, 0.25, 'decoration', { decoType: type });
          rivet.position.set(sx * scale, 0.94 * scale, -0.09 * scale);
          g.add(rivet);
        }
        break;
      }
      case 'Fairy':
        for (const sx of [-0.48, 0.48]) {
          const wing = boxMesh(0.06 * scale, 0.28 * scale, 0.35 * scale, 0xffc4e8, 0.4, 0, 'decoration', { decoType: type });
          wing.position.set(sx * scale, 0.72 * scale, 0.05 * scale);
          g.add(wing);
        }
        {
          const gem = coneMesh(0.05 * scale, 0.14 * scale, 0xffe0f2, 0.3, 0, 'decoration', { decoType: type });
          gem.position.set(0, 1.14 * scale, -0.02 * scale);
          g.add(gem);
        }
        break;
      default:
        break;
    }
  }

  function addFormBox(g, part, w, h, d, color, x, y, z, scale, extra = {}) {
    const mesh = boxMesh(w * scale, h * scale, d * scale, color, extra.rough ?? 0.68, extra.metal ?? 0, part, { formDecoration: true });
    mesh.position.set(x * scale, y * scale, z * scale);
    if (extra.rx) mesh.rotation.x = extra.rx;
    if (extra.ry) mesh.rotation.y = extra.ry;
    if (extra.rz) mesh.rotation.z = extra.rz;
    g.add(mesh);
    return mesh;
  }

  function addFormCone(g, part, r, h, color, x, y, z, scale, extra = {}) {
    const mesh = coneMesh(r * scale, h * scale, color, extra.rough ?? 0.5, extra.metal ?? 0, part, { formDecoration: true });
    mesh.position.set(x * scale, y * scale, z * scale);
    if (extra.rx) mesh.rotation.x = extra.rx;
    if (extra.rz) mesh.rotation.z = extra.rz;
    g.add(mesh);
    return mesh;
  }

  function addEarPair(g, color, scale, { y = 1.16, z = -0.18, h = 0.20, w = 0.10, d = 0.06, tilt = 0.22, cone = false } = {}) {
    for (const sx of [-1, 1]) {
      if (cone) addFormCone(g, 'ear', w * 0.55, h, color, sx * 0.18, y, z, scale, { rz: sx * tilt });
      else addFormBox(g, 'ear', w, h, d, color, sx * 0.18, y, z, scale, { rz: sx * tilt });
    }
  }

  function addBigheadAnimalDecoration(g, form, scale, color) {
    switch (form) {
      case 'plainpup':
        addEarPair(g, 0xbfa58f, scale, { y: 1.16, z: -0.18, h: 0.22, w: 0.12 });
        addFormBox(g, 'muzzle', 0.18, 0.12, 0.16, 0xf8efe4, 0, 0.82, -0.52, scale);
        addFormBox(g, 'tail', 0.08, 0.08, 0.22, 0xbfa58f, 0, 0.62, 0.48, scale, { rx: -0.4 });
        break;
      case 'flameling':
        addEarPair(g, 0xea580c, scale, { y: 1.18, z: -0.20, h: 0.24, w: 0.10, cone: true, tilt: 0.28 });
        addFormBox(g, 'muzzle', 0.18, 0.12, 0.16, 0xffd6a5, 0, 0.82, -0.52, scale);
        addFormBox(g, 'tail', 0.10, 0.10, 0.36, 0x7c2d12, 0, 0.62, 0.50, scale, { rx: -0.35 });
        addFormCone(g, 'tail', 0.07, 0.16, 0xffc857, 0, 0.70, 0.68, scale, { rx: 0.8 });
        addFormBox(g, 'cheek', 0.08, 0.08, 0.06, 0xf5a15f, -0.22, 0.82, -0.38, scale);
        addFormBox(g, 'cheek', 0.08, 0.08, 0.06, 0xf5a15f, 0.22, 0.82, -0.38, scale);
        break;
      case 'aquapuff':
        addFormBox(g, 'muzzle', 0.18, 0.11, 0.16, 0xdff4ff, 0, 0.80, -0.54, scale);
        addFormBox(g, 'fin', 0.05, 0.18, 0.28, 0x7dd3fc, -0.34, 0.70, 0.10, scale);
        addFormBox(g, 'fin', 0.05, 0.18, 0.28, 0x7dd3fc, 0.34, 0.70, 0.10, scale);
        addFormBox(g, 'tail', 0.08, 0.08, 0.28, 0x60a5fa, 0, 0.60, 0.50, scale, { rx: -0.4 });
        break;
      case 'voltkit':
        addEarPair(g, 0xca8a04, scale, { y: 1.18, z: -0.16, h: 0.22, w: 0.12, tilt: 0.24 });
        addFormBox(g, 'muzzle', 0.17, 0.12, 0.15, 0xfff7c2, 0, 0.82, -0.52, scale);
        addFormBox(g, 'whisker', 0.16, 0.02, 0.02, 0x8a6a00, -0.22, 0.84, -0.50, scale, { rz: 0.2 });
        addFormBox(g, 'whisker', 0.16, 0.02, 0.02, 0x8a6a00, 0.22, 0.84, -0.50, scale, { rz: -0.2 });
        addFormBox(g, 'whisker', 0.14, 0.02, 0.02, 0x8a6a00, -0.22, 0.78, -0.50, scale, { rz: -0.15 });
        addFormBox(g, 'whisker', 0.14, 0.02, 0.02, 0x8a6a00, 0.22, 0.78, -0.50, scale, { rz: 0.15 });
        addFormBox(g, 'tail', 0.08, 0.22, 0.05, 0xffe45c, 0, 0.62, 0.46, scale, { rx: -1.0, rough: 0.4, metal: 0.1 });
        addFormBox(g, 'tail', 0.08, 0.16, 0.05, 0xffe45c, 0.10, 0.74, 0.46, scale, { rz: 0.7, rough: 0.4, metal: 0.1 });
        addFormBox(g, 'tail', 0.08, 0.14, 0.05, 0xffe45c, -0.02, 0.84, 0.46, scale, { rz: -0.7, rough: 0.4, metal: 0.1 });
        break;
      case 'mossbun':
        addEarPair(g, 0x2f9e44, scale, { y: 1.28, z: -0.10, h: 0.36, w: 0.10, cone: true, tilt: 0.12 });
        addFormBox(g, 'muzzle', 0.16, 0.11, 0.13, 0xf1f5f9, 0, 0.82, -0.52, scale);
        addFormCone(g, 'leaf', 0.12, 0.28, 0x3aa64a, 0, 1.32, 0.08, scale, { rz: 0.08 });
        addFormBox(g, 'tail', 0.10, 0.10, 0.16, 0xffffff, 0, 0.64, 0.46, scale, { rx: -0.4 });
        break;
      case 'frostowl':
        addEarPair(g, 0xdbeafe, scale, { y: 1.34, z: 0.02, h: 0.16, w: 0.10, cone: true, tilt: 0.25 });
        break;
      case 'punchcub':
        addEarPair(g, 0x8b2b23, scale, { y: 1.14, z: -0.16, h: 0.16, w: 0.10, tilt: 0.2 });
        addFormBox(g, 'muzzle', 0.18, 0.12, 0.16, 0xffd9c8, 0, 0.82, -0.52, scale);
        addFormBox(g, 'paw', 0.14, 0.10, 0.14, 0xffd6bf, -0.26, 0.42, -0.16, scale);
        addFormBox(g, 'paw', 0.14, 0.10, 0.14, 0xffd6bf, 0.26, 0.42, -0.16, scale);
        break;
      case 'toxitoad':
        addFormBox(g, 'muzzle', 0.22, 0.10, 0.16, 0xf3d8ff, 0, 0.78, -0.54, scale);
        for (const [x, z] of [[-0.24, 0.24], [0.24, 0.24], [-0.24, 0.02], [0.24, 0.02]]) {
          addFormBox(g, 'paw', 0.14, 0.08, 0.14, color, x, 0.12, z, scale);
        }
        g.scale.set(1.08, 0.92, 1.08);
        break;
      case 'sandmole':
        addFormBox(g, 'muzzle', 0.22, 0.11, 0.18, 0xeed8b0, 0, 0.78, -0.54, scale);
        addFormBox(g, 'paw', 0.14, 0.08, 0.14, 0xf1dfc1, -0.24, 0.14, -0.18, scale);
        addFormBox(g, 'paw', 0.14, 0.08, 0.14, 0xf1dfc1, 0.24, 0.14, -0.18, scale);
        break;
      case 'galebird':
        addFormCone(g, 'crest', 0.06, 0.18, 0xc4b5fd, 0, 1.36, -0.08, scale);
        break;
      case 'mindcoon':
        addEarPair(g, 0xd946ef, scale, { y: 1.18, z: -0.18, h: 0.22, w: 0.11, tilt: 0.24 });
        addFormBox(g, 'muzzle', 0.17, 0.12, 0.15, 0xffe5ef, 0, 0.82, -0.52, scale);
        addFormBox(g, 'gem', 0.10, 0.10, 0.10, 0xf9a8d4, 0, 1.22, -0.08, scale, { rough: 0.3 });
        break;
      case 'buglet':
        addEarPair(g, 0x4b5563, scale, { y: 1.10, z: -0.20, h: 0.16, w: 0.05, d: 0.05, tilt: 0 });
        addFormBox(g, 'shell', 0.50, 0.14, 0.42, 0x7f8f19, 0, 0.78, 0.10, scale, { rx: 0.18, rough: 0.8 });
        addFormCone(g, 'horn', 0.05, 0.18, 0xc7d84a, 0, 1.02, -0.52, scale, { rx: -0.9 });
        break;
      case 'rockhorn':
        addFormCone(g, 'horn', 0.07, 0.26, 0xf0dfb0, -0.16, 1.18, -0.28, scale, { rz: 0.35, rx: -0.25 });
        addFormCone(g, 'horn', 0.07, 0.26, 0xf0dfb0, 0.16, 1.18, -0.28, scale, { rz: -0.35, rx: -0.25 });
        addFormBox(g, 'muzzle', 0.18, 0.12, 0.16, 0xe6d3a0, 0, 0.82, -0.52, scale);
        addFormCone(g, 'spike', 0.06, 0.16, 0x8f7c30, -0.08, 0.92, 0.18, scale);
        addFormCone(g, 'spike', 0.06, 0.16, 0x8f7c30, 0.08, 0.92, 0.30, scale);
        g.scale.set(1.12, 0.99, 1.16);
        break;
      case 'ghostpurr':
        addEarPair(g, 0x7c67bf, scale, { y: 0.98, z: -0.52, h: 0.20, w: 0.10, tilt: 0.26 });
        addFormBox(g, 'muzzle', 0.16, 0.11, 0.14, 0xf0e6ff, 0, 0.66, -0.62, scale);
        addFormBox(g, 'tail', 0.08, 0.08, 0.34, 0x8b7ad3, 0, 0.52, 0.42, scale, { rx: -0.3 });
        addFormCone(g, 'tail', 0.05, 0.12, 0xf3e8ff, 0, 0.58, 0.58, scale, { rx: 0.9 });
        break;
      case 'emberdrake':
        addEarPair(g, 0xea580c, scale, { y: 1.16, z: -0.16, h: 0.16, w: 0.08, tilt: 0.18 });
        addFormBox(g, 'muzzle', 0.17, 0.11, 0.14, 0xfec89a, 0, 0.82, -0.52, scale);
        addFormCone(g, 'horn', 0.06, 0.22, 0xfef3c7, -0.12, 1.20, -0.18, scale, { rz: 0.22 });
        addFormCone(g, 'horn', 0.06, 0.22, 0xfef3c7, 0.12, 1.20, -0.18, scale, { rz: -0.22 });
        addFormBox(g, 'wing', 0.08, 0.36, 0.50, 0xfb923c, -0.46, 0.90, 0.10, scale);
        addFormBox(g, 'wing', 0.08, 0.36, 0.50, 0xfb923c, 0.46, 0.90, 0.10, scale);
        addFormBox(g, 'tail', 0.10, 0.10, 0.42, 0x7c2d12, 0, 0.64, 0.50, scale, { rx: -0.35 });
        break;
      case 'voidhorn':
        addFormCone(g, 'horn', 0.07, 0.34, 0xe7d9b5, -0.16, 1.14, -0.36, scale, { rz: 0.45, rx: -0.3 });
        addFormCone(g, 'horn', 0.07, 0.34, 0xe7d9b5, 0.16, 1.14, -0.36, scale, { rz: -0.45, rx: -0.3 });
        addFormBox(g, 'muzzle', 0.18, 0.12, 0.16, 0xb7b0cb, 0, 0.82, -0.52, scale);
        addFormCone(g, 'spike', 0.06, 0.16, 0x6d28d9, 0, 0.96, 0.18, scale);
        addFormCone(g, 'spike', 0.06, 0.16, 0x6d28d9, -0.10, 0.90, 0.30, scale);
        addFormCone(g, 'spike', 0.06, 0.16, 0x6d28d9, 0.10, 0.90, 0.30, scale);
        g.scale.set(1.10, 0.98, 1.18);
        break;
      case 'ironbug':
        addEarPair(g, 0x4b5563, scale, { y: 1.10, z: -0.20, h: 0.18, w: 0.06, d: 0.05, tilt: 0 });
        addFormBox(g, 'shell', 0.52, 0.16, 0.44, 0x7c7ca0, 0, 0.80, 0.10, scale, { rx: 0.16, metal: 0.2 });
        addFormCone(g, 'horn', 0.05, 0.22, 0x94a3b8, 0, 1.02, -0.52, scale, { rx: -0.9 });
        addFormCone(g, 'spike', 0.05, 0.14, 0x94a3b8, -0.10, 0.96, 0.16, scale);
        addFormCone(g, 'spike', 0.05, 0.14, 0x94a3b8, 0.10, 0.96, 0.28, scale);
        break;
      case 'fairimp':
        addEarPair(g, 0xf472b6, scale, { y: 1.18, z: -0.18, h: 0.20, w: 0.12, tilt: 0.22 });
        addFormBox(g, 'muzzle', 0.16, 0.11, 0.14, 0xffeff8, 0, 0.82, -0.52, scale);
        addFormBox(g, 'wing', 0.06, 0.28, 0.36, 0xf9c5de, -0.42, 0.88, 0.10, scale);
        addFormBox(g, 'wing', 0.06, 0.28, 0.36, 0xf9c5de, 0.42, 0.88, 0.10, scale);
        break;
      case 'flame_wolf':
        addEarPair(g, 0x7c2d12, scale, { y: 1.28, z: -0.22, h: 0.32, w: 0.08, d: 0.06, tilt: 0.4, cone: true });
        addFormBox(g, 'muzzle', 0.16, 0.10, 0.22, 0xffd6a5, 0, 0.80, -0.58, scale);
        addFormBox(g, 'tail', 0.10, 0.10, 0.48, 0x7c2d12, 0, 0.66, 0.52, scale, { rx: -0.4 });
        addFormCone(g, 'mane', 0.07, 0.22, 0xff4d1a, -0.16, 1.10, -0.02, scale, { rx: 0.4, rough: 0.35 });
        addFormCone(g, 'mane', 0.07, 0.22, 0xff4d1a, 0.16, 1.10, -0.02, scale, { rx: 0.4, rough: 0.35 });
        addFormCone(g, 'mane', 0.08, 0.28, 0xff4d1a, 0, 1.20, 0.08, scale, { rx: 0.35, rough: 0.35 });
        addFormCone(g, 'mane', 0.06, 0.18, 0xff4d1a, -0.10, 1.04, 0.12, scale, { rx: 0.4, rough: 0.35 });
        addFormCone(g, 'mane', 0.06, 0.18, 0xff4d1a, 0.10, 1.04, 0.12, scale, { rx: 0.4, rough: 0.35 });
        addFormBox(g, 'cheek', 0.08, 0.08, 0.06, 0xff7a3a, -0.20, 0.82, -0.42, scale);
        addFormBox(g, 'cheek', 0.08, 0.08, 0.06, 0xff7a3a, 0.20, 0.82, -0.42, scale);
        addFormCone(g, 'tail', 0.08, 0.22, 0xff7a1a, 0, 0.86, 0.72, scale, { rx: Math.PI, rough: 0.35 });
        for (const [x, z] of [[-0.17, 0.26], [0.17, 0.26], [-0.17, -0.02], [0.17, -0.02]]) {
          addFormBox(g, 'paw', 0.12, 0.08, 0.12, 0xff9f1c, x, 0.12, z, scale);
        }
        g.scale.set(0.88, 0.98, 1.24);
        break;
      case 'magma_bear':
        addEarPair(g, 0x78350f, scale, { y: 1.12, z: -0.12, h: 0.14, w: 0.14, d: 0.10, tilt: 0.12 });
        addFormBox(g, 'muzzle', 0.22, 0.14, 0.16, 0xfbbf24, 0, 0.78, -0.52, scale);
        addFormBox(g, 'plate', 0.44, 0.10, 0.30, 0x57534e, 0, 0.78, 0.06, scale, { rx: 0.18, rough: 0.86, metal: 0.16 });
        addFormBox(g, 'crack', 0.04, 0.16, 0.03, 0xff6b1a, -0.12, 0.70, 0.18, scale, { rough: 0.28 });
        addFormBox(g, 'crack', 0.04, 0.16, 0.03, 0xff6b1a, 0.14, 0.78, 0.02, scale, { rough: 0.28 });
        addFormBox(g, 'crack', 0.04, 0.16, 0.03, 0xff6b1a, 0, 0.90, -0.08, scale, { rough: 0.28 });
        addFormBox(g, 'tail', 0.14, 0.12, 0.16, 0x78350f, 0, 0.56, 0.42, scale, { rx: -0.5 });
        for (const [x, z] of [[-0.28, 0.22], [0.28, 0.22], [-0.26, -0.06], [0.26, -0.06]]) {
          addFormBox(g, 'paw', 0.16, 0.10, 0.16, 0x44403c, x, 0.14, z, scale);
        }
        g.scale.set(1.28, 1.06, 1.08);
        break;
      default:
        addEarPair(g, color, scale);
        break;
    }
  }

  function makeBigheadSlime(color, scale, type) {
    const g = new THREE.Group();
    const body = boxMesh(
      BIGHEAD_SLIME_BODY.w * scale,
      BIGHEAD_SLIME_BODY.h * scale,
      BIGHEAD_SLIME_BODY.d * scale,
      color, 0.18, 0, 'body',
    );
    body.position.y = BIGHEAD_SLIME_BODY.y * scale;
    paintBody(body, type, color, 0.18, 0);
    g.add(body);
    addBoxEyes(g, { y: 0.62 * scale, z: -0.38 * scale, spread: 0.18 * scale, size: 0.08 * scale });
    addBoxMouth(g, { y: 0.42 * scale, z: -0.39 * scale });
    const nub = boxMesh(0.24 * scale, 0.14 * scale, 0.24 * scale, color, 0.18, 0, 'nub');
    nub.position.y = 0.94 * scale;
    g.add(nub);
    addBigheadSlimeDecoration(g, type, scale);
    return g;
  }

  function makeBigheadAnimal(color, scale, { kind = 'quadruped', accent = null, type = 'Normal', form = 'plainpup' } = {}) {
    const g = new THREE.Group();
    const headColor = accent || color;

    if (kind === 'bird') {
      const body = boxMesh(0.70 * scale, 0.56 * scale, 0.70 * scale, color, 0.72, 0.06, 'body');
      body.position.y = 0.60 * scale;
      paintBody(body, type, color, 0.72, 0.06, { facial: false });
      g.add(body);
      const head = boxMesh(0.55 * scale, 0.42 * scale, 0.50 * scale, headColor, 0.70, 0.06, 'head');
      head.position.set(0, 0.92 * scale, -0.10 * scale);
      paintBody(head, type, headColor, 0.70, 0.06, { facial: false });
      g.add(head);
      for (const sx of [-0.42, 0.42]) {
        const wing = boxMesh(0.06 * scale, 0.40 * scale, 0.50 * scale, color, 0.72, 0.06, 'wing');
        wing.position.set(sx * scale, 0.70 * scale, 0.05 * scale);
        g.add(wing);
      }
      for (const sx of [-0.15, 0.15]) {
        const leg = boxMesh(0.10 * scale, 0.26 * scale, 0.10 * scale, color, 0.8, 0.04, 'leg');
        leg.position.set(sx * scale, 0.13 * scale, 0.10 * scale);
        g.add(leg);
      }
      const beak = coneMesh(0.09 * scale, 0.22 * scale, 0xf6ad31, 0.7, 0.05, 'beak');
      beak.position.set(0, 0.82 * scale, -0.48 * scale);
      beak.rotation.x = -Math.PI / 2;
      g.add(beak);
      addBoxEyes(g, { y: 0.96 * scale, z: -0.40 * scale, spread: 0.12 * scale, size: 0.06 * scale });
    } else if (kind === 'serpent') {
      const body = boxMesh(0.90 * scale, 0.38 * scale, 0.45 * scale, color, 0.72, 0.08, 'body');
      body.position.set(0, 0.52 * scale, 0);
      paintBody(body, type, color, 0.72, 0.08, { facial: false });
      g.add(body);
      const head = boxMesh(0.50 * scale, 0.42 * scale, 0.45 * scale, headColor, 0.70, 0.06, 'head');
      head.position.set(0, 0.80 * scale, -0.40 * scale);
      paintBody(head, type, headColor, 0.70, 0.06, { facial: false });
      g.add(head);
      for (const sx of [-0.35, 0.35]) {
        const fin = boxMesh(0.04 * scale, 0.18 * scale, 0.25 * scale, color, 0.72, 0.08, 'fin');
        fin.position.set(sx * scale, 0.66 * scale, 0.06 * scale);
        g.add(fin);
      }
      addBoxEyes(g, { y: 0.88 * scale, z: -0.50 * scale, spread: 0.10 * scale, size: 0.05 * scale });
    } else {
      const body = boxMesh(0.65 * scale, 0.42 * scale, 0.85 * scale, color, 0.72, 0.06, 'body');
      body.position.set(0, 0.54 * scale, 0.05 * scale);
      paintBody(body, type, color, 0.72, 0.06, { facial: false });
      g.add(body);
      const head = boxMesh(0.55 * scale, 0.44 * scale, 0.48 * scale, headColor, 0.70, 0.06, 'head');
      head.position.set(0, 0.86 * scale, -0.30 * scale);
      paintBody(head, type, headColor, 0.70, 0.06, { facial: false });
      g.add(head);
      for (const [sx, sz] of [[-0.20, 0.25], [0.20, 0.25], [-0.20, -0.15], [0.20, -0.15]]) {
        const leg = boxMesh(0.12 * scale, 0.32 * scale, 0.12 * scale, color, 0.78, 0.04, 'leg');
        leg.position.set(sx * scale, 0.16 * scale, sz * scale);
        g.add(leg);
      }
      addBoxEyes(g, { y: 0.94 * scale, z: -0.50 * scale, spread: 0.10 * scale, size: 0.06 * scale });
      const nose = boxMesh(0.08 * scale, 0.06 * scale, 0.06 * scale, 0x1f2937, 0.8, 0, 'nose');
      nose.position.set(0, 0.81 * scale, -0.52 * scale);
      g.add(nose);
    }
    addBigheadAnimalDecoration(g, form, scale, color);
    return g;
  }

  return function bigheadMonsterFactory({ def = {}, request = {} } = {}) {
    const form = def.form || 'slime';
    const type = def.type || 'Normal';
    const color = Number.isFinite(def.color) ? def.color : (TYPE_ACCENT[type] || 0xc3b7a1);
    const scale = def.metrics?.scale || 1;
    const kind = form === 'slime' ? 'slime' : animalKind(def);
    const visual = form === 'slime'
      ? makeBigheadSlime(color, scale, type)
      : makeBigheadAnimal(color, scale, { kind, accent: def.metrics?.accent || null, type, form });

    const root = new THREE.Group();
    root.add(visual);
    root.userData.assetForm = 'blocky-bighead';
    root.userData.monsterForm = form;
    root.userData.monsterKind = kind;
    root.userData.monsterType = type;
    visual.userData.baseScale = {
      x: visual.scale.x,
      y: visual.scale.y,
      z: visual.scale.z,
    };

    const boss = request.role === 'boss' || !!request.marks?.boss;
    let action = 'idle';
    let actionTimer = 0;
    let actionDuration = 0.22;
    let phase = 0;

    const handle = {
      root,
      rig: Object.freeze({
        rest: Object.freeze({ ...MONSTER_ANCHOR_Y }),
        pivots: Object.freeze({ visual }),
      }),
      play(name, options = {}) {
        action = name || 'idle';
        actionDuration = options.duration ?? 0.22;
        actionTimer = actionDuration;
        return handle;
      },
      update(dt, visualState = {}) {
        const moving = !!visualState.moving;
        phase += dt * (moving ? 5.2 : 2.2);
        if (actionTimer > 0) actionTimer = Math.max(0, actionTimer - dt);
        else action = 'idle';
        const pulse = Math.sin(phase);
        let sx = 1 + pulse * 0.03;
        let sy = 1 + Math.abs(pulse) * 0.05;
        if (action === 'hurt') {
          const flinch = Math.sin((1 - actionTimer / actionDuration) * Math.PI);
          sx -= flinch * 0.06;
          sy += flinch * 0.04;
        } else if (action === 'attack') {
          const punch = Math.sin((1 - actionTimer / actionDuration) * Math.PI);
          sx += punch * 0.08;
          sy -= punch * 0.04;
        }
        const base = visual.userData.baseScale || { x: 1, y: 1, z: 1 };
        visual.scale.set(sx * base.x, sy * base.y, base.z);
        return handle;
      },
      anchor(name, target) {
        const out = target || { x: 0, y: 0, z: 0 };
        out.x = root.position.x;
        out.z = root.position.z;
        if (name === 'feet') out.y = root.position.y;
        else if (name === 'label' || name === 'headTop') {
          out.y = root.position.y + (boss ? MONSTER_ANCHOR_Y.bossLabel : MONSTER_ANCHOR_Y.label);
        }
        else if (name === 'impact' || name === 'mouth') out.y = root.position.y + MONSTER_ANCHOR_Y.impact;
        else out.y = root.position.y + MONSTER_ANCHOR_Y.hitText;
        return out;
      },
      bounds(target) {
        const out = target || { minY: 0, maxY: 0 };
        out.minY = root.position.y;
        out.maxY = root.position.y + (boss ? MONSTER_ANCHOR_Y.bossLabel : MONSTER_ANCHOR_Y.label) * scale;
        return out;
      },
      setAppearance() { return handle; },
      dispose() {
        disposeHandle(handle);
        return handle;
      },
    };

    registerOwned(handle, {
      userData: {},
      dispose() {
        const walk = (node) => {
          node.geometry?.dispose?.();
          if (Array.isArray(node.material)) node.material.forEach(m => { m.map?.dispose?.(); m.dispose?.(); });
          else {
            node.material?.map?.dispose?.();
            node.material?.dispose?.();
          }
          for (const child of node.children || []) walk(child);
        };
        walk(root);
      },
    });
    return assertAssetHandle(handle);
  };
}
