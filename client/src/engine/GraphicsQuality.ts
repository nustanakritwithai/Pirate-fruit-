import { isTouchDevice } from './device';

export type GraphicsTier = 'low' | 'medium' | 'high';

export interface GraphicsProfile {
  tier: GraphicsTier;
  label: string;
  pixelRatio: number;
  antialias: boolean;
  shadows: boolean;
  shadowMapSize: number;
  terrainSegments: number;
  waterSegments: number;
  palmCount: number;
  palmFronds: number;
  rockCount: number;
  crateCount: number;
  cloudCount: number;
  pointLights: number;
  grassPatchCount: number;
  shrubCount: number;
  textureAnisotropy: number;
  exposure: number;
  maxDrawCalls: number;
  maxVisibleTriangles: number;
}

const STORAGE_KEY = 'pirate-fruit:graphics-v1';

const PROFILES: Record<GraphicsTier, Omit<GraphicsProfile, 'tier'>> = {
  low: {
    label: 'ประหยัด',
    pixelRatio: 0.75,
    antialias: false,
    shadows: false,
    shadowMapSize: 512,
    terrainSegments: 72,
    waterSegments: 32,
    palmCount: 16,
    palmFronds: 4,
    rockCount: 12,
    crateCount: 6,
    cloudCount: 5,
    pointLights: 0,
    grassPatchCount: 48,
    shrubCount: 8,
    textureAnisotropy: 1,
    exposure: 0.92,
    maxDrawCalls: 85,
    maxVisibleTriangles: 150_000,
  },
  medium: {
    label: 'สมดุล',
    pixelRatio: 1,
    antialias: true,
    shadows: true,
    shadowMapSize: 1024,
    terrainSegments: 100,
    waterSegments: 48,
    palmCount: 22,
    palmFronds: 5,
    rockCount: 16,
    crateCount: 7,
    cloudCount: 7,
    pointLights: 1,
    grassPatchCount: 96,
    shrubCount: 12,
    textureAnisotropy: 4,
    exposure: 0.98,
    maxDrawCalls: 120,
    maxVisibleTriangles: 220_000,
  },
  high: {
    label: 'สวย',
    pixelRatio: 1.25,
    antialias: true,
    shadows: true,
    shadowMapSize: 1536,
    terrainSegments: 140,
    waterSegments: 64,
    palmCount: 30,
    palmFronds: 6,
    rockCount: 20,
    crateCount: 8,
    cloudCount: 10,
    pointLights: 3,
    grassPatchCount: 160,
    shrubCount: 18,
    textureAnisotropy: 8,
    exposure: 1.04,
    maxDrawCalls: 150,
    maxVisibleTriangles: 300_000,
  },
};

function isTier(value: string | null): value is GraphicsTier {
  return value === 'low' || value === 'medium' || value === 'high';
}

function automaticTier(): GraphicsTier {
  if (!isTouchDevice()) return 'high';
  const nav = navigator as Navigator & { deviceMemory?: number };
  const memory = nav.deviceMemory ?? 4;
  const cores = navigator.hardwareConcurrency ?? 4;
  if (memory <= 3 || cores <= 4) return 'low';
  return 'medium';
}

export function loadGraphicsProfile(): GraphicsProfile {
  const query = new URLSearchParams(location.search).get('quality');
  let tier: GraphicsTier;
  if (isTier(query)) {
    tier = query;
  } else {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(STORAGE_KEY);
    } catch {
      // localStorage อาจถูกปิดในโหมดส่วนตัวบางเบราว์เซอร์
    }
    tier = isTier(saved) ? saved : automaticTier();
  }
  return { tier, ...PROFILES[tier] };
}

export function saveGraphicsTier(tier: GraphicsTier): void {
  try {
    localStorage.setItem(STORAGE_KEY, tier);
  } catch {
    // ถ้าบันทึกไม่ได้ การตั้งค่ายังคงใช้ได้จนกว่าจะรีโหลด
  }
}

export function nextGraphicsTier(tier: GraphicsTier): GraphicsTier {
  if (tier === 'low') return 'medium';
  if (tier === 'medium') return 'high';
  return 'low';
}
