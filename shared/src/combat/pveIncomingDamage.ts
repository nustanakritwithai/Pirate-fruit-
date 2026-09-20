export interface PveIncomingAttack {
  amount: number;
  unblockable: boolean;
}

export interface PvePlayerCombatState {
  hp: number;
  maxHp: number;
  guard: number;
  guardMax: number;
  blocking: boolean;
  guardBroken: boolean;
  hitstunUntil: number;
}

export interface PveIncomingDamageResult {
  state: PvePlayerCombatState;
  taken: number;
  guardDamage: number;
  guardBroke: boolean;
  defeated: boolean;
}

/** Pure PvE hit transition shared by the client and the trusted server adapter. */
export function resolvePveIncomingDamage(
  current: PvePlayerCombatState,
  attack: PveIncomingAttack,
  now: number,
  guardDamageFactor = 1.4,
  blockedDamageRatio = 0.25,
  guardBreakStunMs = 1_600,
): PveIncomingDamageResult {
  const amount = Number.isFinite(attack.amount) ? Math.max(0, attack.amount) : 0;
  const state: PvePlayerCombatState = {
    ...current,
    hp: Math.max(0, Math.min(current.maxHp, current.hp)),
    guard: Math.max(0, Math.min(current.guardMax, current.guard)),
    hitstunUntil: Math.max(0, current.hitstunUntil),
  };
  let taken = amount;
  let guardDamage = 0;
  let guardBroke = false;
  if (state.blocking && !attack.unblockable) {
    guardDamage = amount * guardDamageFactor;
    state.guard = Math.max(0, state.guard - guardDamage);
    taken = amount * blockedDamageRatio;
    if (state.guard <= 0) {
      state.guardBroken = true;
      state.hitstunUntil = Math.max(state.hitstunUntil, now + guardBreakStunMs);
      guardBroke = true;
    }
  }
  state.hp = Math.max(0, state.hp - taken);
  return { state, taken, guardDamage, guardBroke, defeated: state.hp <= 0 };
}
