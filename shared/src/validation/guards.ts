export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isNonNegativeInteger(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isInteger(value) && value >= 0;
}

export function clampNonNegativeInteger(value: unknown, fallback = 0): number {
  return isNonNegativeInteger(value) ? value : fallback;
}
