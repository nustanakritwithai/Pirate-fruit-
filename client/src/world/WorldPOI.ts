export interface WorldPOI {
  id: string;
  name: string;
  icon: string;
  x: number;
  z: number;
  safeRadius: number;
}

/** จุดสำคัญบนเกาะแรก ใช้ร่วมกันทั้งการสร้างฉาก มินิแมพ NPC และระบบเกิด */
export const WORLD_POIS = {
  village: {
    id: 'starter-village',
    name: 'หมู่บ้านโจรสลัด',
    icon: '◆',
    x: 0,
    z: 8,
    safeRadius: 18,
  },
  harbor: {
    id: 'starter-harbor',
    name: 'ท่าเรือ',
    icon: '⚓',
    x: 0,
    z: -31,
    safeRadius: 10,
  },
  trainingBeach: {
    id: 'training-beach',
    name: 'หาดฝึกฝน',
    icon: '⚔',
    x: -31,
    z: -8,
    safeRadius: 8,
  },
  fruitGrove: {
    id: 'fruit-grove',
    name: 'สวนผลไม้ลึกลับ',
    icon: '●',
    x: 29,
    z: 10,
    safeRadius: 9,
  },
  hillShrine: {
    id: 'hill-shrine',
    name: 'ศาลาบนเนิน',
    icon: '▲',
    x: 0,
    z: 31,
    safeRadius: 7,
  },
} as const satisfies Record<string, WorldPOI>;

export const WORLD_POI_LIST: WorldPOI[] = Object.values(WORLD_POIS);
