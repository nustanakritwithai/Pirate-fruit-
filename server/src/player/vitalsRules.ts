import { resourceCapsForStats, SHOP_POTIONS, SPAWN_ID_BY_ISLAND, WORLD_SAFE_ZONES, SKILL_MASTERY_REQUIRED, SKILL_RESOURCE_CATALOG, type ShopPotionId } from '@pirate-fruit/shared';
import type { CanonicalPveState } from './pveIncomingDamageAdapter.js';

export const PVE_GUARD_MAX = 100;
export const PVE_GUARD_REGEN = 14;
export const PVE_GUARD_REBLOCK_THRESHOLD = 30;
export const PVE_HP_REGEN_DELAY = 6;
export const PVE_HP_REGEN_RATE = 3.5;
export const PVE_ENERGY_MAX = 100;
export const PVE_ENERGY_DRAIN = 22;
export const PVE_ENERGY_REGEN = 16;
export const PVE_WATER_ENERGY_DRAIN = 18;
export const PVE_DEVIL_FRUIT_ENERGY_DRAIN = 48;
export const PVE_WATER_HP_DRAIN = 26;
export const PVE_DEVIL_FRUIT_HP_DRAIN = 42;
export const PVE_MP_REGEN = 9;
export const PVE_POTION_COOLDOWN_MS = 1_200;

export interface CanonicalPveVitals {
  lastDamageAtMs: number;
  potionCooldownUntil: number;
  buffCooldowns: Record<string, number>;
  skillCooldowns?: Record<string, number>;
  buffMultiplier: number;
  buffUntil: number;
}

export interface PveVitalsContext {
  now: number;
  revision?: number;
  dtMs: number;
  blocking: boolean;
  mounted: boolean;
  sprinting: boolean;
  inWater: boolean;
  devilFruitUser: boolean;
  combatActive: boolean;
}

export interface CanonicalVitalsSnapshot {
  contract: 'pirate-vitals/1'; revision: number; serverTimeMs: number;
  hp: number; maxHp: number; guard: number; guardMax: number; guardBroken: boolean; hitstunUntil: number;
  energy: number; maxEnergy: number; mp: number; maxMp: number; dead: boolean;
  respawn?: NonNullable<CanonicalPveState['pveRespawn']>;
}

export interface VitalsOutcome {
  type: string; changed: boolean;
  respawn?: { spawnId: string; islandId: string; x: number; y: number; z: number; heading: number; atRevision: number };
}

export interface PveBuffProfile {
  skillId: string;
  energyCost: number;
  mpRestore: number;
  healRatio: number;
  multiplier: number;
  durationMs: number;
  cooldownMs: number;
}

export type PveVitalsOperation =
  | { type: 'potion'; potionId: ShopPotionId; idempotencyKey: string }
  | { type: 'skill'; skillId: string; idempotencyKey: string }
  | { type: 'buff'; skillId: string; idempotencyKey: string }
  | { type: 'respawn'; idempotencyKey: string };

export function advanceCanonicalVitals(current: CanonicalPveState, context: PveVitalsContext): { state: CanonicalPveState; changed: boolean } {
  const state = clone(current);
  const dt = Math.max(0, Math.min(1_000, context.dtMs)) / 1_000;
  const caps = resourceCapsForStats(state.progression.stats);
  const vitals = state.pveVitals ?? defaultPveVitals(context.now);
  const combat = state.pveCombat ?? { guard: PVE_GUARD_MAX, guardBroken: false, hitstunUntil: 0 };
  combat.guard = finite(combat.guard, PVE_GUARD_MAX, 0, PVE_GUARD_MAX);
  combat.guardBroken = combat.guardBroken === true;
  combat.hitstunUntil = finite(combat.hitstunUntil, 0, 0, Number.MAX_SAFE_INTEGER);
  const dead = state.checkpoint.hp <= 0;
  if (!dead && !context.blocking) {
    combat.guard = Math.min(PVE_GUARD_MAX, combat.guard + PVE_GUARD_REGEN * dt);
    if (combat.guardBroken && combat.guard >= PVE_GUARD_REBLOCK_THRESHOLD) combat.guardBroken = false;
  }
  if (state.checkpoint.hp > 0 && !context.mounted && !context.combatActive
    && context.now - vitals.lastDamageAtMs > PVE_HP_REGEN_DELAY * 1_000)
    state.checkpoint.hp = Math.min(caps.maxHp, state.checkpoint.hp + PVE_HP_REGEN_RATE * dt);
  if (!dead && !context.mounted && context.inWater) {
    state.checkpoint.energy = Math.max(0, state.checkpoint.energy
      - (context.devilFruitUser ? PVE_DEVIL_FRUIT_ENERGY_DRAIN : PVE_WATER_ENERGY_DRAIN) * dt);
    if (state.checkpoint.energy <= 0)
      state.checkpoint.hp = Math.max(0, state.checkpoint.hp
        - (context.devilFruitUser ? PVE_DEVIL_FRUIT_HP_DRAIN : PVE_WATER_HP_DRAIN) * dt);
  } else if (!dead && !context.mounted && context.sprinting) {
    state.checkpoint.energy = Math.max(0, state.checkpoint.energy - PVE_ENERGY_DRAIN * dt);
  } else if (!dead && !context.mounted) {
    state.checkpoint.energy = Math.min(caps.maxEnergy, state.checkpoint.energy + PVE_ENERGY_REGEN * dt);
  }
  if (!dead) state.checkpoint.mp = Math.min(caps.maxMp, state.checkpoint.mp + PVE_MP_REGEN * dt);
  state.pveCombat = combat;
  state.pveVitals = vitals;
  const changed = state.checkpoint.hp !== current.checkpoint.hp
    || state.checkpoint.energy !== current.checkpoint.energy
    || state.checkpoint.mp !== current.checkpoint.mp
    || state.pveCombat?.guard !== (current.pveCombat?.guard ?? PVE_GUARD_MAX)
    || state.pveCombat?.guardBroken !== (current.pveCombat?.guardBroken ?? false);
  return { state, changed };
}

export const tickCanonicalVitals = advanceCanonicalVitals;

export function deriveCanonicalVitalsSnapshot(current: CanonicalPveState, revision: number, serverTimeMs: number): CanonicalVitalsSnapshot {
  const caps = resourceCapsForStats(current.progression.stats);
  const combat = { ...(current.pveCombat ?? { guard: PVE_GUARD_MAX, guardBroken: false, hitstunUntil: 0 }) };
  combat.guard = finite(combat.guard, PVE_GUARD_MAX, 0, PVE_GUARD_MAX);
  combat.guardBroken = combat.guardBroken === true;
  combat.hitstunUntil = finite(combat.hitstunUntil, 0, 0, Number.MAX_SAFE_INTEGER);
  return {
    contract: 'pirate-vitals/1', revision, serverTimeMs,
    hp: current.checkpoint.hp, maxHp: caps.maxHp, guard: combat.guard, guardMax: PVE_GUARD_MAX,
    guardBroken: combat.guardBroken, hitstunUntil: combat.hitstunUntil,
    energy: current.checkpoint.energy, maxEnergy: caps.maxEnergy, mp: current.checkpoint.mp, maxMp: caps.maxMp,
    dead: current.checkpoint.hp <= 0,
    ...(current.pveRespawn ? { respawn: current.pveRespawn } : {}),
  };
}

export function applyCanonicalVitalsOperation(
  current: CanonicalPveState,
  operation: PveVitalsOperation,
  context: PveVitalsContext,
): { state: CanonicalPveState; outcome: VitalsOutcome } {
  if (!operation.idempotencyKey || operation.idempotencyKey.length > 128) throw new Error('INVALID_IDEMPOTENCY_KEY');
  const identity = JSON.stringify(operation);
  const prior = current.vitalsReceipts?.find(receipt => receipt.key === operation.idempotencyKey);
  if (prior) {
    if (prior.identity !== identity) throw new Error('IDEMPOTENCY_KEY_REUSED');
    return { state: clone(current), outcome: prior.outcome };
  }
  const record = (state: CanonicalPveState, outcome: VitalsOutcome): { state: CanonicalPveState; outcome: VitalsOutcome } => {
    state.vitalsReceipts = [...(state.vitalsReceipts ?? []), { key: operation.idempotencyKey, identity, outcome }].slice(-256);
    return { state, outcome };
  };
  if (operation.type === 'respawn') {
    if (current.checkpoint.hp > 0) throw new Error('PLAYER_NOT_DEFEATED');
    const state = clone(current);
    const caps = resourceCapsForStats(state.progression.stats);
    const spawn = safeSpawnForIsland(state.checkpoint.islandId);
    state.checkpoint.spawnId = spawn.id; state.checkpoint.islandId = spawn.islandId as typeof state.checkpoint.islandId;
    state.checkpoint.position = { x: spawn.x, y: spawn.y, z: spawn.z }; state.checkpoint.heading = spawn.heading;
    state.checkpoint.hp = caps.maxHp; state.checkpoint.energy = caps.maxEnergy; state.checkpoint.mp = caps.maxMp;
    state.pveCombat = { guard: PVE_GUARD_MAX, guardBroken: false, hitstunUntil: 0 };
    state.pveVitals = defaultPveVitals(context.now);
    state.pveRespawnAtMs = context.now;
    const respawn = { spawnId: spawn.id, islandId: spawn.islandId, x: spawn.x, y: spawn.y, z: spawn.z, heading: spawn.heading, atRevision: context.revision ?? 0 };
    state.pveRespawn = respawn;
    return record(state, { type: 'respawn', changed: true, respawn });
  }
  const state = clone(current);
  const caps = resourceCapsForStats(state.progression.stats);
  const vitals = state.pveVitals ?? defaultPveVitals(context.now);
  vitals.buffCooldowns ??= {};
  vitals.skillCooldowns ??= {};
  if (operation.type === 'potion') {
    const potion = SHOP_POTIONS[operation.potionId];
    if (vitals.potionCooldownUntil > context.now) throw new Error('POTION_COOLDOWN');
    if (state.checkpoint.hp <= 0 || (state.pveCombat?.hitstunUntil ?? 0) > context.now) throw new Error('VITALS_UNAVAILABLE');
    if ((state.inventory.consumables[operation.potionId] ?? 0) < 1) throw new Error('CONSUMABLE_UNAVAILABLE');
    state.inventory.consumables[operation.potionId] -= 1;
    if (potion.kind === 'hp') state.checkpoint.hp = Math.min(caps.maxHp, state.checkpoint.hp + potion.restore);
    else state.checkpoint.mp = Math.min(caps.maxMp, state.checkpoint.mp + potion.restore);
    vitals.potionCooldownUntil = context.now + PVE_POTION_COOLDOWN_MS;
    state.pveVitals = vitals;
    return record(state, { type: operation.potionId, changed: true });
  }
  if (operation.type === 'skill') {
    const skill = resolveTrustedSkillResource(state, operation.skillId);
    if (!skill) throw new Error('INVALID_SKILL');
    const buff = resolveTrustedBuffProfile(state, operation.skillId);
    if (buff) {
      if ((vitals.buffCooldowns[buff.skillId] ?? 0) > context.now) throw new Error('BUFF_COOLDOWN');
      if (state.checkpoint.hp <= 0 || state.checkpoint.mp < buff.energyCost
        || (state.pveCombat?.hitstunUntil ?? 0) > context.now) throw new Error('VITALS_UNAVAILABLE');
      state.checkpoint.mp -= buff.energyCost;
      state.checkpoint.hp = Math.min(caps.maxHp, state.checkpoint.hp + caps.maxHp * buff.healRatio);
      state.checkpoint.mp = Math.min(caps.maxMp, state.checkpoint.mp + buff.mpRestore);
      vitals.buffCooldowns[buff.skillId] = context.now + buff.cooldownMs;
      vitals.buffMultiplier = buff.multiplier; vitals.buffUntil = context.now + buff.durationMs;
      state.pveVitals = vitals;
      return record(state, { type: 'buff', changed: true });
    }
    if ((vitals.skillCooldowns[skill.skillId] ?? 0) > context.now) throw new Error('SKILL_COOLDOWN');
    if (state.checkpoint.hp <= 0 || state.checkpoint.mp < skill.mpCost
      || (state.pveCombat?.hitstunUntil ?? 0) > context.now) throw new Error('VITALS_UNAVAILABLE');
    state.checkpoint.mp -= skill.mpCost;
    vitals.skillCooldowns[skill.skillId] = context.now + skill.cooldownMs;
    state.pveVitals = vitals;
    return record(state, { type: 'skill', changed: true });
  }
  const profile = resolveTrustedBuffProfile(state, operation.skillId);
  if (!profile) throw new Error('INVALID_BUFF_SKILL');
  if ((vitals.buffCooldowns[profile.skillId] ?? 0) > context.now) throw new Error('BUFF_COOLDOWN');
  if (state.checkpoint.hp <= 0 || state.checkpoint.mp < profile.energyCost
    || (state.pveCombat?.hitstunUntil ?? 0) > context.now) throw new Error('VITALS_UNAVAILABLE');
  state.checkpoint.mp -= profile.energyCost;
  state.checkpoint.hp = Math.min(caps.maxHp, state.checkpoint.hp + caps.maxHp * profile.healRatio);
  state.checkpoint.mp = Math.min(caps.maxMp, state.checkpoint.mp + profile.mpRestore);
  vitals.buffCooldowns[profile.skillId] = context.now + profile.cooldownMs;
  vitals.buffMultiplier = profile.multiplier; vitals.buffUntil = context.now + profile.durationMs;
  state.pveVitals = vitals;
  return record(state, { type: 'buff', changed: true });
}

export function defaultPveVitals(now = 0): CanonicalPveVitals {
  return { lastDamageAtMs: now, potionCooldownUntil: 0, buffCooldowns: {}, skillCooldowns: {}, buffMultiplier: 1, buffUntil: 0 };
}

export interface PveSkillResource { skillId: string; mpCost: number; cooldownMs: number; }

/** ค่าทรัพยากรจาก generated skill catalog เดิม; client ส่งได้เพียง skillId */
export function resolveTrustedSkillResource(state: CanonicalPveState, skillId: string): PveSkillResource | null {
  const loadout = state.inventory.loadout;
  const itemId = loadout.activeSet === 'fruit' ? loadout.equippedFruitId
    : loadout.equippedWeaponKind === 'sword' ? loadout.equippedSwordId
      : loadout.equippedWeaponKind === 'gun' ? loadout.equippedGunId : loadout.equippedFightingStyleId;
  if (!itemId) return null;
  const aliases = itemId === 'basic-brawl' || itemId === 'combat' ? ['basic-brawl', 'combat'] : [itemId];
  if (!aliases.some(prefix => skillId.startsWith(`${prefix}-`))) return null;
  const resource = SKILL_RESOURCE_CATALOG[skillId];
  if (!resource) return null;
  const mastery = aliases.map(alias => state.progression.mastery[alias]).find(Boolean);
  const masteryLevel = mastery?.level ?? 1;
  if (masteryLevel < (SKILL_MASTERY_REQUIRED[skillId] ?? 0)) return null;
  if (skillId.includes('-v2-') && loadout.activeSet === 'fruit' && !loadout.fruitAwakened) return null;
  return { skillId, mpCost: resource.mpCost, cooldownMs: resource.cooldownMs };
}

export function resolveTrustedBuffProfile(state: CanonicalPveState, skillId: string): PveBuffProfile | null {
  const fruit = state.inventory.loadout.equippedFruitId;
  if (state.inventory.loadout.activeSet !== 'fruit' || !fruit) return null;
  const resource = resolveTrustedSkillResource(state, skillId);
  const catalog = resource ? SKILL_RESOURCE_CATALOG[skillId] : undefined;
  if (!resource || catalog?.archetype !== 'buff') return null;
  const ultimate = catalog.slot === 'V';
  return { skillId, energyCost: resource.mpCost, cooldownMs: resource.cooldownMs,
    mpRestore: ultimate ? 30 : 18, healRatio: ultimate ? 0.22 : 0.12,
    multiplier: ultimate ? 1.4 : 1.25, durationMs: 8_000 };
}

function safeSpawnForIsland(islandId: string): { id: string; islandId: string; x: number; y: number; z: number; heading: number } {
  const id = (SPAWN_ID_BY_ISLAND as Record<string, string>)[islandId] ?? SPAWN_ID_BY_ISLAND['starter-island'];
  const zone = WORLD_SAFE_ZONES.find(candidate => candidate.id === id && candidate.kind === 'spawn')
    ?? WORLD_SAFE_ZONES.find(candidate => candidate.id === SPAWN_ID_BY_ISLAND['starter-island'])!;
  return { id: zone.id, islandId: zone.islandId, x: zone.x, y: 0, z: zone.z, heading: 0 };
}

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function finite(value: number, fallback: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}
