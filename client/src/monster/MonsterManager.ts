import * as THREE from 'three';
import type { CharacterController } from '../player/CharacterController';
import type { CollisionSystem } from '../world/Collision';
import type { Effects } from '../effects/Effects';
import type { GraphicsProfile } from '../engine/GraphicsQuality';
import { mulberry32 } from '../world/props';
import { BossBar } from '../ui/BossBar';
import { Monster, type MonsterState } from './Monster';
import { MONSTER_TYPES, MONSTER_CAMPS, BOSS_SPAWNS, type MonsterType } from './MonsterData';
import type { CombatRewardSource } from '../combat/CombatData';
import { isWorldSafeZone } from '@pirate-fruit/shared';
import { inferIslandId } from '../island/IslandRegistry';
import type { IslandId } from '../island/IslandTypes';

const GROUND_MIN = 0.25; // มอนสเตอร์เดินได้เฉพาะพื้นสูงกว่านี้ (ไม่ลงน้ำ)

function isInSafeZone(x: number, z: number): boolean {
  return isWorldSafeZone(undefined, x, z);
}

export interface AttackOptions {
  damage: number;
  range: number;
  /** cos ของครึ่งมุมกรวยหน้า */
  arcCos: number;
  knockback?: number;
  source?: CombatRewardSource;
  /** visual-only callback หลังเป้าผ่านกรวยโจมตี ไม่เปลี่ยน damage pipeline */
  onHit?: (monster: Monster) => void;
}

/** ข้อมูลท่าที่ตีเข้าผู้เล่นหนึ่งครั้ง — ให้ PlayerCombat ตัดสิน Block/Guard/ผลัก */
export interface IncomingAttack {
  amount: number;
  unblockable: boolean;
  /** แรงผลักผู้เล่น (0 = ไม่ผลัก) */
  knockback: number;
  sourceX: number;
  sourceZ: number;
  tags: string[];
}

export interface MonsterCallbacks {
  /** แจ้งเมื่อผู้เล่นโดนตี (amount = ดาเมจสุทธิหลัง Block/Guard) ไว้โชว์ตัวเลข/แฟลช */
  onPlayerHit?: (amount: number) => void;
  onPlayerDefeated?: () => void;
  /** ให้ระบบภายนอก (Block/Guard) ปรับดาเมจก่อนเข้าตัวผู้เล่น คืนดาเมจสุดท้าย */
  modifyIncomingDamage?: (attack: IncomingAttack) => number;
  /** แจ้งเมื่อมอนสเตอร์โดนดาเมจ (ไว้โชว์ตัวเลขดาเมจ) */
  onMonsterDamaged?: (monster: Monster, amount: number) => void;
  /** Presentation-only hook. Consumers may play audio but must not mutate authority state. */
  onMonsterAudioEvent?: (event: 'aggro' | 'attack' | 'respawn', monster: Monster) => void;
  /** Read-only boss music hook derived from the existing boss engagement decision. */
  onBossAudioState?: (active: boolean) => void;
  /** hook สำหรับระบบรางวัล (EXP/เงิน) ใน Phase 6 */
  onRewardContribution?: (
    monster: Monster,
    damage: number,
    killed: boolean,
    source?: CombatRewardSource,
  ) => void;
}

/** ปรับจำนวนมอนสเตอร์ตามระดับกราฟิก เพื่อคุมภาระมือถือ */
function countScale(tier: GraphicsProfile['tier']): number {
  return tier === 'low' ? 0.6 : tier === 'medium' ? 0.85 : 1;
}

export function ambientMonsterCountForIsland(
  islandId: IslandId,
  tier: GraphicsProfile['tier'],
): number {
  const scale = countScale(tier);
  const camps = MONSTER_CAMPS
    .filter((camp) => camp.islandId === islandId)
    .reduce((total, camp) => total + Math.max(1, Math.round(camp.count * scale)), 0);
  return camps + BOSS_SPAWNS.filter((spawn) => spawn.islandId === islandId).length;
}

interface AmbientMonsterSpawn {
  islandId: IslandId;
  type: MonsterType;
  x: number;
  z: number;
  respawnDelay: number;
  boss: boolean;
  saved?: {
    capturedAt: number;
    x: number;
    y: number;
    z: number;
    rotationY: number;
    homeX: number;
    homeZ: number;
    hp: number;
    state: MonsterState;
    attackCooldown: number;
    respawnTimer: number;
    wanderAngle: number;
    wanderTimer: number;
    staggerTimer: number;
    attackCount: number;
    returningHome: boolean;
    telegraphTimer: number;
    pendingHeavy: boolean;
  };
}

export class MonsterManager {
  private readonly monsters: Monster[] = [];
  private readonly bosses = new Set<Monster>();
  /** มอนแบบ one-shot (ลูกเรือ Boarding) — ตายแล้วถูกถอดออก ไม่เกิดใหม่ */
  private readonly transient = new Set<Monster>();
  private readonly bossBar = new BossBar();
  private readonly rand = mulberry32(20260712);
  private readonly tmp = new THREE.Vector2();
  private readonly ambientSpawns = new Map<IslandId, AmbientMonsterSpawn[]>();
  private readonly ambientInstances = new Map<Monster, AmbientMonsterSpawn>();
  private activeAmbientIsland: IslandId | null = null;
  private bossAudioActive = false;

  constructor(
    private scene: THREE.Scene,
    private controller: CharacterController,
    private collision: CollisionSystem,
    private effects: Effects,
    graphics: GraphicsProfile,
    private callbacks: MonsterCallbacks = {},
    /** S16: ปิดการเกิดมอนสเตอร์ท้องถิ่น (โลกกลางเป็นของ Server แล้ว) — ยัง spawn ลูกเรือ Boarding ได้ */
    suppressAmbientSpawns = false,
  ) {
    const scale = countScale(graphics.tier);

    if (!suppressAmbientSpawns) {
      for (const camp of MONSTER_CAMPS) {
        const type = MONSTER_TYPES[camp.typeId];
        const count = Math.max(1, Math.round(camp.count * scale));
        for (let i = 0; i < count; i++) {
          const spot = this.findLand(camp.x, camp.z, camp.radius);
          this.addAmbientSpawn({
            islandId: camp.islandId,
            type,
            x: spot.x,
            z: spot.z,
            respawnDelay: 12,
            boss: false,
          });
        }
      }

      for (const spawn of BOSS_SPAWNS) {
        const bossType = MONSTER_TYPES[spawn.typeId];
        const bossSpot = this.findLand(spawn.x, spawn.z, 2);
        this.addAmbientSpawn({
          islandId: spawn.islandId,
          type: bossType,
          x: bossSpot.x,
          z: bossSpot.z,
          respawnDelay: 40,
          boss: true,
        });
      }
      this.activateAmbientIsland(inferIslandId(controller.position.x, controller.position.z));
    }
  }

  private addAmbientSpawn(spawn: AmbientMonsterSpawn): void {
    const entries = this.ambientSpawns.get(spawn.islandId) ?? [];
    entries.push(spawn);
    this.ambientSpawns.set(spawn.islandId, entries);
  }

  /** Keep only one island's offline monsters materialized; Server-owned shared monsters bypass this path. */
  private activateAmbientIsland(islandId: IslandId): void {
    if (islandId === this.activeAmbientIsland) return;
    const now = Date.now();
    for (const [monster, spawn] of this.ambientInstances) {
      spawn.saved = {
        capturedAt: now,
        x: monster.group.position.x,
        y: monster.group.position.y,
        z: monster.group.position.z,
        rotationY: monster.group.rotation.y,
        homeX: monster.home.x,
        homeZ: monster.home.y,
        hp: monster.hp,
        state: monster.state,
        attackCooldown: monster.attackCooldown,
        respawnTimer: monster.respawnTimer,
        wanderAngle: monster.wanderAngle,
        wanderTimer: monster.wanderTimer,
        staggerTimer: monster.staggerTimer,
        attackCount: monster.attackCount,
        returningHome: monster.returningHome,
        telegraphTimer: monster.telegraphTimer,
        pendingHeavy: monster.pendingHeavy,
      };
      this.bosses.delete(monster);
      const index = this.monsters.indexOf(monster);
      if (index >= 0) this.monsters.splice(index, 1);
      this.scene.remove(monster.group);
      monster.dispose();
    }
    this.ambientInstances.clear();
    this.activeAmbientIsland = islandId;
    this.bossAudioActive = false;
    this.bossBar.hide();

    for (const spawn of this.ambientSpawns.get(islandId) ?? []) {
      const monster = this.spawnMonster(spawn.type, spawn.x, spawn.z, spawn.respawnDelay);
      const saved = spawn.saved;
      if (saved) {
        monster.group.position.set(saved.x, saved.y, saved.z);
        monster.group.rotation.y = saved.rotationY;
        monster.home.set(saved.homeX, saved.homeZ);
        const elapsed = Math.max(0, (now - saved.capturedAt) / 1_000);
        monster.applyAuthoritativeState(saved.hp, spawn.type.maxHp, saved.state);
        monster.attackCooldown = Math.max(0, saved.attackCooldown - elapsed);
        monster.respawnTimer = Math.max(0, saved.respawnTimer - elapsed);
        monster.wanderAngle = saved.wanderAngle;
        monster.wanderTimer = Math.max(0, saved.wanderTimer - elapsed);
        monster.staggerTimer = Math.max(0, saved.staggerTimer - elapsed);
        monster.attackCount = saved.attackCount;
        monster.returningHome = saved.returningHome;
        monster.telegraphTimer = Math.max(0, saved.telegraphTimer - elapsed);
        monster.pendingHeavy = saved.pendingHeavy && monster.telegraphTimer > 0;
      }
      if (spawn.boss) this.bosses.add(monster);
      this.ambientInstances.set(monster, spawn);
    }
  }

  private spawnMonster(type: MonsterType, x: number, z: number, respawnDelay: number): Monster {
    const y = this.collision.heightAt(x, z);
    const monster = new Monster(type, x, z, y, respawnDelay);
    this.scene.add(monster.group);
    this.monsters.push(monster);
    return monster;
  }

  /**
   * เกิดลูกเรือ Boarding บนดาดฟ้าเรือศัตรู (one-shot: ตายแล้วไม่เกิดใหม่)
   * ต้องลงทะเบียน dynamic ground ของดาดฟ้าก่อน เพื่อให้ heightAt คืนพื้นเรือ
   */
  spawnBoardingCrew(entries: { typeId: string; x: number; z: number }[]): Monster[] {
    const crew: Monster[] = [];
    for (const entry of entries) {
      const type = MONSTER_TYPES[entry.typeId];
      if (!type) continue;
      const monster = this.spawnMonster(type, entry.x, entry.z, 9999);
      this.transient.add(monster);
      crew.push(monster);
    }
    return crew;
  }

  /** ถอดลูกเรือออกทันที (ยกเลิก Boarding / ยึดเรือแล้ว) */
  despawnCrew(crew: Monster[]): void {
    for (const monster of crew) {
      this.transient.delete(monster);
      this.bosses.delete(monster);
      const index = this.monsters.indexOf(monster);
      if (index >= 0) this.monsters.splice(index, 1);
      this.scene.remove(monster.group);
      monster.dispose();
    }
  }

  /** สุ่มจุดพื้นดินรอบ ๆ center ที่ heightAt สูงพอ (ไม่จมน้ำ) */
  private findLand(cx: number, cz: number, radius: number): { x: number; z: number } {
    for (let i = 0; i < 24; i++) {
      const angle = this.rand() * Math.PI * 2;
      const dist = Math.sqrt(this.rand()) * radius;
      const x = cx + Math.cos(angle) * dist;
      const z = cz + Math.sin(angle) * dist;
      if (this.collision.heightAt(x, z) > 0.6) return { x, z };
    }
    return { x: cx, z: cz };
  }

  /** โจมตีของผู้เล่น: ดาเมจมอนสเตอร์ในกรวยหน้าตัวละคร คืนจำนวนตัวที่โดน */
  playerAttack(position: THREE.Vector3, heading: number, options: AttackOptions): number {
    if (isInSafeZone(position.x, position.z)) return 0;
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    let hits = 0;
    for (const monster of this.monsters) {
      if (!monster.alive) continue;
      const dx = monster.group.position.x - position.x;
      const dz = monster.group.position.z - position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > options.range + monster.type.scale * 0.6) continue;
      if (dist > 0.001) {
        const dot = (dx * fx + dz * fz) / dist;
        if (dot < options.arcCos) continue; // อยู่นอกกรวยหน้า
      }
      this.applyHit(
        monster,
        options.damage,
        position.x,
        position.z,
        options.knockback ?? 0,
        options.source,
      );
      options.onHit?.(monster);
      hits++;
    }
    return hits;
  }

  /** ดาเมจทุกตัวในรัศมีรอบจุด (สกิล AoE) คืนจำนวนตัวที่โดน */
  damageRadius(
    center: THREE.Vector3,
    radius: number,
    damage: number,
    knockback = 0,
    source?: CombatRewardSource,
  ): number {
    if (isInSafeZone(center.x, center.z)) return 0;
    let hits = 0;
    for (const monster of this.monsters) {
      if (!monster.alive) continue;
      const dx = monster.group.position.x - center.x;
      const dz = monster.group.position.z - center.z;
      if (Math.hypot(dx, dz) > radius + monster.type.scale * 0.5) continue;
      this.applyHit(monster, damage, center.x, center.z, knockback, source);
      hits++;
    }
    return hits;
  }

  /** มอนสเตอร์ที่ยังไม่ตายภายในรัศมีจากจุด (ใช้กับ projectile) */
  monstersNear(x: number, z: number, radius: number): Monster[] {
    const found: Monster[] = [];
    for (const monster of this.monsters) {
      if (!monster.alive) continue;
      const dx = monster.group.position.x - x;
      const dz = monster.group.position.z - z;
      if (Math.hypot(dx, dz) <= radius + monster.type.scale * 0.5) found.push(monster);
    }
    return found;
  }

  /** ทำดาเมจ + knockback (บอสต้านทานแรงผลัก/อาการเซ) — ปลายทางเดียวของ damage pipeline ฝั่งศัตรู */
  applyHit(
    monster: Monster,
    damage: number,
    srcX: number,
    srcZ: number,
    knockback: number,
    source?: CombatRewardSource,
  ): void {
    const hpBefore = monster.hp;
    const died = monster.takeDamage(damage, srcX, srcZ);
    const actualDamage = Math.max(0, hpBefore - monster.hp);
    this.effects.spawnHitSpark(monster.group.position);
    this.callbacks.onMonsterDamaged?.(monster, actualDamage);
    this.callbacks.onRewardContribution?.(monster, actualDamage, died, source);
    if (!died && knockback > 0) {
      const dx = monster.group.position.x - srcX;
      const dz = monster.group.position.z - srcZ;
      const len = Math.hypot(dx, dz) || 1;
      const resist = monster.type.kind === 'boss' ? 0.25 : 1;
      monster.kbX += (dx / len) * knockback * resist;
      monster.kbZ += (dz / len) * knockback * resist;
      monster.staggerTimer = Math.max(monster.staggerTimer, monster.type.kind === 'boss' ? 0.15 : 0.35);
    }
    if (died && this.bosses.has(monster)) this.bossBar.hide();
  }

  update(dt: number): void {
    const player = this.controller.position;
    if (this.ambientSpawns.size > 0) {
      this.activateAmbientIsland(inferIslandId(player.x, player.z));
    }
    const engageable =
      this.controller.inputEnabled &&
      !this.controller.isMounted &&
      !isInSafeZone(player.x, player.z) &&
      this.collision.heightAt(player.x, player.z) > -0.4;

    let engagedBoss: Monster | null = null;
    const expiredCrew: Monster[] = [];

    for (const monster of this.monsters) {
      const distanceFromPlayer = Math.hypot(
        player.x - monster.group.position.x,
        player.z - monster.group.position.z,
      );
      if (distanceFromPlayer > 130) {
        monster.group.visible = false;
        if (monster.state === 'dead') {
          if (this.transient.has(monster)) {
            expiredCrew.push(monster);
            continue;
          }
          monster.respawnTimer -= dt;
          if (monster.respawnTimer <= 0) {
            monster.respawn(this.collision.heightAt(monster.home.x, monster.home.y));
            this.callbacks.onMonsterAudioEvent?.('respawn', monster);
            monster.group.visible = false;
          }
        }
        continue;
      }
      monster.group.visible = true;
      const finishedDeath = monster.updateVisual(dt);

      if (monster.state === 'dead') {
        // ลูกเรือ Boarding เป็น one-shot: จบอนิเมชันตายแล้วถอดออกเลย
        if (this.transient.has(monster)) {
          if (finishedDeath) expiredCrew.push(monster);
          continue;
        }
        monster.respawnTimer -= dt;
        if (finishedDeath && monster.respawnTimer <= 0) {
          monster.respawn(this.collision.heightAt(monster.home.x, monster.home.y));
          this.callbacks.onMonsterAudioEvent?.('respawn', monster);
        }
        continue;
      }

      monster.attackCooldown = Math.max(0, monster.attackCooldown - dt);

      // ---------- Knockback: ไถลตามแรงผลักแล้วหน่วงลง ----------
      if (Math.hypot(monster.kbX, monster.kbZ) > 0.05) {
        const nx = monster.group.position.x + monster.kbX * dt;
        const nz = monster.group.position.z + monster.kbZ * dt;
        const ground = this.collision.heightAt(nx, nz);
        if (ground >= GROUND_MIN) {
          monster.group.position.x = nx;
          monster.group.position.z = nz;
          monster.group.position.y = ground;
        }
        const damp = Math.exp(-6 * dt);
        monster.kbX *= damp;
        monster.kbZ *= damp;
      } else {
        monster.kbX = 0;
        monster.kbZ = 0;
      }
      if (monster.staggerTimer > 0) {
        monster.staggerTimer -= dt;
        continue; // เซอยู่ ขยับ/ตีไม่ได้หนึ่งจังหวะ
      }

      const dx = player.x - monster.group.position.x;
      const dz = player.z - monster.group.position.z;
      const distToPlayer = Math.hypot(dx, dz);
      const type = monster.type;

      // ---------- Leash: ไล่ไกลจากบ้านเกินขอบเขต → บังคับกลับก่อน (กันมอนตามเข้าหมู่บ้าน) ----------
      const distFromHome = Math.hypot(
        monster.group.position.x - monster.home.x,
        monster.group.position.z - monster.home.y,
      );
      const leash = Math.min(type.aggroRange * 1.15, 15);
      if (distFromHome > leash) monster.returningHome = true;
      if (monster.returningHome && distFromHome < 2.5) monster.returningHome = false;

      // ---------- ท่าหนักที่ค้างง้างอยู่: นับถอยหลังแล้วปล่อย ----------
      if (monster.pendingHeavy) {
        monster.telegraphTimer -= dt;
        this.faceTo(monster, dx, dz, dt);
        if (monster.telegraphTimer <= 0) {
          monster.pendingHeavy = false;
          monster.attackCount++;
          monster.attackCooldown = type.attackCooldown * 1.25;
          const heavy = type.heavyAttack!;
          monster.playAttackAnimation(true);
          this.callbacks.onMonsterAudioEvent?.('attack', monster);
          // ปล่อยท่า: โดนเฉพาะถ้าผู้เล่นยังอยู่ในระยะ (หลบทัน = พลาด)
          if (engageable && distToPlayer <= type.attackRange * 1.6) {
            this.damagePlayer({
              amount: type.damage * heavy.multiplier,
              unblockable: heavy.tags.includes('unblockable'),
              knockback: heavy.knockback,
              sourceX: monster.group.position.x,
              sourceZ: monster.group.position.z,
              tags: heavy.tags,
            });
          }
        }
        continue;
      }

      if (engageable && distToPlayer < type.aggroRange && !monster.returningHome) {
        // ---------- ไล่/โจมตีผู้เล่น ----------
        const newlyAggro = monster.state !== 'attack' && monster.state !== 'chase';
        if (newlyAggro) this.callbacks.onMonsterAudioEvent?.('aggro', monster);
        this.faceTo(monster, dx, dz, dt);
        if (distToPlayer <= type.attackRange) {
          monster.state = 'attack';
          if (monster.attackCooldown <= 0) {
            const heavy = type.heavyAttack;
            if (heavy && (monster.attackCount + 1) % heavy.everyNth === 0) {
              // เริ่มง้างท่าหนัก (แฟลชเตือนใน updateVisual)
              monster.pendingHeavy = true;
              monster.telegraphTimer = heavy.telegraph;
            } else {
              monster.attackCooldown = type.attackCooldown;
              monster.attackCount++;
              monster.playAttackAnimation(false);
              this.callbacks.onMonsterAudioEvent?.('attack', monster);
              // A short recovery beat keeps enemies from immediately sliding through
              // the player after their active hit frame.
              monster.staggerTimer = Math.max(monster.staggerTimer, 0.22);
              this.damagePlayer({
                amount: type.damage,
                unblockable: false,
                knockback: 0,
                sourceX: monster.group.position.x,
                sourceZ: monster.group.position.z,
                tags: [],
              });
            }
          }
        } else {
          monster.state = 'chase';
          this.moveToward(monster, dx, dz, type.moveSpeed, dt);
        }
        if (this.bosses.has(monster)) {
          engagedBoss = monster;
          this.bossBar.show(type.name, type.level);
          this.bossBar.setFraction(monster.hpFraction);
        }
      } else {
        // ---------- กลับบ้าน / เดินวน ----------
        const hx = monster.home.x - monster.group.position.x;
        const hz = monster.home.y - monster.group.position.z;
        const distHome = Math.hypot(hx, hz);
        if (distHome > 1.6) {
          monster.state = 'return';
          this.moveToward(monster, hx, hz, type.moveSpeed * 0.8, dt);
          this.faceTo(monster, hx, hz, dt);
        } else {
          monster.state = 'idle';
          this.wander(monster, dt);
        }
      }
    }

    if (expiredCrew.length > 0) this.despawnCrew(expiredCrew);

    const nextBossAudioActive = Boolean(engagedBoss?.alive);
    if (nextBossAudioActive !== this.bossAudioActive) {
      this.bossAudioActive = nextBossAudioActive;
      this.callbacks.onBossAudioState?.(nextBossAudioActive);
    }
    if (!nextBossAudioActive) this.bossBar.hide();
  }

  private damagePlayer(attack: IncomingAttack): void {
    const final = this.callbacks.modifyIncomingDamage?.(attack) ?? attack.amount;
    this.controller.hp = Math.max(0, this.controller.hp - final);
    this.callbacks.onPlayerHit?.(final);
    if (this.controller.hp <= 0) {
      this.bossBar.hide();
      for (const monster of this.monsters) monster.attackCooldown = 1.2;
      this.callbacks.onPlayerDefeated?.();
    }
  }

  /** เดินเข้าหาเป้าหมาย (dx,dz) เฉพาะบนพื้นดิน แล้ว snap ให้ติดพื้น */
  private moveToward(monster: Monster, dx: number, dz: number, speed: number, dt: number): void {
    const len = Math.hypot(dx, dz);
    if (len < 0.001) return;
    const step = speed * dt;
    const nx = monster.group.position.x + (dx / len) * step;
    const nz = monster.group.position.z + (dz / len) * step;
    if (!isInSafeZone(monster.group.position.x, monster.group.position.z) && isInSafeZone(nx, nz)) {
      monster.returningHome = true;
      return;
    }
    const ground = this.collision.heightAt(nx, nz);
    if (ground < GROUND_MIN) return; // ไม่เดินลงน้ำ
    monster.group.position.x = nx;
    monster.group.position.z = nz;
    monster.group.position.y = ground;
  }

  private wander(monster: Monster, dt: number): void {
    monster.wanderTimer -= dt;
    if (monster.wanderTimer <= 0) {
      monster.wanderTimer = 1.5 + this.rand() * 2.5;
      monster.wanderAngle = this.rand() * Math.PI * 2;
    }
    // เดินช้า ๆ วนรอบบ้าน แต่ไม่ห่างเกิน
    this.tmp.set(monster.home.x - monster.group.position.x, monster.home.y - monster.group.position.z);
    if (this.tmp.length() > 3) {
      this.moveToward(monster, this.tmp.x, this.tmp.y, monster.type.moveSpeed * 0.5, dt);
    } else {
      this.moveToward(monster, Math.cos(monster.wanderAngle), Math.sin(monster.wanderAngle), monster.type.moveSpeed * 0.4, dt);
    }
  }

  private faceTo(monster: Monster, dx: number, dz: number, dt: number): void {
    const target = Math.atan2(dx, dz);
    let diff = target - monster.group.rotation.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    monster.group.rotation.y += diff * Math.min(1, dt * 6);
  }
}
