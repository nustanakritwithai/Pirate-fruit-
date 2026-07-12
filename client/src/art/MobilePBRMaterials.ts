import * as THREE from 'three';

export type MobileSurface =
  | 'plaster'
  | 'wood'
  | 'darkWood'
  | 'terracotta'
  | 'rope'
  | 'stone'
  | 'foliage'
  | 'skin'
  | 'cloth'
  | 'leather'
  | 'shell'
  | 'iron'
  | 'paintedMetal';

interface SurfacePreset {
  roughness: number;
  metalness: number;
  normalStrength: number;
  envMapIntensity: number;
}

const PRESETS: Record<MobileSurface, SurfacePreset> = {
  plaster: { roughness: 0.9, metalness: 0, normalStrength: 0.28, envMapIntensity: 0.3 },
  wood: { roughness: 0.78, metalness: 0, normalStrength: 0.46, envMapIntensity: 0.42 },
  darkWood: { roughness: 0.82, metalness: 0, normalStrength: 0.42, envMapIntensity: 0.38 },
  terracotta: { roughness: 0.84, metalness: 0, normalStrength: 0.38, envMapIntensity: 0.34 },
  rope: { roughness: 1, metalness: 0, normalStrength: 0.62, envMapIntensity: 0.18 },
  stone: { roughness: 0.88, metalness: 0, normalStrength: 0.72, envMapIntensity: 0.34 },
  foliage: { roughness: 0.76, metalness: 0, normalStrength: 0.34, envMapIntensity: 0.3 },
  skin: { roughness: 0.58, metalness: 0, normalStrength: 0.12, envMapIntensity: 0.4 },
  cloth: { roughness: 0.9, metalness: 0, normalStrength: 0.4, envMapIntensity: 0.24 },
  leather: { roughness: 0.68, metalness: 0, normalStrength: 0.36, envMapIntensity: 0.48 },
  shell: { roughness: 0.38, metalness: 0.02, normalStrength: 0.3, envMapIntensity: 0.72 },
  iron: { roughness: 0.38, metalness: 0.82, normalStrength: 0.24, envMapIntensity: 0.92 },
  paintedMetal: { roughness: 0.48, metalness: 0.52, normalStrength: 0.2, envMapIntensity: 0.76 },
};

function seededNoise(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = Math.imul(value ^ (value >>> 15), 1 | value);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function makeRoughnessTexture(): THREE.DataTexture {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  const random = seededNoise(0x50b4a1);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const wave = Math.sin(x * 0.53) * 7 + Math.cos(y * 0.39) * 6;
      const value = THREE.MathUtils.clamp(188 + wave + (random() - 0.5) * 38, 0, 255);
      const i = (y * size + x) * 4;
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
      data[i + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(5, 5);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function makeMicroNormalTexture(): THREE.DataTexture {
  const size = 64;
  const heights = new Float32Array(size * size);
  const random = seededNoise(0x9b10f3);
  for (let i = 0; i < heights.length; i++) heights[i] = random();
  const data = new Uint8Array(size * size * 4);
  const at = (x: number, y: number): number => heights[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 0.42;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 0.42;
      const normal = new THREE.Vector3(-dx, -dy, 1).normalize();
      const i = (y * size + x) * 4;
      data[i] = (normal.x * 0.5 + 0.5) * 255;
      data[i + 1] = (normal.y * 0.5 + 0.5) * 255;
      data[i + 2] = normal.z * 255;
      data[i + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(6, 6);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

const sharedRoughness = makeRoughnessTexture();
const sharedMicroNormal = makeMicroNormalTexture();

export interface MobileMaterialOptions {
  color?: THREE.ColorRepresentation;
  map?: THREE.Texture | null;
  normalMap?: THREE.Texture | null;
  roughness?: number;
  metalness?: number;
  normalStrength?: number;
  envMapIntensity?: number;
  emissive?: THREE.ColorRepresentation;
  emissiveIntensity?: number;
  side?: THREE.Side;
  alphaTest?: number;
  transparent?: boolean;
  opacity?: number;
}

/** Material preset กลาง: PBR ครบ แต่ใช้ micro-map 64px ร่วมกันเพื่อลดหน่วยความจำมือถือ */
export function createMobileMaterial(
  surface: MobileSurface,
  options: MobileMaterialOptions = {},
): THREE.MeshStandardMaterial {
  const preset = PRESETS[surface];
  const material = new THREE.MeshStandardMaterial({
    color: options.color ?? 0xffffff,
    map: options.map ?? null,
    normalMap: options.normalMap ?? sharedMicroNormal,
    normalScale: new THREE.Vector2(
      options.normalStrength ?? preset.normalStrength,
      options.normalStrength ?? preset.normalStrength,
    ),
    roughness: options.roughness ?? preset.roughness,
    roughnessMap: sharedRoughness,
    metalness: options.metalness ?? preset.metalness,
    envMapIntensity: options.envMapIntensity ?? preset.envMapIntensity,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
    side: options.side ?? THREE.FrontSide,
    alphaTest: options.alphaTest ?? 0,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
  });
  return material;
}

export function createGlassMaterial(color: THREE.ColorRepresentation): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.16,
    metalness: 0,
    transmission: 0.08,
    transparent: true,
    opacity: 0.82,
    clearcoat: 0.75,
    clearcoatRoughness: 0.14,
    envMapIntensity: 1,
  });
}

/** clone เฉพาะ texture object แต่แชร์ image เดิม จึงตั้ง tiling ต่อ material ได้โดยไม่เพิ่มไฟล์ใน GPU */
export function tiledTexture(source: THREE.Texture, x: number, y: number): THREE.Texture {
  const texture = source.clone();
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(x, y);
  texture.needsUpdate = true;
  return texture;
}

export function applyMobileTextureSettings(texture: THREE.Texture | null, anisotropy: number): void {
  if (!texture) return;
  texture.anisotropy = Math.max(1, anisotropy);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
}
