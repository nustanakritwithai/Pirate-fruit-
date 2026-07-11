import * as THREE from 'three';

/** ชุด texture PBR ของโลก (CC0 จาก ambientCG + three.js, บีบเป็น JPG 1K สำหรับมือถือ) */
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

export async function loadWorldTextures(): Promise<WorldTextures> {
  const loader = new THREE.TextureLoader();

  const load = async (file: string, srgb: boolean): Promise<THREE.Texture> => {
    const tex = await loader.loadAsync(`assets/textures/${file}`);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 4;
    if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  };

  const [
    grassColor,
    grassNormal,
    sandColor,
    sandNormal,
    rockColor,
    rockNormal,
    barkColor,
    barkNormal,
    planksColor,
    planksNormal,
    waterNormal,
  ] = await Promise.all([
    load('grass_color.jpg', true),
    load('grass_normal.jpg', false),
    load('sand_color.jpg', true),
    load('sand_normal.jpg', false),
    load('rock_color.jpg', true),
    load('rock_normal.jpg', false),
    load('bark_color.jpg', true),
    load('bark_normal.jpg', false),
    load('planks_color.jpg', true),
    load('planks_normal.jpg', false),
    load('waternormals.jpg', false),
  ]);

  return {
    grassColor,
    grassNormal,
    sandColor,
    sandNormal,
    rockColor,
    rockNormal,
    barkColor,
    barkNormal,
    planksColor,
    planksNormal,
    waterNormal,
  };
}
