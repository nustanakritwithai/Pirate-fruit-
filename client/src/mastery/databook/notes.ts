import type { MasteryNote } from '../types';

export const MASTERY_NOTES: readonly MasteryNote[] = [
  {
    id: 'bonus-applies-all-damage',
    note: 'Mastery bonus stats of the selected weapon apply to all damage types',
    noteTh: 'โบนัสสเตตัสจาก Mastery ของอาวุธที่เลือกมีผลกับดาเมจทุกประเภท',
  },
  {
    id: 'mid-attack-switch',
    note: 'Switching to higher-mastery weapon mid-attack increases damage',
    noteTh: 'สลับไปอาวุธ Mastery สูงกว่ากลางคอมโบเพิ่มดาเมจได้',
  },
  {
    id: 'boss-hop-slower',
    note: 'Server hopping for boss mastery is slower than enemy grinding',
    noteTh: 'วาร์ปเซิร์ฟล่าบอสช้ากว่าฟาร์มศัตรู',
  },
  {
    id: 'unlocks-stronger-moves',
    note: 'Higher mastery unlocks stronger moves on weapons and fruits',
    noteTh: 'Mastery สูงขึ้นปลดสกิลที่แรงขึ้น',
  },
] as const;
