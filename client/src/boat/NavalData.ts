/**
 * เรือ Phase 2 — ข้อมูล Naval Combat: เรือโจรสลัด AI + กระสุนปืนใหญ่ (pure, ทดสอบได้)
 */

import { WATER_LEVEL } from '../ocean/Ocean';

export interface EnemyShipDefinition {
  id: string;
  name: string;
  tier: EnemyShipTier;
  level: number;
  maxHp: number;
  cruiseSpeed: number;
  chaseSpeed: number;
  turnSpeed: number;
  /** ระยะเริ่มไล่ล่า */
  aggroRange: number;
  /** ระยะยิงปืนใหญ่ */
  fireRange: number;
  fireCooldown: number;
  cannonDamage: number;
  /** รัศมีตัวเรือสำหรับเช็คโดนกระสุน */
  hitRadius: number;
  patrolRadius: number;
  reward: { coins: number; exp: number };
  /** สีตัวเรือ (ใช้กับ createBoatModel) */
  color: number;
  length: number;
  width: number;
  cannonsPerSide: number;
  modelId: EnemyShipModelId;
  deckTopLocalY: number;
}

export type EnemyShipTier = 'skiff' | 'cutter' | 'brig' | 'galleon';
export type EnemyShipModelId = 'boat' | 'small-ship' | 'sail-ship' | 'ship';

export const PIRATE_SKIFF: EnemyShipDefinition = {
  id: 'pirate-skiff',
  name: 'เรือโจรฝึกหัด',
  tier: 'skiff',
  level: 4,
  maxHp: 120,
  cruiseSpeed: 3.8,
  chaseSpeed: 7.8,
  turnSpeed: 1.15,
  aggroRange: 48,
  fireRange: 22,
  fireCooldown: 4.8,
  cannonDamage: 8,
  hitRadius: 2.7,
  patrolRadius: 22,
  reward: { coins: 70, exp: 45 },
  color: 0x6a4932,
  length: 5.2,
  width: 2.1,
  cannonsPerSide: 1,
  modelId: 'boat',
  deckTopLocalY: 0.88,
};

export const PIRATE_CUTTER: EnemyShipDefinition = {
  id: 'pirate-cutter',
  name: 'เรือโจรสลัดหนวดดำ',
  tier: 'cutter',
  level: 8,
  maxHp: 220,
  cruiseSpeed: 3.2,
  chaseSpeed: 7.5,
  turnSpeed: 0.85,
  aggroRange: 55,
  fireRange: 26,
  fireCooldown: 3.2,
  cannonDamage: 14,
  hitRadius: 3.4,
  patrolRadius: 22,
  reward: { coins: 140, exp: 90 },
  color: 0x3b3b46,
  length: 6.4,
  width: 2.4,
  cannonsPerSide: 2,
  modelId: 'small-ship',
  deckTopLocalY: 1.08,
};

export const PIRATE_BRIG: EnemyShipDefinition = {
  id: 'pirate-brig',
  name: 'เรือโจรโจมตีหนัก',
  tier: 'brig',
  level: 25,
  maxHp: 520,
  cruiseSpeed: 2.9,
  chaseSpeed: 6.4,
  turnSpeed: 0.65,
  aggroRange: 70,
  fireRange: 38,
  fireCooldown: 4.3,
  cannonDamage: 23,
  hitRadius: 4.8,
  patrolRadius: 42,
  reward: { coins: 360, exp: 260 },
  color: 0x6d4250,
  length: 10.5,
  width: 4.1,
  cannonsPerSide: 3,
  modelId: 'sail-ship',
  deckTopLocalY: 1.18,
};

export const PIRATE_GALLEON: EnemyShipDefinition = {
  id: 'pirate-galleon',
  name: 'เรือรบโจรสลัดชั้นยอด',
  tier: 'galleon',
  level: 50,
  maxHp: 950,
  cruiseSpeed: 2.5,
  chaseSpeed: 5.5,
  turnSpeed: 0.48,
  aggroRange: 85,
  fireRange: 48,
  fireCooldown: 5,
  cannonDamage: 36,
  hitRadius: 6.5,
  patrolRadius: 52,
  reward: { coins: 900, exp: 700 },
  color: 0x3f3240,
  length: 15,
  width: 5.8,
  cannonsPerSide: 5,
  modelId: 'ship',
  deckTopLocalY: 1.35,
};

export const PIRATE_SHIP_TIERS: readonly EnemyShipDefinition[] = [
  PIRATE_SKIFF,
  PIRATE_CUTTER,
  PIRATE_BRIG,
  PIRATE_GALLEON,
];

export interface PirateSpawnPoint {
  x: number;
  z: number;
  tier: EnemyShipTier;
}

/** จุดลอยลำในทะเลเปิด — เรือระดับสูงอยู่ไกลเกาะและต้องออกเรือสำรวจจึงจะเจอ */
export const PIRATE_SPAWNS: readonly PirateSpawnPoint[] = [
  // รอบเกาะเริ่มต้น — ลำเล็ก เหมาะสำหรับเริ่มเรียนรู้ naval combat
  { x: 100, z: -110, tier: 'skiff' },
  { x: -100, z: 70, tier: 'skiff' },
  { x: 90, z: 120, tier: 'skiff' },
  { x: -120, z: -120, tier: 'skiff' },
  // ช่องทะเลช่วงกลางระหว่างเกาะ Lv.15-50
  { x: 250, z: -210, tier: 'cutter' },
  { x: 300, z: -90, tier: 'cutter' },
  { x: 210, z: 50, tier: 'cutter' },
  { x: 310, z: 130, tier: 'cutter' },
  // เส้นทางไปเกาะท้าย — เรือโจมตีหนักเริ่มยิง broadside หลายกระบอก
  { x: 330, z: -190, tier: 'brig' },
  { x: 430, z: 80, tier: 'brig' },
  { x: 400, z: 230, tier: 'brig' },
  { x: 340, z: 360, tier: 'brig' },
  // ทะเลชั้นสูงรอบเกาะ Lv.71-110
  { x: 620, z: 80, tier: 'galleon' },
  { x: 570, z: 300, tier: 'galleon' },
  { x: 430, z: 500, tier: 'galleon' },
  { x: 110, z: 580, tier: 'galleon' },
];

/** ตายแล้วเกิดใหม่ใน (วินาที) */
export const SHIP_RESPAWN_SECONDS = 35;

// ---------------------------------------------------------------
// กระสุนปืนใหญ่ — วิถีโค้งมีแรงโน้มถ่วง
// ---------------------------------------------------------------

export const CANNONBALL_SPEED = 24;
export const CANNONBALL_GRAVITY = 14;
export const CANNONBALL_LIFETIME = 6;
/** ดาเมจปืนใหญ่ฝั่งผู้เล่นต่อนัด */
export const PLAYER_CANNON_DAMAGE = 42;
/** คูลดาวน์ยิงชุด (broadside) ของผู้เล่น */
export const PLAYER_FIRE_COOLDOWN = 2.4;

export interface CannonballState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
}

/**
 * คำนวณความเร็วตั้งต้นของกระสุน: เล็งไปเป้า (แนวราบ) + ดันขึ้นตามระยะให้โค้งพอดี
 */
export function aimCannonball(
  fromX: number,
  fromY: number,
  fromZ: number,
  targetX: number,
  targetZ: number,
): { vx: number; vy: number; vz: number } {
  const dx = targetX - fromX;
  const dz = targetZ - fromZ;
  const dist = Math.max(1, Math.hypot(dx, dz));
  const flightTime = dist / CANNONBALL_SPEED;
  return {
    vx: (dx / dist) * CANNONBALL_SPEED,
    // ชดเชยแรงโน้มถ่วงครึ่งทาง + เผื่อความสูงปากกระบอกเหนือเป้า (ระดับน้ำ)
    vy: CANNONBALL_GRAVITY * flightTime * 0.5 + (WATER_LEVEL + 0.8 - fromY) / flightTime,
    vz: (dz / dist) * CANNONBALL_SPEED,
  };
}

/** เดินสถานะกระสุน 1 เฟรม — คืน true ถ้ายังบินอยู่ (false = หมดอายุ/ตกน้ำ) */
export function stepCannonball(ball: CannonballState, dt: number): boolean {
  ball.vy -= CANNONBALL_GRAVITY * dt;
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
  ball.z += ball.vz * dt;
  ball.life -= dt;
  return ball.life > 0 && ball.y > WATER_LEVEL - 0.2;
}

// ---------------------------------------------------------------
// AI เรือ — ตัดสินสถานะจากระยะ (pure)
// ---------------------------------------------------------------

export type ShipAIState = 'patrol' | 'chase' | 'attack';

export function decideShipState(
  current: ShipAIState,
  distanceToPlayer: number,
  playerOnBoat: boolean,
  defn: Pick<EnemyShipDefinition, 'aggroRange' | 'fireRange'>,
): ShipAIState {
  if (!playerOnBoat) return 'patrol';
  // ปล่อยไล่ (hysteresis): หลุดระยะ aggro ×1.4 ค่อยกลับไปลาดตระเวน
  if (current !== 'patrol' && distanceToPlayer > defn.aggroRange * 1.4) return 'patrol';
  if (distanceToPlayer <= defn.fireRange) return 'attack';
  if (distanceToPlayer <= defn.aggroRange || current !== 'patrol') return 'chase';
  return 'patrol';
}

/** มุมเลี้ยวเข้าหาทิศเป้าแบบจำกัดอัตรา (คืน heading ใหม่) */
export function steerToward(heading: number, targetHeading: number, turnSpeed: number, dt: number): number {
  let delta = targetHeading - heading;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  const maxTurn = turnSpeed * dt;
  return heading + Math.max(-maxTurn, Math.min(maxTurn, delta));
}
