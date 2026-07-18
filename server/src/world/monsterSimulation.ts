import {
  SHARED_MONSTER_TYPES,
  SHARED_WORLD_SPAWNS,
  WORLD_MONSTER_CONTRIBUTION_WINDOW_MS,
  WORLD_MONSTER_MELEE_DAMAGE,
  WORLD_MONSTER_MELEE_RANGE,
  WORLD_MONSTER_SKILL_DAMAGE,
  WORLD_MONSTER_SKILL_RANGE,
  type SharedMonsterType,
  type SharedSpawnPoint,
  type WorldMonsterDelta,
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

export interface MonsterAttackEvent {
  spawnId: string;
  monsterId: string;
  islandId: string;
  targetId: string;
  damage: number;
}

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
  respawnAt: number | null;
  patrolX: number;
  patrolZ: number;
  nextPatrolAt: number;
  contributions: Map<string, Contribution>;
  /** ค่าที่ส่งไปครั้งล่าสุด — ใช้ตัดสินว่าควรส่ง delta ใหม่ */
  sentX: number;
  sentZ: number;
  sentHp: number;
  sentState: WorldMonsterState;
}

const RETURN_MULTIPLIER = 2.4; // ไกลจากบ้านเกินนี้ (× aggroRange) → เลิกไล่ กลับบ้าน
const DEAGGRO_MULTIPLIER = 1.7; // เป้าหนีไกลเกินนี้ (× aggroRange) → ปล่อยเป้า

function distance(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz);
}

export class MonsterSimulation {
  private readonly monsters = new Map<string, MonsterRuntime>();

  constructor(
    private readonly now: () => number = () => Date.now(),
    spawns: readonly SharedSpawnPoint[] = SHARED_WORLD_SPAWNS,
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
        respawnAt: null,
        patrolX: spawn.homeX,
        patrolZ: spawn.homeZ,
        nextPatrolAt: 0,
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
      monster.state = persisted.state;
      monster.x = persisted.x;
      monster.z = persisted.z;
      monster.respawnAt = persisted.respawnAt;
      monster.targetId = null;
      monster.sentX = persisted.x;
      monster.sentZ = persisted.z;
      monster.sentHp = monster.hp;
      monster.sentState = persisted.state;
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
  ): MonsterHitResult | null {
    const monster = this.monsters.get(spawnId);
    if (!monster || monster.state === 'dead' || monster.hp <= 0) return null;
    const range = kind === 'skill' ? WORLD_MONSTER_SKILL_RANGE : WORLD_MONSTER_MELEE_RANGE;
    if (distance(attackerX, attackerZ, monster.x, monster.z) > range) return null;

    const damage = kind === 'skill' ? WORLD_MONSTER_SKILL_DAMAGE : WORLD_MONSTER_MELEE_DAMAGE;
    monster.hp = Math.max(0, monster.hp - damage);
    const existing = monster.contributions.get(attackerId);
    monster.contributions.set(attackerId, {
      damage: (existing?.damage ?? 0) + damage,
      lastAt: now,
    });
    // โดนตี → aggro ใส่ผู้โจมตีทันที (ถ้ายังไม่มีเป้า) — ยังไม่ตายแน่ (return ไปแล้วถ้าตาย)
    if (monster.targetId === null) {
      monster.targetId = attackerId;
      monster.state = 'chase';
    }
    const dead = monster.hp <= 0;
    if (dead) {
      monster.state = 'dead';
      monster.targetId = null;
      monster.respawnAt = now + monster.type.respawnMs;
    }
    return {
      spawnId,
      monsterId: monster.type.id,
      islandId: monster.spawn.islandId,
      hp: Math.round(monster.hp),
      maxHp: monster.type.maxHp,
      damage,
      dead,
      delta: this.deltaOf(monster),
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
      this.emitIfDirty(monster, dirtyByIsland);
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
    const type = monster.type;
    const homeDist = distance(monster.x, monster.z, monster.spawn.homeX, monster.spawn.homeZ);

    // ตรวจเป้าปัจจุบัน: หายจาก world / คนละเกาะ / หนีไกล / ตัวเองไกลบ้าน → ปล่อยเป้า
    let target = monster.targetId ? playersById.get(monster.targetId) ?? null : null;
    if (target && target.islandId !== monster.spawn.islandId) target = null;
    if (target) {
      const targetDist = distance(monster.x, monster.z, target.x, target.z);
      if (targetDist > type.aggroRange * DEAGGRO_MULTIPLIER || homeDist > type.aggroRange * RETURN_MULTIPLIER) {
        target = null;
      }
    }
    if (!target && monster.targetId !== null) {
      monster.targetId = null;
      monster.state = 'return';
    }

    // ไม่มีเป้า → มองหาผู้เล่นใกล้สุดบนเกาะเดียวกันในระยะ aggro (ถ้ายังไม่ไกลบ้านเกิน)
    if (!monster.targetId && monster.state !== 'return') {
      let nearest: PlayerView | null = null;
      let nearestDist = Infinity;
      for (const player of playersById.values()) {
        if (player.islandId !== monster.spawn.islandId) continue;
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
      if (targetDist <= type.attackRange) {
        monster.state = 'attack';
        this.faceToward(monster, target.x, target.z);
        if (now >= monster.attackReadyAt) {
          monster.attackReadyAt = now + type.attackCooldown * 1000;
          attacks.push({
            spawnId: monster.spawn.spawnId,
            monsterId: type.id,
            islandId: monster.spawn.islandId,
            targetId: target.characterId,
            damage: type.damage,
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
    monster.x += (dx / d) * move;
    monster.z += (dz / d) * move;
    monster.heading = Math.atan2(dx, dz);
  }

  private faceToward(monster: MonsterRuntime, tx: number, tz: number): void {
    monster.heading = Math.atan2(tx - monster.x, tz - monster.z);
  }

  private emitIfDirty(monster: MonsterRuntime, dirtyByIsland: Map<string, WorldMonsterDelta[]>): void {
    const moved = Math.hypot(monster.x - monster.sentX, monster.z - monster.sentZ) > 0.05;
    const changed = moved
      || Math.round(monster.hp) !== Math.round(monster.sentHp)
      || monster.state !== monster.sentState;
    if (!changed) return;
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
