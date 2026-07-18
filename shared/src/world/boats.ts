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

export const BOAT_WORLD_TICK_MS = 100;
export const BOAT_WORLD_SNAPSHOT_RANGE = 220;
export const BOAT_WORLD_BOUNDARY = 520;
export const BOAT_BOARD_RANGE = 10;
export const BOAT_INPUT_MIN_INTERVAL_MS = 50;
export const BOAT_CANNON_COOLDOWN_MS = 1_800;
export const BOAT_CANNON_RANGE = 42;
export const BOAT_RESPAWN_MS = 15_000;

/** Server-owned dock positions. A summon intent never contains a client position. */
export const BOAT_DOCK_SPAWNS: Record<string, { x: number; z: number; heading: number }> = {
  'starter-island': { x: 4.2, z: -43, heading: Math.PI },
  'mist-jungle': { x: 113, z: -45, heading: Math.PI / 2 },
  'sunscar-desert': { x: 175, z: 75, heading: 0 },
  'azure-frost': { x: 84, z: 190, heading: -Math.PI / 2 },
  'tempest-sky': { x: -71, z: 210, heading: -Math.PI / 2 },
  'ember-volcano': { x: -212, z: 139, heading: Math.PI },
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

export type BoatIntentAction = 'summon' | 'board' | 'disembark' | 'input' | 'fire';

export interface RealtimeBoatIntent {
  type: 'boat-intent';
  intentId: string;
  action: BoatIntentAction;
  entityId?: string;
  throttle?: number;
  steer?: number;
  anchor?: boolean;
  fireSide?: 'port' | 'starboard';
}
