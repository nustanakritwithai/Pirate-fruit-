import type { MasteryGrindTip } from '../types';

export const MASTERY_GRIND_TIPS: readonly MasteryGrindTip[] = [
  {
    id: 'first-sea-galley-captains',
    sea: 'first',
    location: 'Fountain City — Galley Captains',
    locationTh: 'Fountain City — Galley Captains',
    target: 'Galley Captains',
    recommended: true,
  },
  {
    id: 'second-sea-ice-admiral',
    sea: 'second',
    location: 'Server hop — Awakened Ice Admiral',
    locationTh: 'วาร์ปเซิร์ฟ — Awakened Ice Admiral',
    target: 'Awakened Ice Admiral',
    recommended: true,
  },
  {
    id: 'third-sea-longma',
    sea: 'third',
    location: 'Server hop — Longma',
    locationTh: 'วาร์ปเซิร์ฟ — Longma',
    target: 'Longma',
    recommended: true,
    notes: 'Recommended over Cake Queen (shorter respawn)',
  },
  {
    id: 'third-sea-cake-queen',
    sea: 'third',
    location: 'Sea of Treats — Cake Queen',
    locationTh: 'Sea of Treats — Cake Queen',
    target: 'Cake Queen',
    notes: 'Highest mastery drop but long respawn',
  },
  {
    id: 'third-sea-chocolate-land',
    sea: 'third',
    location: 'Chocolate Land — Sweet Thief + Candy Rebel',
    locationTh: 'Chocolate Land — Sweet Thief + Candy Rebel',
    target: 'Sweet Thief, Candy Rebel',
    recommended: true,
    notes: 'Fastest enemy grind method per wiki',
  },
] as const;
