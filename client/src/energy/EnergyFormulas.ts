import { ENERGY_SYSTEM_CONFIG } from './databook/config';

/**
 * Energy สูงสุดจาก Melee stat
 * สูตร Blox Fruits: 5 × (S + 19) โดย S = แต้ม Melee
 */
export function maxEnergyFromMelee(meleePoints: number): number {
  const melee = Math.max(1, Math.floor(meleePoints));
  return (
    ENERGY_SYSTEM_CONFIG.energyPerMeleePoint *
    (melee + ENERGY_SYSTEM_CONFIG.meleeFormulaOffset)
  );
}

/** Energy รวมหลังบวกโบนัสจากอุปกรณ์/บัฟ */
export function totalMaxEnergy(meleePoints: number, bonusEnergy = 0): number {
  return maxEnergyFromMelee(meleePoints) + Math.max(0, Math.floor(bonusEnergy));
}

/** ตรวจว่าใช้สกิลได้ตาม Energy ที่มี */
export function canAffordEnergyCost(currentEnergy: number, cost: number): boolean {
  return currentEnergy >= Math.max(0, Math.floor(cost));
}

/** ข้อความ Low energy ตาม wiki */
export function lowEnergyMessage(requiredCost: number): string {
  return ENERGY_SYSTEM_CONFIG.lowEnergyMessageTemplate.replace(
    '{cost}',
    String(Math.max(0, Math.floor(requiredCost))),
  );
}

/** ค่าใช้ Energy ของ Dash ตาม race */
export function dashEnergyCost(raceId?: string): number {
  if (raceId === 'rabbit') {
    return ENERGY_SYSTEM_CONFIG.rabbitDashEnergyCost;
  }
  return ENERGY_SYSTEM_CONFIG.dashEnergyCost;
}

/** คลัมป์ Energy ปัจจุบัน */
export function clampEnergy(currentEnergy: number, maxEnergy: number): number {
  const max = Math.max(1, maxEnergy);
  return Math.max(0, Math.min(max, Math.floor(currentEnergy)));
}

/** เปอร์เซ็นต์ Energy (0–1) */
export function energyFraction(currentEnergy: number, maxEnergy: number): number {
  const max = Math.max(1, maxEnergy);
  return clampEnergy(currentEnergy, max) / max;
}

/** ตัวคูณฟื้น Energy บนพื้น vs กลางอากาศ (prototype) */
export function energyRegenRateMultiplier(onGround: boolean): number {
  return onGround ? ENERGY_SYSTEM_CONFIG.groundRegenMultiplier : 1;
}

/** ตรวจว่า Energy หมด */
export function isEnergyDepleted(currentEnergy: number): boolean {
  return currentEnergy <= 0;
}
