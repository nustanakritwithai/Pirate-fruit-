import type { EnergyActionRule } from '../types';

/** การกระทำที่ไม่กิน Energy (ยกเว้นบางรายการ) */
export const ENERGY_NO_DRAIN_ACTIONS: readonly EnergyActionRule[] = [
  {
    id: 'normal-m1',
    name: 'Normal M1 attacks',
    nameTh: 'M1 ปกติ (หมัด/ดาบ/ปืน)',
    drainsEnergy: false,
    notes: 'Kicking, punching, sword swings, gun shots',
  },
  {
    id: 'race-v3-v4',
    name: 'Race V3/V4 abilities',
    nameTh: 'สกิล Race V3/V4',
    drainsEnergy: false,
  },
  {
    id: 'summon-sea-beast',
    name: 'Summon Sea Beast',
    nameTh: 'Summon Sea Beast',
    drainsEnergy: false,
  },
  {
    id: 'admin-abilities',
    name: 'Admin Abilities',
    nameTh: 'Admin Abilities',
    drainsEnergy: false,
  },
] as const;

/** ข้อยกเว้นที่ M1 กิน Energy */
export const ENERGY_DRAIN_EXCEPTIONS: readonly EnergyActionRule[] = [
  { id: 'skull-guitar', name: 'Skull Guitar', nameTh: 'Skull Guitar', drainsEnergy: true },
  { id: 'rubber', name: 'Rubber', nameTh: 'Rubber', drainsEnergy: true },
  { id: 'dough-v2', name: 'Dough (V2)', nameTh: 'Dough (V2)', drainsEnergy: true },
  { id: 'phoenix-v2', name: 'Phoenix (V2)', nameTh: 'Phoenix (V2)', drainsEnergy: true },
  { id: 'diamond-m1', name: 'Diamond M1', nameTh: 'Diamond M1', drainsEnergy: true },
] as const;
