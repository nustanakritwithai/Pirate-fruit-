import type {
  RealtimePresentationCategory,
  RealtimePlayerPresentation,
  RealtimePlayerVisual,
  RealtimeProjectileState,
  RealtimeVisualEvent,
  RealtimeVisualVec3,
} from '@pirate-fruit/shared';

const ID = /^[A-Za-z0-9._:-]{1,96}$/;
const SESSION = /^[A-Za-z0-9_-]{8,64}$/;
const KINDS = new Set<RealtimeVisualEvent['kind']>([
  'slash', 'blade-trail', 'gun-shot', 'energy-launch', 'shockwave', 'beam',
  'hit-spark', 'energy-impact', 'projectile-start', 'projectile-end',
]);
const ASSETS = new Set(['fireball', 'lightning-hands', 'magic-rock', 'earth-bending', 'water-element', 'ice-block', 'fire-grenade', 'smoke', 'fire-hands']);
const CATEGORIES = new Set(['style', 'sword', 'gun', 'fruit', 'utility']);

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }
function vec(value: unknown, limit = 10_000): RealtimeVisualVec3 | null {
  if (!record(value) || !finite(value.x) || !finite(value.y) || !finite(value.z)) return null;
  if (Math.abs(value.x) > limit || Math.abs(value.y) > limit || Math.abs(value.z) > limit) return null;
  return { x: value.x, y: value.y, z: value.z };
}
function direction(value: unknown): RealtimeVisualVec3 | null {
  const result = vec(value, 1);
  return result && Math.hypot(result.x, result.y, result.z) > 0 ? result : null;
}
function color(value: unknown): value is number { return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 0xffffff; }
function numberIn(value: unknown, min: number, max: number): value is number { return finite(value) && value >= min && value <= max; }

export function sanitizePresentation(value: unknown): RealtimePlayerPresentation | null {
  if (!record(value) || value.schemaVersion !== 1 || value.avatarId !== 'pirate-v1' || value.appearanceId !== 'player-orange') return null;
  const list = (input: unknown): string[] | null => {
    if (!Array.isArray(input) || input.length > 16) return null;
    const seen = new Set<string>();
    const result: string[] = [];
    for (const item of input) {
      if (typeof item !== 'string' || !ID.test(item) || seen.has(item)) return null;
      seen.add(item); result.push(item);
    }
    return result;
  };
  const clothingIds = list(value.clothingIds);
  const equipmentIds = list(value.equipmentIds);
  if (!clothingIds || !equipmentIds) return null;
  let activeItem: RealtimePlayerPresentation['activeItem'] = null;
  if (value.activeItem !== null) {
    if (!record(value.activeItem) || typeof value.activeItem.category !== 'string' || !CATEGORIES.has(value.activeItem.category)
      || typeof value.activeItem.itemId !== 'string' || !ID.test(value.activeItem.itemId)) return null;
    activeItem = { category: value.activeItem.category as RealtimePresentationCategory, itemId: value.activeItem.itemId as string };
  }
  return { schemaVersion: 1, avatarId: 'pirate-v1', appearanceId: 'player-orange', clothingIds, equipmentIds, activeItem };
}

export function sanitizeProjectile(value: unknown): RealtimeProjectileState | null {
  if (!record(value) || typeof value.id !== 'string' || !ID.test(value.id)) return null;
  const position = vec(value.position); const dir = direction(value.direction); const velocity = vec(value.velocity, 200);
  if (!position || !dir || !velocity || !color(value.color) || !numberIn(value.scale, .01, 20)
    || !numberIn(value.elapsed, 0, 120) || !numberIn(value.lifeFraction, 0, 1) || !Number.isInteger(value.remainingMs) || !numberIn(value.remainingMs, 0, 120000)) return null;
  const result: RealtimeProjectileState = { id: value.id, position, direction: dir, velocity, color: value.color as number, scale: value.scale as number, elapsed: value.elapsed as number, lifeFraction: value.lifeFraction as number, remainingMs: Math.round(value.remainingMs as number) };
  for (const key of ['itemId', 'skillId'] as const) {
    if (value[key] !== undefined) { if (typeof value[key] !== 'string' || !ID.test(value[key])) return null; result[key] = value[key]; }
  }
  return result;
}

export function sanitizeVisualEvent(value: unknown): RealtimeVisualEvent | null {
  if (!record(value) || !Number.isSafeInteger(value.sequence) || (value.sequence as number) < 1 || (value.sequence as number) > Number.MAX_SAFE_INTEGER
    || typeof value.kind !== 'string' || !KINDS.has(value.kind as RealtimeVisualEvent['kind']) || !Number.isInteger(value.ageMs) || (value.ageMs as number) < 0 || (value.ageMs as number) > 3000) return null;
  const sequence = value.sequence as number;
  const ageMs = value.ageMs as number;
  const kind = value.kind as RealtimeVisualEvent['kind'];
  const position = kind === 'projectile-start' ? null : vec(value.position);
  if (kind !== 'projectile-start' && !position) return null;
  const result: RealtimeVisualEvent = { sequence, kind, ageMs, ...(position ? { position } : {}) };
  for (const key of ['itemId', 'skillId'] as const) { if (value[key] !== undefined) { if (typeof value[key] !== 'string' || !ID.test(value[key])) return null; result[key] = value[key]; } }
  if (value.assetId !== undefined) { if ((kind !== 'slash' && kind !== 'shockwave') || typeof value.assetId !== 'string' || !ASSETS.has(value.assetId)) return null; result.assetId = value.assetId; }
  if (kind === 'slash') { if (!numberIn(value.heading, -Math.PI, Math.PI) || !color(value.color) || !numberIn(value.scale, .01, 20)) return null; Object.assign(result, { heading: value.heading, color: value.color, scale: value.scale }); }
  else if (kind === 'blade-trail') { const base = vec(value.bladeBase); const tip = vec(value.bladeTip); if (!base || !tip || !position || !numberIn(value.heading, -Math.PI, Math.PI) || !Number.isInteger(value.comboIndex) || (value.comboIndex as number) < 0 || (value.comboIndex as number) > 3 || !color(value.color) || typeof value.finisher !== 'boolean') return null; Object.assign(result, { bladeBase: base, bladeTip: tip, heading: value.heading as number, comboIndex: value.comboIndex as number, color: value.color, finisher: value.finisher }); }
  else if (kind === 'gun-shot') { const endpoint = vec(value.endpoint); if (!endpoint || !position || !color(value.color) || typeof value.impacted !== 'boolean' || !numberIn(value.power, .01, 20)) return null; Object.assign(result, { endpoint, color: value.color, impacted: value.impacted, power: value.power }); }
  else if (kind === 'energy-launch') { const dir = direction(value.direction); if (!dir || !color(value.color) || !numberIn(value.scale, .01, 20)) return null; Object.assign(result, { direction: dir, color: value.color, scale: value.scale }); }
  else if (kind === 'shockwave') { if (!numberIn(value.radius, .01, 200) || !color(value.color)) return null; Object.assign(result, { radius: value.radius, color: value.color }); }
  else if (kind === 'beam') { const dir = direction(value.direction); if (!dir || !numberIn(value.length, .01, 1000) || !color(value.color)) return null; Object.assign(result, { direction: dir, length: value.length, color: value.color }); }
  else if (kind === 'hit-spark') { if (!color(value.color)) return null; result.color = value.color; }
  else if (kind === 'energy-impact') { if (!color(value.color) || !numberIn(value.scale, .01, 20)) return null; Object.assign(result, { color: value.color, scale: value.scale }); }
  else if (kind === 'projectile-start') { const projectile = sanitizeProjectile(value.projectile); if (!projectile) return null; result.projectile = projectile; }
  else { if (typeof value.projectileId !== 'string' || !ID.test(value.projectileId) || !color(value.color) || !numberIn(value.scale, .01, 20) || !numberIn(value.burstScale, 0, 20)) return null; Object.assign(result, { projectileId: value.projectileId, color: value.color, scale: value.scale, burstScale: value.burstScale }); }
  return result;
}

export function sanitizeVisual(value: unknown, maxEvents = 512): RealtimePlayerVisual | null {
  if (!record(value) || value.schemaVersion !== 1 || typeof value.sessionId !== 'string' || !SESSION.test(value.sessionId) || !Number.isSafeInteger(value.stateSequence) || (value.stateSequence as number) < 1 || (value.stateSequence as number) > Number.MAX_SAFE_INTEGER || !Array.isArray(value.events) || value.events.length > maxEvents || !Array.isArray(value.projectiles) || value.projectiles.length > 32) return null;
  const events = value.events.map(sanitizeVisualEvent); if (events.some((event): event is null => event === null)) return null;
  for (let i = 1; i < events.length; i += 1) if (events[i]!.sequence <= events[i - 1]!.sequence) return null;
  const projectiles = value.projectiles.map(sanitizeProjectile); if (projectiles.some((projectile): projectile is null => projectile === null)) return null;
  if (new Set(projectiles.map((projectile) => projectile!.id)).size !== projectiles.length) return null;
  let shield: RealtimePlayerVisual['shield'];
  if (value.shield !== undefined) { if (!record(value.shield) || typeof value.shield.active !== 'boolean' || !numberIn(value.shield.opacity, 0, 1)) return null; shield = { active: value.shield.active, opacity: value.shield.opacity }; }
  return { schemaVersion: 1, sessionId: value.sessionId, stateSequence: value.stateSequence as number, events: events as RealtimeVisualEvent[], projectiles: projectiles as RealtimeProjectileState[], ...(shield ? { shield } : {}) };
}
