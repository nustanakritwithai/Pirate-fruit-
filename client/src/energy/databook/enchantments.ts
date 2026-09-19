import type { EnergyEnchantment } from '../types';

export const ENERGY_ENCHANTMENTS: readonly EnergyEnchantment[] = [
  {
    id: 'masterpiece',
    name: 'Masterpiece',
    nameTh: 'Masterpiece',
    effect: 'Removes energy cost for attacks of the enchanted item',
    effectTh: 'ลบค่าใช้ Energy ของอาวุธที่ติด enchant นี้',
  },
] as const;
