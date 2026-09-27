import { HEALTH_SYSTEM_CONFIG } from './databook/config';

/**
 * HP สูงสุดจาก Defense stat
 * สูตร Blox Fruits: 5 × (S + 19) โดย S = แต้ม Defense
 */
export function maxHealthFromDefense(defensePoints: number): number {
  const defense = Math.max(1, Math.floor(defensePoints));
  return (
    HEALTH_SYSTEM_CONFIG.healthPerDefensePoint *
    (defense + HEALTH_SYSTEM_CONFIG.defenseFormulaOffset)
  );
}

/** HP รวมหลังบวกโบนัสจากอุปกรณ์/บัฟ */
export function totalMaxHealth(defensePoints: number, bonusHp = 0): number {
  return maxHealthFromDefense(defensePoints) + Math.max(0, Math.floor(bonusHp));
}

/** ลดดาเมจด้วย Full Body Aura (30%) ก่อนหัก HP */
export function applyAuraDamageReduction(
  incomingDamage: number,
  hasFullBodyAura: boolean,
): number {
  const damage = Math.max(0, incomingDamage);
  if (!hasFullBodyAura) return damage;
  const reduction = HEALTH_SYSTEM_CONFIG.auraDamageReductionPercent;
  return Math.floor(damage * (1 - reduction));
}

/** คำนวณดาเมจที่หักจาก HP หลังลดด้วย Aura */
export function damageToHealth(
  incomingDamage: number,
  hasFullBodyAura: boolean,
): number {
  return applyAuraDamageReduction(incomingDamage, hasFullBodyAura);
}

/** ตรวจว่าผู้เล่นตาย (HP = 0) */
export function isDead(currentHp: number): boolean {
  return currentHp <= 0;
}

/** คลัมป์ HP ปัจจุบันให้อยู่ในช่วง [0, max] */
export function clampHealth(currentHp: number, maxHp: number): number {
  const max = Math.max(1, maxHp);
  return Math.max(0, Math.min(max, Math.floor(currentHp)));
}

/** เปอร์เซ็นต์ HP ปัจจุบัน (0–1) */
export function healthFraction(currentHp: number, maxHp: number): number {
  const max = Math.max(1, maxHp);
  return clampHealth(currentHp, max) / max;
}

/** ตรวจเงื่อนไข Title รอดชีวิต */
export function qualifiesForSurvivalTitle(
  titleId: 'undefeated-one' | 'immortal-being',
  hpAfterDamage: number,
  damageFromPlayer: boolean,
): boolean {
  if (!damageFromPlayer) return false;
  if (titleId === 'immortal-being') return hpAfterDamage === 1;
  return hpAfterDamage > 0 && hpAfterDamage < 50;
}

/** ความเร็ว mobility [F] ตามสัดส่วน HP (prototype 0.5–1.5×) */
export function mobilitySpeedMultiplier(
  currentHp: number,
  maxHp: number,
  scaling: 'higher-health-faster' | 'lower-health-faster',
): number {
  const fraction = healthFraction(currentHp, maxHp);
  if (scaling === 'higher-health-faster') {
    return 0.5 + fraction;
  }
  return 1.5 - fraction;
}
