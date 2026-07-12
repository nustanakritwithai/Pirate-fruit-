import * as THREE from 'three';
import type { CharacterController } from '../player/CharacterController';
import type { CollisionSystem } from '../world/Collision';
import type { Effects } from '../effects/Effects';
import type { GraphicsProfile } from '../engine/GraphicsQuality';
import { mulberry32 } from '../world/props';
import { BossBar } from '../ui/BossBar';
import { Monster } from './Monster';
import { MONSTER_TYPES, MONSTER_CAMPS, BOSS_SPAWN, type MonsterType } from './MonsterData';

const GROUND_MIN = 0.25; // มอนสเตอร์เดินได้เฉพาะพื้นสูงกว่านี้ (ไม่ลงน้ำ)

export interface AttackOptions {
  damage: number;
  range: number;
  /** cos ของครึ่งมุมกรวยหน้า */
  arcCos: number;
  knockback?: number;
}

export interface MonsterCallbacks {
  onPlayerHit?: () => void;
  onPlayerDefeated?: () => void;
  /** ให้ระบบภายนอก (เช่น Block) ปรับดาเมจก่อนเข้าตัวผู้เล่น */
  modifyIncomingDamage?: (amount: number) => number;
  /** แจ้งเมื่อมอนสเตอร์โดนดาเมจ (ไว้โชว์ตัวเลขดาเมจ) */
  onMonsterDamaged?: (monster: Monster, amount: number) => void;
}

/** ปรับจำนวนมอนสเตอร์ตามระดับกราฟิก เพื่อคุมภาระมือถือ */
function countScale(tier: GraphicsProfile['tier']): number {
  return tier === 'low' ? 0.6 : tier === 'medium' ? 0.85 : 1;
}

export class MonsterManager {
  private readonly monsters: Monster[] = [];
  private boss: Monster | null = null;
  private readonly bossBar = new BossBar();
  private readonly rand = mulberry32(20260712);
  private readonly tmp = new THREE.Vector2();

  constructor(
    private scene: THREE.Scene,
    private controller: CharacterController,
    private collision: CollisionSystem,
    private effects: Effects,
    graphics: GraphicsProfile,
    private callbacks: MonsterCallbacks = {},
  ) {
    const scale = countScale(graphics.tier);

    for (const camp of MONSTER_CAMPS) {
      const type = MONSTER_TYPES[camp.typeId];
      const count = Math.max(1, Math.round(camp.count * scale));
      for (let i = 0; i < count; i++) {
        const spot = this.findLand(camp.x, camp.z, camp.radius);
        this.spawnMonster(type, spot.x, spot.z, 12);
      }
    }

    // บอส
    const bossType = MONSTER_TYPES[BOSS_SPAWN.typeId];
    const bossSpot = this.findLand(BOSS_SPAWN.x, BOSS_SPAWN.z, 2);
    this.boss = this.spawnMonster(bossType, bossSpot.x, bossSpot.z, 40);
  }

  private spawnMonster(type: MonsterType, x: number, z: number, respawnDelay: number): Monster {
    const y = this.collision.heightAt(x, z);
    const monster = new Monster(type, x, z, y, respawnDelay);
    this.scene.add(monster.group);
    this.monsters.push(monster);
    return monster;
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
      this.applyHit(monster, options.damage, position.x, position.z, options.knockback ?? 0);
      hits++;
    }
    return hits;
  }

  /** ดาเมจทุกตัวในรัศมีรอบจุด (สกิล AoE) คืนจำนวนตัวที่โดน */
  damageRadius(center: THREE.Vector3, radius: number, damage: number, knockback = 0): number {
    let hits = 0;
    for (const monster of this.monsters) {
      if (!monster.alive) continue;
      const dx = monster.group.position.x - center.x;
      const dz = monster.group.position.z - center.z;
      if (Math.hypot(dx, dz) > radius + monster.type.scale * 0.5) continue;
      this.applyHit(monster, damage, center.x, center.z, knockback);
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

  /** ทำดาเมจ + knockback (บอสต้านทานแรงผลัก/อาการเซ) */
  applyHit(monster: Monster, damage: number, srcX: number, srcZ: number, knockback: number): void {
    const died = monster.takeDamage(damage);
    this.effects.spawnHitSpark(monster.group.position);
    this.callbacks.onMonsterDamaged?.(monster, damage);
    if (!died && knockback > 0) {
      const dx = monster.group.position.x - srcX;
      const dz = monster.group.position.z - srcZ;
      const len = Math.hypot(dx, dz) || 1;
      const resist = monster.type.kind === 'boss' ? 0.25 : 1;
      monster.kbX += (dx / len) * knockback * resist;
      monster.kbZ += (dz / len) * knockback * resist;
      monster.staggerTimer = Math.max(monster.staggerTimer, monster.type.kind === 'boss' ? 0.15 : 0.35);
    }
    if (died && monster === this.boss) this.bossBar.hide();
  }

  update(dt: number): void {
    const player = this.controller.position;
    const engageable =
      this.controller.inputEnabled &&
      !this.controller.isMounted &&
      this.collision.heightAt(player.x, player.z) > -0.4;

    let bossEngaged = false;

    for (const monster of this.monsters) {
      const finishedDeath = monster.updateVisual(dt);

      if (monster.state === 'dead') {
        monster.respawnTimer -= dt;
        if (finishedDeath && monster.respawnTimer <= 0) {
          monster.respawn(this.collision.heightAt(monster.home.x, monster.home.y));
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

      if (engageable && distToPlayer < type.aggroRange) {
        // ---------- ไล่/โจมตีผู้เล่น ----------
        this.faceTo(monster, dx, dz, dt);
        if (distToPlayer <= type.attackRange) {
          monster.state = 'attack';
          if (monster.attackCooldown <= 0) {
            monster.attackCooldown = type.attackCooldown;
            this.damagePlayer(type.damage);
          }
        } else {
          monster.state = 'chase';
          this.moveToward(monster, dx, dz, type.moveSpeed, dt);
        }
        if (monster === this.boss) {
          bossEngaged = true;
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

    if (this.boss && (!this.boss.alive || !bossEngaged)) this.bossBar.hide();
  }

  private damagePlayer(amount: number): void {
    const final = this.callbacks.modifyIncomingDamage?.(amount) ?? amount;
    this.controller.hp = Math.max(0, this.controller.hp - final);
    this.callbacks.onPlayerHit?.();
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
