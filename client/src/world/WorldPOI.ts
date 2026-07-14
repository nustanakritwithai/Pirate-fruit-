import type { IslandId } from '../island/IslandTypes';

export interface WorldPOI {
  id: string;
  islandId: IslandId;
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
    islandId: 'starter-island',
    name: 'หมู่บ้านโจรสลัด',
    icon: '◆',
    x: 0,
    z: 8,
    safeRadius: 18,
  },
  harbor: {
    id: 'starter-harbor',
    islandId: 'starter-island',
    name: 'ท่าเรือ',
    icon: '⚓',
    x: 0,
    z: -31,
    safeRadius: 10,
  },
  trainingBeach: {
    id: 'training-beach',
    islandId: 'starter-island',
    name: 'หาดฝึกฝน',
    icon: '⚔',
    x: -31,
    z: -8,
    safeRadius: 8,
  },
  fruitGrove: {
    id: 'fruit-grove',
    islandId: 'starter-island',
    name: 'สวนผลไม้ลึกลับ',
    icon: '●',
    x: 29,
    z: 10,
    safeRadius: 9,
  },
  hillShrine: {
    id: 'hill-shrine',
    islandId: 'starter-island',
    name: 'ศาลาบนเนิน',
    icon: '▲',
    x: 0,
    z: 31,
    safeRadius: 7,
  },
} as const satisfies Record<string, WorldPOI>;

export const WORLD_POI_LIST: WorldPOI[] = Object.values(WORLD_POIS);

/** จุดสำคัญของเกาะที่สอง ใช้กับมินิแมพ การกระจายฉาก และจุดหมายภารกิจ */
export const MIST_JUNGLE_POIS = {
  expeditionCamp: {
    id: 'mist-jungle-camp',
    islandId: 'mist-jungle',
    name: 'ค่ายนักสำรวจ',
    icon: '◆',
    x: 153,
    z: -40,
    safeRadius: 11,
  },
  harbor: {
    id: 'mist-jungle-harbor',
    islandId: 'mist-jungle',
    name: 'ท่าเรือพงไพรหมอก',
    icon: '⚓',
    x: 137,
    z: -40,
    safeRadius: 8,
  },
  banditCamp: {
    id: 'jungle-bandit-camp',
    islandId: 'mist-jungle',
    name: 'ค่ายโจรป่า',
    icon: '⚔',
    x: 170,
    z: -58,
    safeRadius: 8,
  },
  ruins: {
    id: 'ancient-ruins',
    islandId: 'mist-jungle',
    name: 'ซากวิหารโบราณ',
    icon: '▦',
    x: 179,
    z: -31,
    safeRadius: 9,
  },
  guardianTerrace: {
    id: 'guardian-terrace',
    islandId: 'mist-jungle',
    name: 'ลานผู้พิทักษ์',
    icon: '◇',
    x: 192,
    z: -45,
    safeRadius: 8,
  },
  bossArena: {
    id: 'venom-ape-arena',
    islandId: 'mist-jungle',
    name: 'ถ้ำวานรพิษ',
    icon: '▲',
    x: 190,
    z: -18,
    safeRadius: 10,
  },
} as const satisfies Record<string, WorldPOI>;

export const MIST_JUNGLE_POI_LIST: WorldPOI[] = Object.values(MIST_JUNGLE_POIS);

/** จุดสำคัญของเกาะที่สาม: เมืองคาราวาน โอเอซิส เหมือง และพีระมิด */
export const SUNSCAR_DESERT_POIS = {
  caravanCity: {
    id: 'sunscar-caravan-city',
    islandId: 'sunscar-desert',
    name: 'นครคาราวานสุริยะ',
    icon: '◆',
    x: 170,
    z: 100,
    safeRadius: 12,
  },
  harbor: {
    id: 'sunscar-desert-harbor',
    islandId: 'sunscar-desert',
    name: 'ท่าเรือทะเลทรายสุริยะ',
    icon: '⚓',
    x: 170,
    z: 94,
    safeRadius: 8,
  },
  oasis: {
    id: 'sunscar-oasis',
    islandId: 'sunscar-desert',
    name: 'โอเอซิสกระจกฟ้า',
    icon: '●',
    x: 154,
    z: 120,
    safeRadius: 9,
  },
  raiderCamp: {
    id: 'sunscar-raider-camp',
    islandId: 'sunscar-desert',
    name: 'ค่ายโจรทะเลทราย',
    icon: '⚔',
    x: 148,
    z: 142,
    safeRadius: 8,
  },
  quarry: {
    id: 'sunscar-quarry',
    islandId: 'sunscar-desert',
    name: 'เหมืองโกเลมทราย',
    icon: '◇',
    x: 191,
    z: 141,
    safeRadius: 9,
  },
  pyramid: {
    id: 'sunscar-pyramid',
    islandId: 'sunscar-desert',
    name: 'พีระมิดสุริยะ',
    icon: '▲',
    x: 170,
    z: 157,
    safeRadius: 11,
  },
} as const satisfies Record<string, WorldPOI>;

export const SUNSCAR_DESERT_POI_LIST: WorldPOI[] = Object.values(SUNSCAR_DESERT_POIS);

/** จุดสำคัญของเกาะที่สี่: หมู่บ้าน ทะเลสาบน้ำแข็ง เหมืองคริสตัล และป้อมราชัน */
export const AZURE_FROST_POIS = {
  hunterVillage: { id: 'azure-frost-village', islandId: 'azure-frost', name: 'หมู่บ้านนักล่าเหมันต์', icon: '◆', x: 59, z: 201, safeRadius: 12 },
  harbor: { id: 'azure-frost-harbor', islandId: 'azure-frost', name: 'ท่าเรือเหมันต์คราม', icon: '⚓', x: 66, z: 190, safeRadius: 8 },
  frozenLake: { id: 'azure-frozen-lake', islandId: 'azure-frost', name: 'ทะเลสาบกระจกเยือกแข็ง', icon: '●', x: 29, z: 195, safeRadius: 9 },
  raiderCamp: { id: 'azure-raider-camp', islandId: 'azure-frost', name: 'ค่ายโจรน้ำแข็ง', icon: '⚔', x: 11, z: 218, safeRadius: 8 },
  crystalMine: { id: 'azure-crystal-mine', islandId: 'azure-frost', name: 'เหมืองคริสตัลคราม', icon: '◇', x: 47, z: 236, safeRadius: 9 },
  frostCitadel: { id: 'azure-frost-citadel', islandId: 'azure-frost', name: 'ป้อมราชันน้ำแข็ง', icon: '▲', x: 20, z: 249, safeRadius: 11 },
} as const satisfies Record<string, WorldPOI>;

export const AZURE_FROST_POI_LIST: WorldPOI[] = Object.values(AZURE_FROST_POIS);

/** จุดสำคัญของเกาะที่ห้า: นครหน้าผา สวนเมฆ โรงตีพายุ และวิหารยอดเกาะ */
export const TEMPEST_SKY_POIS = {
  cliffVillage: { id: 'tempest-cliff-village', islandId: 'tempest-sky', name: 'หมู่บ้านหน้าผานภา', icon: '◆', x: -96, z: 210, safeRadius: 12 },
  harbor: { id: 'tempest-sky-harbor', islandId: 'tempest-sky', name: 'ท่าเรือนภาวายุ', icon: '⚓', x: -99, z: 210, safeRadius: 8 },
  cloudGarden: { id: 'tempest-cloud-garden', islandId: 'tempest-sky', name: 'สวนเมฆลอย', icon: '●', x: -124, z: 190, safeRadius: 9 },
  raiderCamp: { id: 'tempest-raider-camp', islandId: 'tempest-sky', name: 'ค่ายโจรเวหา', icon: '⚔', x: -145, z: 207, safeRadius: 8 },
  stormForge: { id: 'tempest-storm-forge', islandId: 'tempest-sky', name: 'โรงตีผลึกพายุ', icon: '◇', x: -124, z: 232, safeRadius: 9 },
  skyTemple: { id: 'tempest-sky-temple', islandId: 'tempest-sky', name: 'วิหารเจ้าแห่งพายุ', icon: '▲', x: -153, z: 241, safeRadius: 11 },
} as const satisfies Record<string, WorldPOI>;

export const TEMPEST_SKY_POI_LIST: WorldPOI[] = Object.values(TEMPEST_SKY_POIS);
export const ALL_WORLD_POI_LIST: WorldPOI[] = [
  ...WORLD_POI_LIST,
  ...MIST_JUNGLE_POI_LIST,
  ...SUNSCAR_DESERT_POI_LIST,
  ...AZURE_FROST_POI_LIST,
  ...TEMPEST_SKY_POI_LIST,
];
