/**
 * State machine ของการต่อสู้ผู้เล่น — PlayerCombat เป็นเจ้าของ state
 * ระบบอื่น (HUD/กล้อง/AI) อ่านผ่าน getter เท่านั้น
 */
export type CombatState =
  | 'idle'
  | 'attack1'
  | 'attack2'
  | 'attack3'
  | 'attack4'
  | 'casting'
  | 'blocking'
  | 'stunned'
  | 'knockback'
  | 'knockdown'
  | 'dead';

export const ATTACK_STATES: CombatState[] = ['attack1', 'attack2', 'attack3', 'attack4'];

export function isAttackState(state: CombatState): boolean {
  return state.startsWith('attack');
}

/** state ที่เริ่มโจมตี M1 ครั้งใหม่ได้ */
export function canStartAttack(state: CombatState): boolean {
  return state === 'idle' || isAttackState(state);
}

/** state ที่เริ่มร่ายสกิลได้ */
export function canCastSkill(state: CombatState): boolean {
  return state === 'idle' || isAttackState(state);
}

/** state ที่ยกโล่ได้ */
export function canBlock(state: CombatState): boolean {
  return state === 'idle' || state === 'blocking';
}

/** state ที่ผู้เล่นควบคุมการเดินไม่ได้เลย */
export function isIncapacitated(state: CombatState): boolean {
  return state === 'stunned' || state === 'knockback' || state === 'knockdown' || state === 'dead';
}
