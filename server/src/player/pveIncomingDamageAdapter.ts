import { resolvePveIncomingDamage, resourceCapsForStats } from '@pirate-fruit/shared';
import type { CanonicalPlayerState } from './playerState.js';
import type { CanonicalPveVitals } from './vitalsRules.js';

export interface TrustedMonsterPlayerAttack {
  source: 'monster-simulation';
  attackId: string;
  targetId: string;
  damage: number;
  unblockable: boolean;
}

export interface PveCombatState {
  guard: number;
  guardBroken: boolean;
  hitstunUntil: number;
}

export interface PlayerHitReceipt {
  key: string;
  identity: string;
  outcome: { taken: number; guardDamage: number; guardBroke: boolean; defeated: boolean };
}

export type CanonicalPveState = CanonicalPlayerState & {
  pveCombat?: PveCombatState;
  pveVitals?: CanonicalPveVitals;
  vitalsReceipts?: Array<{ key: string; identity: string; outcome: { type: string; changed: boolean; respawn?: unknown } }>;
  playerHitReceipts?: PlayerHitReceipt[];
};

export type CanonicalPlayerHitResult =
  | { ok: true; replay: boolean; state: CanonicalPveState; outcome: PlayerHitReceipt['outcome'] }
  | { ok: false; code: 'INVALID_ATTACK' | 'IDEMPOTENCY_KEY_REUSED' | 'WRONG_TARGET' };

/** Pure canonical transition. The caller must have authenticated and range-checked the attack. */
export function prepareCanonicalPlayerHit(
  current: CanonicalPveState,
  key: string,
  attack: TrustedMonsterPlayerAttack,
  now: number,
  blocking: boolean,
  targetId: string,
): CanonicalPlayerHitResult {
  if (!/^[A-Za-z0-9:_-]{4,128}$/.test(key) || attack.source !== 'monster-simulation'
    || !/^[A-Za-z0-9:_-]{4,128}$/.test(attack.attackId)
    || attack.targetId !== targetId || !Number.isFinite(attack.damage) || attack.damage < 0
    || !Number.isFinite(now)) return { ok: false, code: attack.targetId === targetId ? 'INVALID_ATTACK' : 'WRONG_TARGET' };
  const identity = JSON.stringify([attack.attackId, attack.targetId, attack.damage, attack.unblockable]);
  const prior = current.playerHitReceipts?.find(receipt => receipt.key === key);
  if (prior) {
    if (prior.identity !== identity) return { ok: false, code: 'IDEMPOTENCY_KEY_REUSED' };
    return { ok: true, replay: true, state: clone(current), outcome: prior.outcome };
  }
  const caps = resourceCapsForStats(current.progression.stats);
  const combat = current.pveCombat ?? { guard: 100, guardBroken: false, hitstunUntil: 0 };
  const resolved = resolvePveIncomingDamage({
    hp: current.checkpoint.hp,
    maxHp: caps.maxHp,
    guard: combat.guard,
    guardMax: 100,
    blocking: blocking && !combat.guardBroken && combat.hitstunUntil <= now && current.checkpoint.hp > 0,
    guardBroken: combat.guardBroken,
    hitstunUntil: combat.hitstunUntil,
  }, { amount: attack.damage, unblockable: attack.unblockable }, now);
  const state = clone(current);
  state.checkpoint.hp = resolved.state.hp;
  state.pveCombat = {
    guard: resolved.state.guard,
    guardBroken: resolved.state.guardBroken,
    hitstunUntil: resolved.state.hitstunUntil,
  };
  state.pveVitals = { ...(state.pveVitals ?? {
    lastDamageAtMs: now, potionCooldownUntil: 0, buffCooldowns: {}, buffMultiplier: 1, buffUntil: 0,
  }), lastDamageAtMs: now };
  const outcome = {
    taken: resolved.taken,
    guardDamage: resolved.guardDamage,
    guardBroke: resolved.guardBroke,
    defeated: resolved.defeated,
  };
  state.playerHitReceipts = [...(state.playerHitReceipts ?? []), { key, identity, outcome }].slice(-256);
  return { ok: true, replay: false, state, outcome };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
