import type { RevivalRule } from '../types';

/** ผลไม้ที่ชุบชีวิตได้ก่อนตายครั้งที่สอง */
export const REVIVAL_RULES: readonly RevivalRule[] = [
  {
    id: 'ghost-fruit',
    name: 'Ghost Fruit',
    nameTh: 'ผล Ghost',
    uses: 1,
    description: 'Resurrects the player once before they can be killed again',
  },
  {
    id: 'pain-fruit',
    name: 'Pain Fruit',
    nameTh: 'ผล Pain',
    uses: 1,
    description: 'Resurrects the player once before they can be killed again',
  },
] as const;
