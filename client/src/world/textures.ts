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

export async function loadWorldTextures(anisotropy = 4): Promise<WorldTextures> {
  const loader = new THREE.TextureLoader();

  const load = async (file: string, srgb: boolean): Promise<THREE.Texture> => {
    const tex = await loader.loadAsync(`assets/textures/${file}`);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = Math.max(1, anisotropy);
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  };

  // Demo bandwidth profile: one grass PBR set is shared by every island and prop.
  // Keep the legacy keys so world builders stay data-compatible without fetching
  // the old sand/rock/bark/planks images.
  const [grassColor, grassNormal, waterNormal] = await Promise.all([
    load('grass_color.jpg', true),
    load('grass_normal.jpg', false),
    load('waternormals.jpg', false),
  ]);

  return {
    grassColor,
    grassNormal,
    sandColor: grassColor,
    sandNormal: grassNormal,
    rockColor: grassColor,
    rockNormal: grassNormal,
    barkColor: grassColor,
    barkNormal: grassNormal,
    planksColor: grassColor,
    planksNormal: grassNormal,
    waterNormal,
  };
}
