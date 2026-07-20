import * as THREE from 'three';

/**
 * Tiny code-generated surface maps shared by the whole demo world.
 * They preserve material detail without issuing any image request.
 */
export interface WorldTextures {
  grassColor: THREE.Texture;
  grassNormal: THREE.Texture;
  sandColor: THREE.Texture;
  sandNormal: THREE.Texture;
  rockColor: THREE.Texture;
  rockNormal: THREE.Texture;
  barkColor: THREE.Texture;
  barkNormal: THREE.Texture;
  planksColor: THREE.Texture;
  planksNormal: THREE.Texture;
  waterNormal: THREE.Texture;
}

const TEXTURE_SIZE = 32;

function configure(texture: THREE.DataTexture, anisotropy: number, srgb = false): THREE.DataTexture {
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = Math.max(1, anisotropy);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function makeNeutralSurface(anisotropy: number): THREE.DataTexture {
  const data = new Uint8Array(TEXTURE_SIZE * TEXTURE_SIZE * 4);
  for (let y = 0; y < TEXTURE_SIZE; y++) {
    for (let x = 0; x < TEXTURE_SIZE; x++) {
      const index = (y * TEXTURE_SIZE + x) * 4;
      const grain = Math.sin(x * 1.73 + y * 0.91) * 9 + Math.cos(x * 0.47 - y * 1.31) * 7;
      const value = Math.round(218 + grain);
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      data[index + 3] = 255;
    }
  }
  return configure(new THREE.DataTexture(data, TEXTURE_SIZE, TEXTURE_SIZE), anisotropy, true);
}

function makeSurfaceNormal(anisotropy: number, water = false): THREE.DataTexture {
  const data = new Uint8Array(TEXTURE_SIZE * TEXTURE_SIZE * 4);
  const amplitude = water ? 30 : 13;
  for (let y = 0; y < TEXTURE_SIZE; y++) {
    for (let x = 0; x < TEXTURE_SIZE; x++) {
      const index = (y * TEXTURE_SIZE + x) * 4;
      const dx = Math.sin(x * (water ? 0.72 : 1.17) + y * 0.31) * amplitude;
      const dy = Math.cos(y * (water ? 0.58 : 1.09) - x * 0.27) * amplitude;
      data[index] = Math.round(128 + dx);
      data[index + 1] = Math.round(128 + dy);
      data[index + 2] = 245;
      data[index + 3] = 255;
    }
  }
  return configure(new THREE.DataTexture(data, TEXTURE_SIZE, TEXTURE_SIZE), anisotropy);
}

/** Kept async for the existing bootstrap contract; performs no fetch and creates no DOM image. */
export async function loadWorldTextures(anisotropy = 4): Promise<WorldTextures> {
  const neutralColor = makeNeutralSurface(anisotropy);
  const surfaceNormal = makeSurfaceNormal(anisotropy);
  const waterNormal = makeSurfaceNormal(anisotropy, true);

  return {
    grassColor: neutralColor,
    grassNormal: surfaceNormal,
    sandColor: neutralColor,
    sandNormal: surfaceNormal,
    rockColor: neutralColor,
    rockNormal: surfaceNormal,
    barkColor: neutralColor,
    barkNormal: surfaceNormal,
    planksColor: neutralColor,
    planksNormal: surfaceNormal,
    waterNormal,
  };
}
