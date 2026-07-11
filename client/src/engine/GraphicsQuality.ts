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
}

const STORAGE_KEY = 'pirate-fruit:graphics-v1';

const PROFILES: Record<GraphicsTier, Omit<GraphicsProfile, 'tier'>> = {
  low: {
    label: 'ประหยัด',
    pixelRatio: 1,
    antialias: false,
    shadows: false,
    shadowMapSize: 512,
    terrainSegments: 72,
    waterSegments: 32,
    palmCount: 24,
    palmFronds: 5,
    rockCount: 16,
    crateCount: 7,
    cloudCount: 5,
    pointLights: 0,
  },
  medium: {
    label: 'สมดุล',
    pixelRatio: 1.25,
    antialias: true,
    shadows: true,
    shadowMapSize: 768,
    terrainSegments: 100,
    waterSegments: 48,
    palmCount: 32,
    palmFronds: 6,
    rockCount: 21,
    crateCount: 9,
    cloudCount: 7,
    pointLights: 1,
  },
  high: {
    label: 'สวย',
    pixelRatio: 1.75,
    antialias: true,
    shadows: true,
    shadowMapSize: 1536,
    terrainSegments: 140,
    waterSegments: 64,
    palmCount: 40,
    palmFronds: 8,
    rockCount: 25,
    crateCount: 10,
    cloudCount: 10,
    pointLights: 3,
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
