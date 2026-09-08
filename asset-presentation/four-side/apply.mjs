import { BOX_FACE_INDEX, FACE_ORDER, boxFaceUvCorners } from './uv.mjs';
import { resolvePartFaces } from './fallback.mjs';

export function parseHex(hex) {
  const raw = String(hex || '').replace('#', '');
  const full = raw.length === 3 ? raw.split('').map(ch => ch + ch).join('') : raw;
  return [
    parseInt(full.slice(0, 2), 16) || 0,
    parseInt(full.slice(2, 4), 16) || 0,
    parseInt(full.slice(4, 6), 16) || 0,
  ];
}

export function isColorSource(source) {
  return typeof source === 'string' && source.startsWith('#');
}

export function solidRgba(width, height, hex) {
  const [r, g, b] = parseHex(hex);
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = r;
    rgba[i * 4 + 1] = g;
    rgba[i * 4 + 2] = b;
    rgba[i * 4 + 3] = 255;
  }
  return { width, height, rgba };
}

export function blitRgba(dest, destSize, src, dx, dy) {
  const sw = src.width;
  const sh = src.height;
  for (let y = 0; y < sh; y++) {
    const ty = dy + y;
    if (ty < 0 || ty >= destSize) continue;
    for (let x = 0; x < sw; x++) {
      const tx = dx + x;
      if (tx < 0 || tx >= destSize) continue;
      const si = (y * sw + x) * 4;
      const di = (ty * destSize + tx) * 4;
      dest[di] = src.rgba[si];
      dest[di + 1] = src.rgba[si + 1];
      dest[di + 2] = src.rgba[si + 2];
      dest[di + 3] = src.rgba[si + 3];
    }
  }
}

export function stampAtlasRgba(facePixels, layout) {
  const size = layout.atlas;
  const rgba = new Uint8Array(size * size * 4);
  for (const face of FACE_ORDER) {
    const src = facePixels[face];
    if (!src) continue;
    const cell = layout.faces[face].pixel;
    const scaled = src.width === cell.w && src.height === cell.h
      ? src
      : scaleNearest(src, cell.w, cell.h);
    blitRgba(rgba, size, scaled, cell.x, cell.y);
  }
  return { width: size, height: size, rgba };
}

export function scaleNearest(src, width, height) {
  if (src.width === width && src.height === height) return src;
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const sy = Math.min(src.height - 1, Math.floor(y * src.height / height));
    for (let x = 0; x < width; x++) {
      const sx = Math.min(src.width - 1, Math.floor(x * src.width / width));
      const si = (sy * src.width + sx) * 4;
      const di = (y * width + x) * 4;
      rgba[di] = src.rgba[si];
      rgba[di + 1] = src.rgba[si + 1];
      rgba[di + 2] = src.rgba[si + 2];
      rgba[di + 3] = src.rgba[si + 3];
    }
  }
  return { width, height, rgba };
}

export function applyBoxAtlasUVs(geometry, layout) {
  const uv = geometry?.attributes?.uv;
  if (!uv?.array) return geometry;
  const order = ['right', 'left', 'top', 'bottom', 'back', 'front'];
  for (let i = 0; i < order.length; i++) {
    const corners = boxFaceUvCorners(order[i], layout);
    const base = i * 8;
    for (let v = 0; v < 4; v++) {
      uv.array[base + v * 2] = corners[v][0];
      uv.array[base + v * 2 + 1] = corners[v][1];
    }
  }
  uv.needsUpdate = true;
  return geometry;
}

export function detachSharedGeometry(mesh) {
  const geo = mesh?.geometry;
  if (geo && typeof geo.clone === 'function') {
    mesh.geometry = geo.clone();
  }
  return mesh?.geometry;
}

export function pixelDiffRatio(a, b) {
  if (!a || !b || a.width !== b.width || a.height !== b.height) return 1;
  let diff = 0;
  const n = a.rgba.length;
  for (let i = 0; i < n; i += 4) {
    if (a.rgba[i] !== b.rgba[i] || a.rgba[i + 1] !== b.rgba[i + 1] || a.rgba[i + 2] !== b.rgba[i + 2]) {
      diff += 1;
    }
  }
  return diff / (a.width * a.height);
}

export function flipHorizontal(src) {
  const rgba = new Uint8Array(src.rgba.length);
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const si = (y * src.width + x) * 4;
      const di = (y * src.width + (src.width - 1 - x)) * 4;
      rgba[di] = src.rgba[si];
      rgba[di + 1] = src.rgba[si + 1];
      rgba[di + 2] = src.rgba[si + 2];
      rgba[di + 3] = src.rgba[si + 3];
    }
  }
  return { width: src.width, height: src.height, rgba };
}

export async function resolveFacePixels(source, loadFace, tile = 256) {
  if (isColorSource(source)) return solidRgba(tile, tile, source);
  if (typeof loadFace === 'function') return loadFace(source);
  throw new Error(`no loader for face source ${source}`);
}

export async function compilePartAtlas(part, layout, loadFace) {
  const resolved = resolvePartFaces(part);
  const facePixels = {};
  for (const face of FACE_ORDER) {
    facePixels[face] = await resolveFacePixels(resolved[face].source, loadFace, layout.tile);
  }
  return stampAtlasRgba(facePixels, layout);
}

export function createAtlasTexture(THREE, atlas) {
  if (typeof document !== 'undefined' && THREE?.CanvasTexture) {
    const canvas = document.createElement('canvas');
    canvas.width = atlas.width;
    canvas.height = atlas.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const imageData = ctx.createImageData(atlas.width, atlas.height);
    imageData.data.set(atlas.rgba);
    ctx.putImageData(imageData, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.62,
      metalness: 0.04,
    });
  }
  if (!THREE?.DataTexture) {
    return { map: { width: atlas.width, height: atlas.height }, roughness: 0.62 };
  }
  const tex = new THREE.DataTexture(atlas.rgba, atlas.width, atlas.height, THREE.RGBAFormat);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.flipY = true;
  tex.needsUpdate = true;
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.62,
    metalness: 0.04,
  });
}

export { BOX_FACE_INDEX };
