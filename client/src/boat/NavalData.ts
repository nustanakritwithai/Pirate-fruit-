/**
 * เรือ Phase 2 — ข้อมูล Naval Combat: เรือโจรสลัด AI + กระสุนปืนใหญ่ (pure, ทดสอบได้)
 */

import { WATER_LEVEL } from '../ocean/Ocean';

export interface EnemyShipDefinition {
  id: string;
  name: string;
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
}

export const PIRATE_CUTTER: EnemyShipDefinition = {
  id: 'pirate-cutter',
  name: 'เรือโจรสลัดหนวดดำ',
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
};

/** จุดลอยลำของเรือโจรสลัดรอบเกาะเริ่มต้น (ทะเลเปิด ห่างชายฝั่ง) */
export const PIRATE_SPAWNS: { x: number; z: number }[] = [
  { x: 120, z: -140 },
  { x: -160, z: 110 },
  { x: 40, z: 190 },
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
