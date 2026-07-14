/** Seeded RNG — deterministic สำหรับ exploration ใน tests */
let globalSeed = 42_424;

export function setTraderRngSeed(seed: number): void {
  globalSeed = seed >>> 0;
}

export function getTraderRngSeed(): number {
  return globalSeed;
}

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s += 0x6D2B79F5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 0–1 deterministic ต่อ trader + tick */
export function traderRandom(traderId: string, tick: number, salt = 0): number {
  const seed = (globalSeed ^ hashString(traderId) ^ (tick * 2654435761) ^ salt) >>> 0;
  return mulberry32(seed)();
}

export function shouldExplore(
  explorationRate: number,
  traderId: string,
  tick: number,
): boolean {
  return traderRandom(traderId, tick, 1) < explorationRate;
}
