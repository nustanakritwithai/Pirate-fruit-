import { FACE_ORDER, atlasLayout } from './four-side/uv.mjs';
import {
  applyBoxAtlasUVs,
  createAtlasTexture,
  detachSharedGeometry,
  parseHex,
  stampAtlasRgba,
} from './four-side/apply.mjs';

export const MONSTER_FACE_SIZE = 256;
export const EYE_COLOR = '#1f2937';
export const MOUTH_COLOR = '#1f2937';

const TYPE_ACCENT = Object.freeze({
  Normal: '#8a8a78', Fire: '#ff7a2f', Water: '#8ed8ff', Electric: '#ffef66', Grass: '#7bdc63',
  Ice: '#dafdff', Fighting: '#d84c43', Poison: '#d68dff', Ground: '#8b6a37', Flying: '#d4cbff',
  Psychic: '#ff9ac8', Bug: '#a9ca3b', Rock: '#c9b574', Ghost: '#cabfff', Dragon: '#a78bfa',
  Dark: '#3a312c', Steel: '#c9cfdf', Fairy: '#ffc4e8',
});

const atlasCache = new Map();

export function toMonsterHex(color) {
  if (typeof color === 'string') {
    const raw = color.trim();
    if (raw.startsWith('#')) return `#${raw.replace('#', '').padStart(6, '0').slice(0, 6)}`;
    if (raw.startsWith('0x') || raw.startsWith('0X')) {
      return `#${Number.parseInt(raw, 16).toString(16).padStart(6, '0')}`;
    }
    return `#${raw.padStart(6, '0').slice(0, 6)}`;
  }
  return `#${Number(color).toString(16).padStart(6, '0')}`;
}

function mixRgb(rgb, factor) {
  if (factor >= 1) {
    const t = factor - 1;
    return rgb.map(c => Math.min(255, Math.round(c + (255 - c) * t)));
  }
  return rgb.map(c => Math.max(0, Math.round(c * factor)));
}

function fillRect(img, x, y, w, h, rgb, a = 255) {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(img.width, Math.ceil(x + w));
  const y1 = Math.min(img.height, Math.ceil(y + h));
  const [r, g, b] = rgb;
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const i = (py * img.width + px) * 4;
      img.rgba[i] = r;
      img.rgba[i + 1] = g;
      img.rgba[i + 2] = b;
      img.rgba[i + 3] = a;
    }
  }
}

function makeFace(size, rgb) {
  const img = { width: size, height: size, rgba: new Uint8Array(size * size * 4) };
  fillRect(img, 0, 0, size, size, rgb);
  return img;
}

function drawTypePattern(img, type, size, { back = false, side = false } = {}) {
  const accent = parseHex(TYPE_ACCENT[type] || '#ffffff');
  const yShift = back ? size * 0.18 : (side ? size * 0.08 : 0);
  switch (type) {
    case 'Normal':
      fillRect(img, size * 0.10, size * 0.58 + yShift, size * 0.16, size * 0.12, accent);
      fillRect(img, size * 0.74, size * 0.58 + yShift, size * 0.16, size * 0.12, accent);
      break;
    case 'Fire':
      fillRect(img, size * 0.18, size * 0.04 + yShift, size * 0.12, size * 0.28, accent);
      fillRect(img, size * 0.44, size * 0.02 + yShift, size * 0.14, size * 0.36, accent);
      fillRect(img, size * 0.70, size * 0.04 + yShift, size * 0.12, size * 0.28, accent);
      break;
    case 'Water':
      fillRect(img, size * 0.12, size * 0.70 + yShift, size * 0.76, size * 0.08, accent);
      fillRect(img, size * 0.20, size * 0.58 + yShift, size * 0.60, size * 0.08, accent);
      break;
    case 'Electric':
      fillRect(img, size * 0.18, size * 0.18 + yShift, size * 0.64, size * 0.08, accent);
      fillRect(img, size * 0.50, size * 0.18 + yShift, size * 0.10, size * 0.42, accent);
      fillRect(img, size * 0.28, size * 0.52 + yShift, size * 0.50, size * 0.08, accent);
      break;
    case 'Grass':
      fillRect(img, size * 0.44, size * 0.08 + yShift, size * 0.12, size * 0.36, accent);
      fillRect(img, size * 0.28, size * 0.22 + yShift, size * 0.44, size * 0.10, accent);
      break;
    case 'Ice':
      fillRect(img, size * 0.22, size * 0.10 + yShift, size * 0.14, size * 0.22, accent);
      fillRect(img, size * 0.43, size * 0.04 + yShift, size * 0.14, size * 0.30, accent);
      fillRect(img, size * 0.64, size * 0.10 + yShift, size * 0.14, size * 0.22, accent);
      break;
    case 'Fighting':
      fillRect(img, size * 0.08, size * 0.62 + yShift, size * 0.18, size * 0.18, accent);
      fillRect(img, size * 0.74, size * 0.62 + yShift, size * 0.18, size * 0.18, accent);
      break;
    case 'Poison':
      fillRect(img, size * 0.18, size * 0.16 + yShift, size * 0.16, size * 0.16, accent);
      fillRect(img, size * 0.62, size * 0.12 + yShift, size * 0.20, size * 0.20, accent);
      fillRect(img, size * 0.42, size * 0.08 + yShift, size * 0.12, size * 0.12, accent);
      break;
    case 'Ground':
      fillRect(img, size * 0.22, size * 0.12 + yShift, size * 0.56, size * 0.16, accent);
      fillRect(img, size * 0.30, size * 0.08 + yShift, size * 0.12, size * 0.10, accent);
      fillRect(img, size * 0.58, size * 0.08 + yShift, size * 0.12, size * 0.10, accent);
      break;
    case 'Flying':
      fillRect(img, size * 0.04, size * 0.28 + yShift, size * 0.22, size * 0.36, accent);
      fillRect(img, size * 0.74, size * 0.28 + yShift, size * 0.22, size * 0.36, accent);
      break;
    case 'Psychic':
      fillRect(img, size * 0.30, size * 0.10 + yShift, size * 0.40, size * 0.08, accent);
      fillRect(img, size * 0.30, size * 0.34 + yShift, size * 0.40, size * 0.08, accent);
      fillRect(img, size * 0.46, size * 0.10 + yShift, size * 0.08, size * 0.32, accent);
      fillRect(img, size * 0.44, size * 0.44 + yShift, size * 0.12, size * 0.12, accent);
      break;
    case 'Bug':
      fillRect(img, size * 0.28, size * 0.06 + yShift, size * 0.10, size * 0.24, accent);
      fillRect(img, size * 0.62, size * 0.06 + yShift, size * 0.10, size * 0.24, accent);
      fillRect(img, size * 0.34, size * 0.72 + yShift, size * 0.32, size * 0.10, accent);
      break;
    case 'Rock':
      fillRect(img, size * 0.18, size * 0.14 + yShift, size * 0.18, size * 0.18, accent);
      fillRect(img, size * 0.42, size * 0.06 + yShift, size * 0.20, size * 0.22, accent);
      fillRect(img, size * 0.66, size * 0.16 + yShift, size * 0.16, size * 0.16, accent);
      break;
    case 'Ghost':
      fillRect(img, size * 0.18, size * 0.18 + yShift, size * 0.18, size * 0.18, accent);
      fillRect(img, size * 0.62, size * 0.12 + yShift, size * 0.16, size * 0.16, accent);
      fillRect(img, size * 0.38, size * 0.72 + yShift, size * 0.24, size * 0.08, accent);
      break;
    case 'Dragon':
      fillRect(img, size * 0.22, size * 0.04 + yShift, size * 0.12, size * 0.32, accent);
      fillRect(img, size * 0.66, size * 0.04 + yShift, size * 0.12, size * 0.32, accent);
      fillRect(img, size * 0.40, size * 0.70 + yShift, size * 0.20, size * 0.14, accent);
      break;
    case 'Dark':
      fillRect(img, size * 0.22, size * 0.48 + yShift, size * 0.56, size * 0.10, accent);
      fillRect(img, size * 0.12, size * 0.16 + yShift, size * 0.16, size * 0.22, accent);
      fillRect(img, size * 0.72, size * 0.16 + yShift, size * 0.16, size * 0.22, accent);
      break;
    case 'Steel':
      fillRect(img, size * 0.22, size * 0.18 + yShift, size * 0.56, size * 0.16, accent);
      fillRect(img, size * 0.30, size * 0.22 + yShift, size * 0.10, size * 0.10, mixRgb(accent, 1.25));
      fillRect(img, size * 0.60, size * 0.22 + yShift, size * 0.10, size * 0.10, mixRgb(accent, 1.25));
      break;
    case 'Fairy':
      fillRect(img, size * 0.12, size * 0.22 + yShift, size * 0.16, size * 0.28, accent);
      fillRect(img, size * 0.72, size * 0.22 + yShift, size * 0.16, size * 0.28, accent);
      fillRect(img, size * 0.46, size * 0.08 + yShift, size * 0.08, size * 0.08, accent);
      break;
    default:
      fillRect(img, size * 0.40, size * 0.40 + yShift, size * 0.20, size * 0.20, accent);
  }
}

export function drawMonsterFront(img, type) {
  const size = img.width;
  const base = [img.rgba[0], img.rgba[1], img.rgba[2]];
  fillRect(img, size * 0.18, size * 0.28, size * 0.64, size * 0.46, mixRgb(base, 1.18));
  fillRect(img, size * 0.28, size * 0.38, size * 0.12, size * 0.12, parseHex(EYE_COLOR));
  fillRect(img, size * 0.60, size * 0.38, size * 0.12, size * 0.12, parseHex(EYE_COLOR));
  fillRect(img, size * 0.38, size * 0.58, size * 0.24, size * 0.05, parseHex(MOUTH_COLOR));
  drawTypePattern(img, type, size);
}

export function drawMonsterBodyFront(img, type) {
  const size = img.width;
  const base = [img.rgba[0], img.rgba[1], img.rgba[2]];
  fillRect(img, size * 0.18, size * 0.28, size * 0.64, size * 0.46, mixRgb(base, 1.10));
  drawTypePattern(img, type, size);
}

export function drawMonsterBack(img, type) {
  const size = img.width;
  drawTypePattern(img, type, size, { back: true });
}

export function drawMonsterSide(img, type) {
  const size = img.width;
  const shade = mixRgb([img.rgba[0], img.rgba[1], img.rgba[2]], 0.88);
  fillRect(img, 0, 0, size * 0.18, size, shade);
  drawTypePattern(img, type, size, { side: true });
}

export function paintMonsterFace(face, type, color, size = MONSTER_FACE_SIZE, { facial = true } = {}) {
  const rgb = parseHex(toMonsterHex(color));
  const img = makeFace(size, rgb);
  if (face === 'front') {
    if (facial) drawMonsterFront(img, type);
    else drawMonsterBodyFront(img, type);
  } else if (face === 'back') drawMonsterBack(img, type);
  else if (face === 'left' || face === 'right') drawMonsterSide(img, type);
  else if (face === 'top') fillRect(img, 0, 0, size, size, mixRgb(rgb, 1.12));
  else if (face === 'bottom') fillRect(img, 0, 0, size, size, mixRgb(rgb, 0.82));
  return img;
}

export function compileMonsterFourSideAtlas(type, color, layout = atlasLayout(), { facial = true } = {}) {
  const key = `${type}:${toMonsterHex(color)}:${layout.atlas}:${layout.tile}:f${facial ? 1 : 0}`;
  const cached = atlasCache.get(key);
  if (cached) return cached;
  const facePixels = {};
  for (const face of FACE_ORDER) {
    facePixels[face] = paintMonsterFace(face, type, color, layout.tile, { facial });
  }
  const atlas = stampAtlasRgba(facePixels, layout);
  atlasCache.set(key, atlas);
  return atlas;
}

export function getMonsterFourSideTexture(type, color, THREE = null, { facial = true } = {}) {
  const atlas = compileMonsterFourSideAtlas(type, color, atlasLayout(), { facial });
  if (!THREE) return atlas;
  return createAtlasTexture(THREE, atlas);
}

export function applyMonsterFourSide(mesh, type, color, THREE, { roughness = 0.62, metalness = 0.04, facial = true } = {}) {
  if (!mesh) return mesh;
  detachSharedGeometry(mesh);
  applyBoxAtlasUVs(mesh.geometry, atlasLayout());
  const painted = getMonsterFourSideTexture(type, color, THREE, { facial });
  const prev = mesh.material;
  mesh.material = painted;
  if (painted && typeof painted === 'object') {
    if ('roughness' in painted) painted.roughness = roughness;
    if ('metalness' in painted) painted.metalness = metalness;
  }
  mesh.userData.atlasApplied = true;
  mesh.userData.atlasType = type;
  mesh.userData.atlasFacial = !!facial;
  if (prev && prev !== painted && typeof prev.dispose === 'function') {
    prev.map?.dispose?.();
    prev.dispose();
  }
  return mesh;
}
