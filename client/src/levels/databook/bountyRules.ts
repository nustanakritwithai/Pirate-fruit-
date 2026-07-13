import type { BountyLevelRule } from '../types';

/** กฎเลเวลที่เกี่ยวกับ Bounty/Honor และ PvP */
export const BOUNTY_LEVEL_RULES: readonly BountyLevelRule[] = [
  {
    id: 'pvp-unlock',
    description: 'PvP unlocks at Level 20',
    descriptionTh: 'ปลดล็อก PvP ที่เลเวล 20',
  },
  {
    id: 'pvp-reenable',
    description: 'PvP auto re-enables 15 minutes after PvP death unless toggled manually',
    descriptionTh: 'PvP เปิดอัตโนมัติอีกครั้ง 15 นาทีหลังตายใน PvP',
  },
  {
    id: 'max-level-bounty-range',
    description: 'At Lv. 2800, Bounty only from players within 25% level range (Lv. 2100+)',
    descriptionTh: 'เลเวล 2800 ได้ Bounty จากผู้เล่นเลเวล 2100+ เท่านั้น (ช่วง 25%)',
  },
  {
    id: 'bounty-boss-cap',
    description: 'Players with 2.5M+ Bounty/Honor cannot gain more from bosses',
    descriptionTh: 'Bounty/Honor 2.5M+ ไม่ได้เพิ่มจากบอส',
  },
  {
    id: 'bounty-enemy-cap',
    description: 'Players with 250K+ Bounty/Honor cannot gain more from enemies',
    descriptionTh: 'Bounty/Honor 250K+ ไม่ได้เพิ่มจากศัตรู',
  },
  {
    id: 'bounty-max',
    description: 'Maximum Bounty/Honor is 30M',
    descriptionTh: 'Bounty/Honor สูงสุด 30M',
  },
] as const;
