import { resourceCapsForStats, SHOP_POTIONS, type ShopPotionId } from '@pirate-fruit/shared';
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
export const PVE_POTION_COOLDOWN = 1.2;

export interface CanonicalPveVitals {
  timeSinceDamaged: number;
  potionCooldownUntil: number;
  buffCooldowns: Record<string, number>;
  buffMultiplier: number;
  buffUntil: number;
}

export interface PveVitalsContext {
  now: number;
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
}

export interface PveBuffProfile {
  skillId: string;
  energyCost: number;
  mpRestore: number;
  healRatio: number;
  multiplier: number;
  duration: number;
  cooldown: number;
}

export type PveVitalsOperation =
  | { type: 'potion'; potionId: ShopPotionId; idempotencyKey: string }
  | { type: 'buff'; profile: PveBuffProfile; idempotencyKey: string }
  | { type: 'respawn'; idempotencyKey: string };

export function advanceCanonicalVitals(current: CanonicalPveState, context: PveVitalsContext): { state: CanonicalPveState; changed: boolean } {
  const state = clone(current);
  const dt = Math.max(0, Math.min(1_000, context.dtMs)) / 1_000;
  const caps = resourceCapsForStats(state.progression.stats);
  const vitals = state.pveVitals ?? defaultPveVitals();
  const combat = state.pveCombat ?? { guard: PVE_GUARD_MAX, guardBroken: false, hitstunUntil: 0 };
  if (!context.blocking) {
    combat.guard = Math.min(PVE_GUARD_MAX, combat.guard + PVE_GUARD_REGEN * dt);
    if (combat.guardBroken && combat.guard >= PVE_GUARD_REBLOCK_THRESHOLD) combat.guardBroken = false;
  }
  if (state.checkpoint.hp > 0 && !context.mounted && !context.combatActive
    && vitals.timeSinceDamaged > PVE_HP_REGEN_DELAY)
    state.checkpoint.hp = Math.min(caps.maxHp, state.checkpoint.hp + PVE_HP_REGEN_RATE * dt);
  if (context.inWater) {
    state.checkpoint.energy = Math.max(0, state.checkpoint.energy
      - (context.devilFruitUser ? PVE_DEVIL_FRUIT_ENERGY_DRAIN : PVE_WATER_ENERGY_DRAIN) * dt);
    if (state.checkpoint.energy <= 0)
      state.checkpoint.hp = Math.max(0, state.checkpoint.hp
        - (context.devilFruitUser ? PVE_DEVIL_FRUIT_HP_DRAIN : PVE_WATER_HP_DRAIN) * dt);
  } else if (context.sprinting) {
    state.checkpoint.energy = Math.max(0, state.checkpoint.energy - PVE_ENERGY_DRAIN * dt);
  } else {
    state.checkpoint.energy = Math.min(caps.maxEnergy, state.checkpoint.energy + PVE_ENERGY_REGEN * dt);
  }
  state.checkpoint.mp = Math.min(caps.maxMp, state.checkpoint.mp + PVE_MP_REGEN * dt);
  vitals.timeSinceDamaged += dt;
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
  const combat = current.pveCombat ?? { guard: PVE_GUARD_MAX, guardBroken: false, hitstunUntil: 0 };
  return {
    contract: 'pirate-vitals/1', revision, serverTimeMs,
    hp: current.checkpoint.hp, maxHp: caps.maxHp, guard: combat.guard, guardMax: PVE_GUARD_MAX,
    guardBroken: combat.guardBroken, hitstunUntil: combat.hitstunUntil,
    energy: current.checkpoint.energy, maxEnergy: caps.maxEnergy, mp: current.checkpoint.mp, maxMp: caps.maxMp,
    dead: current.checkpoint.hp <= 0,
  };
}

export function applyCanonicalVitalsOperation(
  current: CanonicalPveState,
  operation: PveVitalsOperation,
  context: PveVitalsContext,
): { state: CanonicalPveState; outcome: { type: string; changed: boolean } } {
  if (!operation.idempotencyKey || operation.idempotencyKey.length > 128) throw new Error('INVALID_IDEMPOTENCY_KEY');
  const identity = JSON.stringify(operation);
  const prior = current.vitalsReceipts?.find(receipt => receipt.key === operation.idempotencyKey);
  if (prior) {
    if (prior.identity !== identity) throw new Error('IDEMPOTENCY_KEY_REUSED');
    return { state: clone(current), outcome: prior.outcome };
  }
  const record = (state: CanonicalPveState, outcome: { type: string; changed: boolean }): { state: CanonicalPveState; outcome: { type: string; changed: boolean } } => {
    state.vitalsReceipts = [...(state.vitalsReceipts ?? []), { key: operation.idempotencyKey, identity, outcome }].slice(-256);
    return { state, outcome };
  };
  if (operation.type === 'respawn') {
    if (current.checkpoint.hp > 0) throw new Error('PLAYER_NOT_DEFEATED');
    const state = clone(current);
    const caps = resourceCapsForStats(state.progression.stats);
    state.checkpoint.hp = caps.maxHp; state.checkpoint.energy = caps.maxEnergy; state.checkpoint.mp = caps.maxMp;
    state.pveCombat = { guard: PVE_GUARD_MAX, guardBroken: false, hitstunUntil: 0 };
    state.pveVitals = defaultPveVitals();
    return record(state, { type: 'respawn', changed: true });
  }
  const state = clone(current);
  const caps = resourceCapsForStats(state.progression.stats);
  const vitals = state.pveVitals ?? defaultPveVitals();
  if (operation.type === 'potion') {
    const potion = SHOP_POTIONS[operation.potionId];
    if (vitals.potionCooldownUntil > context.now) throw new Error('POTION_COOLDOWN');
    if (state.checkpoint.hp <= 0 || (state.pveCombat?.hitstunUntil ?? 0) > context.now) throw new Error('VITALS_UNAVAILABLE');
    if ((state.inventory.consumables[operation.potionId] ?? 0) < 1) throw new Error('CONSUMABLE_UNAVAILABLE');
    state.inventory.consumables[operation.potionId] -= 1;
    if (potion.kind === 'hp') state.checkpoint.hp = Math.min(caps.maxHp, state.checkpoint.hp + potion.restore);
    else state.checkpoint.mp = Math.min(caps.maxMp, state.checkpoint.mp + potion.restore);
    vitals.potionCooldownUntil = context.now + PVE_POTION_COOLDOWN;
    state.pveVitals = vitals;
    return record(state, { type: operation.potionId, changed: true });
  }
  const profile = operation.profile;
  if (!profile.skillId || profile.skillId.length > 128 || profile.energyCost < 0 || profile.mpRestore < 0
    || profile.healRatio < 0 || profile.healRatio > 1 || profile.multiplier < 1 || profile.duration <= 0 || profile.cooldown <= 0)
    throw new Error('INVALID_BUFF_PROFILE');
  if ((vitals.buffCooldowns[profile.skillId] ?? 0) > context.now) throw new Error('BUFF_COOLDOWN');
  if (state.checkpoint.hp <= 0 || state.checkpoint.mp < profile.energyCost
    || (state.pveCombat?.hitstunUntil ?? 0) > context.now) throw new Error('VITALS_UNAVAILABLE');
  state.checkpoint.mp -= profile.energyCost;
  state.checkpoint.hp = Math.min(caps.maxHp, state.checkpoint.hp + caps.maxHp * profile.healRatio);
  state.checkpoint.mp = Math.min(caps.maxMp, state.checkpoint.mp + profile.mpRestore);
  vitals.buffCooldowns[profile.skillId] = context.now + profile.cooldown;
  vitals.buffMultiplier = profile.multiplier; vitals.buffUntil = context.now + profile.duration;
  state.pveVitals = vitals;
  return record(state, { type: 'buff', changed: true });
}

export function defaultPveVitals(): CanonicalPveVitals {
  return { timeSinceDamaged: 99, potionCooldownUntil: 0, buffCooldowns: {}, buffMultiplier: 1, buffUntil: 0 };
}

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
