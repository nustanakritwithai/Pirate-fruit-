/** S17 — canonical naval tuning shared by the authoritative server and render client. */
export interface AuthoritativeBoatDefinition {
  id: string;
  maxSpeed: number;
  acceleration: number;
  reverseSpeed: number;
  turnSpeed: number;
  drag: number;
  maxHp: number;
  collisionRadius: number;
  cannonDamage: number;
}

export const AUTHORITATIVE_BOAT_DEFINITIONS: Record<string, AuthoritativeBoatDefinition> = {
  'training-dinghy': { id: 'training-dinghy', maxSpeed: 9, acceleration: 4.8, reverseSpeed: 3.2, turnSpeed: 1.35, drag: 0.72, maxHp: 130, collisionRadius: 2.6, cannonDamage: 18 },
  'swift-sloop': { id: 'swift-sloop', maxSpeed: 14, acceleration: 6.2, reverseSpeed: 3.8, turnSpeed: 1.55, drag: 0.58, maxHp: 100, collisionRadius: 3, cannonDamage: 22 },
  'merchant-brig': { id: 'merchant-brig', maxSpeed: 11, acceleration: 3.8, reverseSpeed: 2.8, turnSpeed: 0.95, drag: 0.48, maxHp: 360, collisionRadius: 4.8, cannonDamage: 30 },
  'war-galleon': { id: 'war-galleon', maxSpeed: 9, acceleration: 2.8, reverseSpeed: 2.2, turnSpeed: 0.68, drag: 0.42, maxHp: 720, collisionRadius: 6.5, cannonDamage: 42 },
  'viking-raider': { id: 'viking-raider', maxSpeed: 13, acceleration: 4.5, reverseSpeed: 3, turnSpeed: 1.05, drag: 0.5, maxHp: 440, collisionRadius: 5.2, cannonDamage: 34 },
};

/** กติกาเศรษฐกิจเรือที่ใช้ร่วมกันระหว่างหน้าจอและ canonical server state */
export type BoatUpgradeKind = 'hull' | 'cannon' | 'sail';

export interface BoatProgressionDefinition {
  id: string;
  name: string;
  cargoCapacity: number;
  price: number;
  upgradeCosts: Readonly<Record<BoatUpgradeKind, readonly number[]>>;
}

export const BOAT_PROGRESSION_DEFINITIONS: Readonly<Record<string, BoatProgressionDefinition>> = {
  'training-dinghy': { id: 'training-dinghy', name: 'เรือพายฝึกหัด', cargoCapacity: 8, price: 0, upgradeCosts: { hull: [250, 500, 900], cannon: [300, 650], sail: [220, 450] } },
  'swift-sloop': { id: 'swift-sloop', name: 'เรือใบวายุ', cargoCapacity: 12, price: 500, upgradeCosts: { hull: [400, 800, 1400], cannon: [450, 900, 1600], sail: [350, 700] } },
  'merchant-brig': { id: 'merchant-brig', name: 'เรือพาณิชย์คาราวาน', cargoCapacity: 24, price: 2400, upgradeCosts: { hull: [900, 1600, 2600], cannon: [800, 1500, 2600], sail: [700, 1300] } },
  'war-galleon': { id: 'war-galleon', name: 'เรือรบแกลเลียน', cargoCapacity: 32, price: 6500, upgradeCosts: { hull: [1800, 3200, 5200], cannon: [1600, 3000, 4800], sail: [1200, 2400] } },
  'viking-raider': { id: 'viking-raider', name: 'เรือจู่โจมไวกิ้ง', cargoCapacity: 20, price: 4200, upgradeCosts: { hull: [1100, 1900, 3200], cannon: [900, 1700, 2800], sail: [750, 1400] } },
};

export const BOAT_WORLD_TICK_MS = 100;
export const BOAT_WORLD_SNAPSHOT_RANGE = 220;
export const BOAT_WORLD_BOUNDARY = 704;
export const BOAT_BOARD_RANGE = 10;
export const BOAT_INPUT_MIN_INTERVAL_MS = 50;
export const BOAT_CANNON_COOLDOWN_MS = 1_800;
export const BOAT_CANNON_RANGE = 42;
export const BOAT_RESPAWN_MS = 15_000;

/** Server-owned dock positions. A summon intent never contains a client position. */
export const BOAT_DOCK_SPAWNS: Record<string, { x: number; z: number; heading: number }> = {
  'starter-island': { x: 4.2, z: -43, heading: Math.PI },
  'mist-jungle': { x: 113, z: -125, heading: Math.PI / 2 },
  'sunscar-desert': { x: 365, z: -90, heading: 0 },
  'azure-frost': { x: 549, z: 90, heading: -Math.PI / 2 },
  'tempest-sky': { x: 484, z: 330, heading: -Math.PI / 2 },
  'ember-volcano': { x: 243, z: 539, heading: Math.PI },
};

/** Unit vectors from each harbor into navigable water, independent of visual heading. */
export const BOAT_DOCK_OFFSHORE_DIRECTIONS: Record<string, { x: number; z: number }> = {
  'starter-island': { x: 0, z: -1 },
  'mist-jungle': { x: -1, z: 0 },
  'sunscar-desert': { x: 0, z: -1 },
  'azure-frost': { x: 1, z: 0 },
  'tempest-sky': { x: 1, z: 0 },
  'ember-volcano': { x: 0, z: 1 },
};

export type BoatWorldState = 'docked' | 'sailing' | 'sunk' | 'respawning';

export interface BoatWorldSnapshot {
  entityId: string;
  ownerId: string;
  definitionId: string;
  islandId: string;
  x: number;
  z: number;
  heading: number;
  speed: number;
  hp: number;
  maxHp: number;
  anchor: boolean;
  state: BoatWorldState;
  helmId?: string;
  passengerIds: string[];
  respawnAt?: number;
}

export type BoatIntentAction = 'summon' | 'board' | 'take-helm' | 'leave-helm' | 'disembark' | 'input' | 'fire';

export interface RealtimeBoatIntent {
  type: 'boat-intent';
  intentId: string;
  action: BoatIntentAction;
  entityId?: string;
  throttle?: number;
  steer?: number;
  anchor?: boolean;
  /** One-shot request to engage the boat's server-authoritative speed boost. */
  boost?: boolean;
  fireSide?: 'port' | 'starboard';
}
