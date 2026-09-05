import type { MobilityScalingRule } from '../types';

/** สกิล [F] ที่ความเร็วขึ้นกับ HP ปัจจุบัน */
export const MOBILITY_HEALTH_SCALING: readonly MobilityScalingRule[] = [
  {
    id: 'faster-with-high-health',
    scaling: 'higher-health-faster',
    moveKey: 'F',
    fruitIds: ['flame', 'ice', 'spider', 'light', 'eagle'],
    description: '[F] mobility moves go faster with higher health',
    descriptionTh: 'สกิล [F] เร็วขึ้นเมื่อ HP สูง',
  },
  {
    id: 'faster-with-low-health',
    scaling: 'lower-health-faster',
    moveKey: 'F',
    fruitIds: ['blade', 'sound', 'venom', 'gas'],
    description: '[F] mobility moves go faster with lower health',
    descriptionTh: 'สกิล [F] เร็วขึ้นเมื่อ HP ต่ำ',
  },
] as const;
