import type { ExpBoostProduct } from '../types';

/** สินค้า 2x EXP Boost จากร้าน Blox Fruits */
export const EXP_BOOST_PRODUCTS: readonly ExpBoostProduct[] = [
  { id: 'boost-15m', durationMinutes: 15, robux: 25 },
  { id: 'boost-1h', durationMinutes: 60, robux: 99 },
  { id: 'boost-6h', durationMinutes: 360, robux: 450 },
  {
    id: 'boost-12h',
    durationMinutes: 720,
    robux: 850,
    label: 'Most Popular',
    labelTh: 'ยอดนิยม',
  },
  {
    id: 'boost-24h',
    durationMinutes: 1440,
    robux: 1499,
    label: 'Best Value',
    labelTh: 'คุ้มที่สุด',
  },
] as const;
