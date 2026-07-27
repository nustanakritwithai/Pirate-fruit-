import {
  SHARED_MONSTER_TYPES,
  SHARED_WORLD_SPAWNS,
  WORLD_MONSTER_CONTRIBUTION_WINDOW_MS,
  WORLD_MONSTER_MELEE_DAMAGE,
  WORLD_MONSTER_MELEE_RANGE,
  WORLD_MONSTER_SKILL_DAMAGE,
  WORLD_MONSTER_SKILL_RANGE,
  WORLD_MONSTER_ATTACK_HIT_DELAY_MS,
  WORLD_MONSTER_HITSTUN_MS,
  WORLD_MONSTER_TICK_MS,
  isWorldSafeZone,
  type SharedMonsterType,
  type SharedSpawnPoint,
  type WorldMonsterDelta,
  type WorldMonsterAttack,
  type WorldMonsterHitReaction,
  type WorldMonsterSnapshot,
  type WorldMonsterState,
} from '@pirate-fruit/shared';

/**
 * S16 — Shared Monster World simulation (pure, testable — ไม่รู้จัก socket/DB)
 * แหล่งความจริงเดียวของมอนสเตอร์กลาง: spawn/AI/HP/death/respawn/contribution
 * รับตำแหน่งผู้เล่นเข้ามาต่อ tick แล้วคืน delta/respawn/attack เพื่อให้ชั้นบน broadcast
 */

export interface PlayerView {
  characterId: string;
  islandId: string;
  x: number;
  z: number;
}

export interface MonsterHitResult {
  spawnId: string;
  monsterId: string;
  islandId: string;
  hp: number;
  maxHp: number;
  damage: number;
  dead: boolean;
  /** delta ล่าสุดหลังโดน (ให้ชั้นบน broadcast ทันทีโดยไม่รอ tick) */
  delta: WorldMonsterDelta;
}

export type MonsterAttackEvent = WorldMonsterAttack;

export interface SimulationTickResult {
  /** delta ต่อเกาะ (เฉพาะตัวที่เปลี่ยน) */
  dirtyByIsland: Map<string, WorldMonsterDelta[]>;
  /** ตัวที่เพิ่งเกิดใหม่รอบนี้ */
  respawns: WorldMonsterSnapshot[];
  /** มอนสเตอร์ตีผู้เล่น (ชั้นบน relay ให้เป้าเอาไปลด HP ฝั่ง client) */
  attacks: MonsterAttackEvent[];
}

export interface PersistedMonster {
  spawnId: string;
  hp: number;
  state: WorldMonsterState;
  x: number;
  z: number;
  respawnAt: number | null;
}

interface Contribution {
  damage: number;
  lastAt: number;
}

interface MonsterRuntime {
  spawn: SharedSpawnPoint;
  type: SharedMonsterType;
  x: number;
  z: number;
  heading: number;
  hp: number;
  state: WorldMonsterState;
  targetId: string | null;
  attackReadyAt: number;
  /** Brief post-hit recovery; Server keeps movement cadence authoritative. */
  attackRecoverUntil: number;
  /** Server-authoritative 0.35s interruption window applied by confirmed player hits. */
  hitstunUntil: number;
  /** Attack action that may still be waiting for its active hit frame on clients. */
  activeAttackId: string | null;
  respawnAt: number | null;
  patrolX: number;
  patrolZ: number;
  nextPatrolAt: number;
  /** เวลาส่ง delta ครั้งล่าสุด — throttle การ sync ตำแหน่ง (state/hp เปลี่ยนไม่สน throttle) */
  lastDeltaAt: number;
  contributions: Map<string, Contribution>;
  /** ค่าที่ส่งไปครั้งล่าสุด — ใช้ตัดสินว่าควรส่ง delta ใหม่ */
  sentX: number;
  sentZ: number;
  sentHp: number;
  sentState: WorldMonsterState;
}

const RETURN_MULTIPLIER = 1.5; // ไกลจากบ้านเกินนี้ (× aggroRange) → เลิกไล่ กลับบ้าน
const DEAGGRO_MULTIPLIER = 1.3; // เป้าหนีไกลเกินนี้ (× aggroRange) → ปล่อยเป้า
// เพดานระยะไล่สูงสุดจากบ้าน (หน่วยโลก) — กันบอส aggro สูงไล่ผู้เล่นออกทะเลไกลเกิน
// ให้แต่ละตัว "รักษาพื้นที่" ของมัน หนีพ้นเขตนี้ = ปลอดภัย
const MAX_LEASH_DISTANCE = 26;
const ATTACK_RECOVERY_MS = 280;
const ACTIVE_POSITION_SYNC_MS = WORLD_MONSTER_TICK_MS;
const AMBIENT_POSITION_SYNC_MS = 450;

function distance(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz);
}

export class MonsterSimulation {
  private readonly monsters = new Map<string, MonsterRuntime>();
  private attackSequence = 0;

  constructor(
    private readonly now: () => number = () => Date.now(),
    spawns: readonly SharedSpawnPoint[] = SHARED_WORLD_SPAWNS,
    private readonly safeZoneAt: (islandId: string, x: number, z: number) => boolean = isWorldSafeZone,
  ) {
    for (const spawn of spawns) {
      const type = SHARED_MONSTER_TYPES[spawn.monsterId];
      if (!type) continue;
      this.monsters.set(spawn.spawnId, {
        spawn,
        type,
        x: spawn.homeX,
        z: spawn.homeZ,
        heading: 0,
        hp: type.maxHp,
        state: 'idle',
        targetId: null,
        attackReadyAt: 0,
        attackRecoverUntil: 0,
        hitstunUntil: 0,
        activeAttackId: null,
        respawnAt: null,
        patrolX: spawn.homeX,
        patrolZ: spawn.homeZ,
        nextPatrolAt: 0,
        lastDeltaAt: 0,
        contributions: new Map(),
        sentX: spawn.homeX,
        sentZ: spawn.homeZ,
        sentHp: type.maxHp,
        sentState: 'idle',
      });
    }
  }

  /** คืนสถานะเพื่อ persist (restart recovery) */
  serialize(): PersistedMonster[] {
    return [...this.monsters.values()].map((monster) => ({
      spawnId: monster.spawn.spawnId,
      hp: monster.hp,
      state: monster.state,
      x: monster.x,
      z: monster.z,
      respawnAt: monster.respawnAt,
    }));
  }

  /** โหลดสถานะที่ persist ไว้ทับค่าเริ่มต้น (หลัง Server restart) */
  restore(states: readonly PersistedMonster[]): void {
    for (const persisted of states) {
      const monster = this.monsters.get(persisted.spawnId);
      if (!monster) continue;
      monster.hp = Math.max(0, Math.min(monster.type.maxHp, persisted.hp));
      // Hit-stun and pending attack frames are ephemeral and must not survive restart.
      monster.state = persisted.state === 'stunned' ? 'idle' : persisted.state;
      monster.x = persisted.x;
      monster.z = persisted.z;
      monster.respawnAt = persisted.respawnAt;
      monster.targetId = null;
      monster.hitstunUntil = 0;
      monster.activeAttackId = null;
      monster.sentX = persisted.x;
      monster.sentZ = persisted.z;
      monster.sentHp = monster.hp;
      monster.sentState = monster.state;
    }
  }

  private snapshotOf(monster: MonsterRuntime): WorldMonsterSnapshot {
    return {
      spawnId: monster.spawn.spawnId,
      monsterId: monster.type.id,
      islandId: monster.spawn.islandId,
      x: round(monster.x),
      z: round(monster.z),
      heading: round(monster.heading),
      hp: Math.round(monster.hp),
      maxHp: monster.type.maxHp,
      state: monster.state,
    };
  }

  private deltaOf(monster: MonsterRuntime): WorldMonsterDelta {
    return {
      spawnId: monster.spawn.spawnId,
      x: round(monster.x),
      z: round(monster.z),
      heading: round(monster.heading),
      hp: Math.round(monster.hp),
      state: monster.state,
    };
  }

  /** full snapshot ของมอนสเตอร์บนเกาะ (สำหรับ join/resync) */
  snapshotForIsland(islandId: string): WorldMonsterSnapshot[] {
    const list: WorldMonsterSnapshot[] = [];
    for (const monster of this.monsters.values()) {
      if (monster.spawn.islandId === islandId) list.push(this.snapshotOf(monster));
    }
    return list;
  }

  hpOf(spawnId: string): number | undefined {
    return this.monsters.get(spawnId)?.hp;
  }

  stateOf(spawnId: string): WorldMonsterState | undefined {
    return this.monsters.get(spawnId)?.state;
  }

  /** ผู้ร่วมสร้างดาเมจภายในหน้าต่างเวลา (สำหรับแจกรางวัล phase ถัดไป + เทสต์) */
  contributorsOf(spawnId: string, now = this.now()): { characterId: string; damage: number }[] {
    const monster = this.monsters.get(spawnId);
    if (!monster) return [];
    const cutoff = now - WORLD_MONSTER_CONTRIBUTION_WINDOW_MS;
    const result: { characterId: string; damage: number }[] = [];
    for (const [characterId, contribution] of monster.contributions) {
      if (contribution.lastAt >= cutoff) result.push({ characterId, damage: contribution.damage });
    }
    return result;
  }

  /**
   * ตีมอนสเตอร์ — Server ตัดสินดาเมจ (ค่าคงที่ตาม kind) + ตรวจระยะจากตำแหน่งผู้โจมตี
   * คืน null ถ้าปัดตก (ไม่มีตัว/ตายแล้ว/นอกระยะ) — ไม่ใช่ violation
   */
  applyHit(
    now: number,
    spawnId: string,
    attackerId: string,
    attackerX: number,
    attackerZ: number,
    kind: 'melee' | 'skill',
    damageMultiplier = 1,
  ): MonsterHitResult | null {
    const monster = this.monsters.get(spawnId);
    if (!monster || monster.state === 'dead' || monster.hp <= 0) return null;
    // Prevent attacking outward while protected by a safe zone.
    if (this.safeZoneAt(monster.spawn.islandId, attackerX, attackerZ)) return null;
    const range = kind === 'skill' ? WORLD_MONSTER_SKILL_RANGE : WORLD_MONSTER_MELEE_RANGE;
    if (distance(attackerX, attackerZ, monster.x, monster.z) > range) return null;

    const baseDamage = kind === 'skill' ? WORLD_MONSTER_SKILL_DAMAGE : WORLD_MONSTER_MELEE_DAMAGE;
    const safeMultiplier = Number.isFinite(damageMultiplier)
      ? Math.max(1, Math.min(100, damageMultiplier))
      : 1;
    const damage = Math.max(1, Math.round(baseDamage * safeMultiplier));
    // Keep the latest id until it is superseded: clients schedule from receipt
    // time, so network delay can leave the action pending after Server hitAt.
    const cancelAttackId = monster.activeAttackId ?? undefined;
    monster.activeAttackId = null;
    monster.hp = Math.max(0, monster.hp - damage);
    const existing = monster.contributions.get(attackerId);
    monster.contributions.set(attackerId, {
      damage: (existing?.damage ?? 0) + damage,
      lastAt: now,
    });
    // โดนตี → ยกเลิก attack frame ที่ยังไม่ออก, ล็อก AI และต่อเวลา stun ทุก combo hit
    monster.targetId = attackerId;
    monster.hitstunUntil = Math.max(monster.hitstunUntil, now + WORLD_MONSTER_HITSTUN_MS);
    monster.attackRecoverUntil = 0;
    monster.state = 'stunned';
    const dead = monster.hp <= 0;
    if (dead) {
      monster.state = 'dead';
      monster.targetId = null;
      monster.hitstunUntil = 0;
      monster.respawnAt = now + monster.type.respawnMs;
    }
    const dx = monster.x - attackerX;
    const dz = monster.z - attackerZ;
    const length = Math.hypot(dx, dz) || 1;
    const hitReaction: WorldMonsterHitReaction = {
      directionX: dx / length,
      directionZ: dz / length,
      strength: kind === 'skill' ? 0.82 : 0.64,
    };
    const delta: WorldMonsterDelta = {
      ...this.deltaOf(monster),
      damage,
      hitReaction,
      ...(cancelAttackId ? { cancelAttackId } : {}),
    };
    // MonsterWorldService broadcasts this hit delta immediately. Keep the
    // dirty baseline in sync so the next 5 Hz tick does not resend the same
    // HP/state/position a second time. Movement or a later state transition
    // still emits normally.
    monster.lastDeltaAt = now;
    monster.sentX = monster.x;
    monster.sentZ = monster.z;
    monster.sentHp = monster.hp;
    monster.sentState = monster.state;
    return {
      spawnId,
      monsterId: monster.type.id,
      islandId: monster.spawn.islandId,
      hp: Math.round(monster.hp),
      maxHp: monster.type.maxHp,
      damage,
      dead,
      delta,
    };
  }

  /** เดินจำลอง 1 tick — dtMs = เวลาจริงตั้งแต่ tick ก่อน */
  tick(now: number, dtMs: number, players: readonly PlayerView[]): SimulationTickResult {
    const dt = dtMs / 1000;
    const dirtyByIsland = new Map<string, WorldMonsterDelta[]>();
    const respawns: WorldMonsterSnapshot[] = [];
    const attacks: MonsterAttackEvent[] = [];
    const playersById = new Map(players.map((player) => [player.characterId, player]));

    for (const monster of this.monsters.values()) {
      if (monster.state === 'dead') {
        if (monster.respawnAt !== null && now >= monster.respawnAt) {
          this.respawn(monster);
          respawns.push(this.snapshotOf(monster));
        }
        continue;
      }
      this.stepAi(now, dt, monster, playersById, attacks);
      this.emitIfDirty(now, monster, dirtyByIsland);
    }

    return { dirtyByIsland, respawns, attacks };
  }

  private respawn(monster: MonsterRuntime): void {
    monster.hp = monster.type.maxHp;
    monster.state = 'idle';
    monster.x = monster.spawn.homeX;
    monster.z = monster.spawn.homeZ;
    monster.targetId = null;
    monster.respawnAt = null;
    monster.attackRecoverUntil = 0;
    monster.hitstunUntil = 0;
    monster.activeAttackId = null;
    monster.contributions.clear();
    monster.sentX = monster.x;
    monster.sentZ = monster.z;
    monster.sentHp = monster.hp;
    monster.sentState = monster.state;
  }

  private stepAi(
    now: number,
    dt: number,
    monster: MonsterRuntime,
    playersById: Map<string, PlayerView>,
    attacks: MonsterAttackEvent[],
  ): void {
    if (now < monster.hitstunUntil) {
      monster.state = 'stunned';
      return;
    }
    monster.hitstunUntil = 0;

    const type = monster.type;
    const homeDist = distance(monster.x, monster.z, monster.spawn.homeX, monster.spawn.homeZ);
    const monsterInsideSafeZone = this.safeZoneAt(monster.spawn.islandId, monster.x, monster.z);

    // ตรวจเป้าปัจจุบัน: หายจาก world / คนละเกาะ / หนีไกล / ตัวเองไกลบ้าน → ปล่อยเป้า
    let target = monster.targetId ? playersById.get(monster.targetId) ?? null : null;
    if (target && target.islandId !== monster.spawn.islandId) target = null;
    if (target && this.safeZoneAt(target.islandId, target.x, target.z)) target = null;
    if (target) {
      const targetDist = distance(monster.x, monster.z, target.x, target.z);
      const leash = Math.min(type.aggroRange * RETURN_MULTIPLIER, MAX_LEASH_DISTANCE);
      if (targetDist > type.aggroRange * DEAGGRO_MULTIPLIER || homeDist > leash) {
        target = null;
      }
    }
    if ((!target && monster.targetId !== null) || monsterInsideSafeZone) {
      monster.targetId = null;
      monster.state = 'return';
      target = null;
    }

    // ไม่มีเป้า → มองหาผู้เล่นใกล้สุดบนเกาะเดียวกันในระยะ aggro (ถ้ายังไม่ไกลบ้านเกิน)
    if (!monster.targetId && monster.state !== 'return') {
      let nearest: PlayerView | null = null;
      let nearestDist = Infinity;
      for (const player of playersById.values()) {
        if (player.islandId !== monster.spawn.islandId) continue;
        if (this.safeZoneAt(player.islandId, player.x, player.z)) continue;
        const d = distance(monster.x, monster.z, player.x, player.z);
        if (d <= type.aggroRange && d < nearestDist) {
          nearest = player;
          nearestDist = d;
        }
      }
      if (nearest) {
        monster.targetId = nearest.characterId;
        monster.state = 'aggro';
        target = nearest;
      }
    } else if (monster.targetId) {
      target = playersById.get(monster.targetId) ?? null;
    }

    if (target) {
      const targetDist = distance(monster.x, monster.z, target.x, target.z);
      if (now < monster.attackRecoverUntil) {
        monster.state = 'attack';
        this.faceToward(monster, target.x, target.z);
        return;
      }
      if (targetDist <= type.attackRange) {
        monster.state = 'attack';
        this.faceToward(monster, target.x, target.z);
        if (now >= monster.attackReadyAt) {
          monster.attackReadyAt = now + type.attackCooldown * 1000;
          monster.attackRecoverUntil = now + ATTACK_RECOVERY_MS;
          const attackId = `${monster.spawn.spawnId}:${++this.attackSequence}`;
          monster.activeAttackId = attackId;
          attacks.push({
            attackId,
            spawnId: monster.spawn.spawnId,
            monsterId: type.id,
            islandId: monster.spawn.islandId,
            targetId: target.characterId,
            action: 'melee',
            damage: type.damage,
            hitDelayMs: WORLD_MONSTER_ATTACK_HIT_DELAY_MS,
          });
        }
      } else {
        monster.state = 'chase';
        this.moveToward(monster, target.x, target.z, type.moveSpeed * dt);
      }
      return;
    }

    // ไม่มีเป้า: return กลับบ้าน หรือ patrol รอบบ้าน
    if (monster.state === 'return') {
      if (homeDist <= 0.4) {
        monster.state = 'idle';
      } else {
        this.moveToward(monster, monster.spawn.homeX, monster.spawn.homeZ, type.moveSpeed * dt);
      }
      return;
    }

    // idle/patrol — เดินเนิบ ๆ รอบบ้าน
    if (now >= monster.nextPatrolAt || distance(monster.x, monster.z, monster.patrolX, monster.patrolZ) <= 0.4) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * monster.spawn.patrolRadius;
      monster.patrolX = monster.spawn.homeX + Math.cos(angle) * radius;
      monster.patrolZ = monster.spawn.homeZ + Math.sin(angle) * radius;
      monster.nextPatrolAt = now + 2_000 + Math.random() * 2_000;
      monster.state = 'patrol';
    }
    this.moveToward(monster, monster.patrolX, monster.patrolZ, type.moveSpeed * 0.45 * dt);
    if (distance(monster.x, monster.z, monster.patrolX, monster.patrolZ) <= 0.4) monster.state = 'idle';
  }

  private moveToward(monster: MonsterRuntime, tx: number, tz: number, step: number): void {
    const dx = tx - monster.x;
    const dz = tz - monster.z;
    const d = Math.hypot(dx, dz);
    if (d <= 1e-4) return;
    const move = Math.min(step, d);
    const nextX = monster.x + (dx / d) * move;
    const nextZ = monster.z + (dz / d) * move;
    const currentlySafe = this.safeZoneAt(monster.spawn.islandId, monster.x, monster.z);
    if (!currentlySafe && this.safeZoneAt(monster.spawn.islandId, nextX, nextZ)) {
      monster.targetId = null;
      monster.state = 'return';
      return;
    }
    monster.x = nextX;
    monster.z = nextZ;
    monster.heading = Math.atan2(dx, dz);
  }

  private faceToward(monster: MonsterRuntime, tx: number, tz: number): void {
    monster.heading = Math.atan2(tx - monster.x, tz - monster.z);
  }

  private emitIfDirty(
    now: number,
    monster: MonsterRuntime,
    dirtyByIsland: Map<string, WorldMonsterDelta[]>,
  ): void {
    // hp/state เปลี่ยน = สำคัญ ส่งทันที; ตำแหน่งล้วน = throttle (คุมต้นทุน broadcast)
    const hpChanged = Math.round(monster.hp) !== Math.round(monster.sentHp);
    const stateChanged = monster.state !== monster.sentState;
    const active = monster.state === 'aggro'
      || monster.state === 'chase'
      || monster.state === 'attack'
      || monster.state === 'return';
    const moveThreshold = active ? 0.05 : 0.6;
    const moved = Math.hypot(monster.x - monster.sentX, monster.z - monster.sentZ) > moveThreshold;
    if (!hpChanged && !stateChanged) {
      // Active combat movement follows the 5 Hz simulation tick so clients do
      // not alternate between catching up and stopping. Ambient patrols retain
      // the lower rate to keep island-wide bandwidth bounded.
      const syncInterval = active ? ACTIVE_POSITION_SYNC_MS : AMBIENT_POSITION_SYNC_MS;
      if (!moved || now - monster.lastDeltaAt < syncInterval) return;
    } else if (!moved && !hpChanged && !stateChanged) {
      return;
    }
    monster.lastDeltaAt = now;
    monster.sentX = monster.x;
    monster.sentZ = monster.z;
    monster.sentHp = monster.hp;
    monster.sentState = monster.state;
    const islandId = monster.spawn.islandId;
    const list = dirtyByIsland.get(islandId) ?? [];
    list.push(this.deltaOf(monster));
    dirtyByIsland.set(islandId, list);
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
