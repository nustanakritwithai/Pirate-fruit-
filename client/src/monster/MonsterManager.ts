import * as THREE from 'three';
import type { CharacterController } from '../player/CharacterController';
import type { CollisionSystem } from '../world/Collision';
import type { Effects } from '../effects/Effects';
import type { GraphicsProfile } from '../engine/GraphicsQuality';
import { mulberry32 } from '../world/props';
import { BossBar } from '../ui/BossBar';
import { Monster } from './Monster';
import { MONSTER_TYPES, MONSTER_CAMPS, BOSS_SPAWNS, type MonsterType } from './MonsterData';
import type { CombatRewardSource } from '../combat/CombatData';
import {
  MonsterCellularWorld,
  fleeDirection,
  regroupTarget,
} from './cellular';
import type { MonsterThoughtMarker } from './cellular/MonsterThoughtMarker';

const GROUND_MIN = 0.25; // มอนสเตอร์เดินได้เฉพาะพื้นสูงกว่านี้ (ไม่ลงน้ำ)

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

export class MonsterManager {
  private readonly monsters: Monster[] = [];
  private readonly bosses = new Set<Monster>();
  private readonly bossBar = new BossBar();
  private readonly rand = mulberry32(20260712);
  private readonly tmp = new THREE.Vector2();
  readonly cellularWorld = new MonsterCellularWorld();
  private thoughtMarker: MonsterThoughtMarker | null = null;

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

    for (const spawn of BOSS_SPAWNS) {
      const bossType = MONSTER_TYPES[spawn.typeId];
      const bossSpot = this.findLand(spawn.x, spawn.z, 2);
      this.bosses.add(this.spawnMonster(bossType, bossSpot.x, bossSpot.z, 40));
    }
  }

  private spawnMonster(type: MonsterType, x: number, z: number, respawnDelay: number): Monster {
    const y = this.collision.heightAt(x, z);
    const monster = new Monster(type, x, z, y, respawnDelay);
    this.scene.add(monster.group);
    this.monsters.push(monster);
    this.cellularWorld.bindMonster(monster);
    return monster;
  }

  attachThoughtMarkers(marker: MonsterThoughtMarker): void {
    this.thoughtMarker = marker;
  }

  cellularTick(playerX: number, playerZ: number): void {
    this.cellularWorld.cellularUpdate(playerX, playerZ);
    if (!this.thoughtMarker) return;
    for (const monster of this.monsters) {
      if (!monster.alive || !monster.group.visible) continue;
      const show = this.cellularWorld.shouldShowCombatSignal(monster, playerX, playerZ);
      if (show) {
        this.thoughtMarker.sync(monster, this.cellularWorld.getThoughtState(monster));
      } else if (monster.cellularId) {
        this.thoughtMarker.hide(monster.cellularId);
      }
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
    const died = monster.takeDamage(damage);
    const actualDamage = Math.max(0, hpBefore - monster.hp);
    if (died) {
      const cell = monster.cellularId
        ? this.cellularWorld.getCell(monster.cellularId)
        : undefined;
      if (cell) {
        cell.hp = 0;
        cell.currentState = 'dead';
        cell.nextState = 'dead';
      }
    }
    this.effects.spawnHitSpark(monster.group.position);
    this.callbacks.onMonsterDamaged?.(monster, damage);
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
    const engageable =
      this.controller.inputEnabled &&
      !this.controller.isMounted &&
      this.collision.heightAt(player.x, player.z) > -0.4;

    let engagedBoss: Monster | null = null;

    for (const monster of this.monsters) {
      const distanceFromPlayer = Math.hypot(
        player.x - monster.group.position.x,
        player.z - monster.group.position.z,
      );
      if (distanceFromPlayer > 130) {
        monster.group.visible = false;
        if (monster.state === 'dead') {
          monster.respawnTimer -= dt;
          if (monster.respawnTimer <= 0) {
            monster.respawn(this.collision.heightAt(monster.home.x, monster.home.y));
            this.cellularWorld.resetCellOnRespawn(monster);
            monster.group.visible = false;
          }
        }
        continue;
      }
      monster.group.visible = true;
      const finishedDeath = monster.updateVisual(dt);

      if (monster.state === 'dead') {
        monster.respawnTimer -= dt;
        if (finishedDeath && monster.respawnTimer <= 0) {
          monster.respawn(this.collision.heightAt(monster.home.x, monster.home.y));
          this.cellularWorld.resetCellOnRespawn(monster);
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
      const intent = this.cellularWorld.getCombatIntent(
        monster,
        player.x,
        player.z,
      );
      monster.state = intent.legacyState;
      monster.returningHome = intent.returningHome;

      // ---------- Leash: ไล่ไกลจากบ้านเกินขอบเขต → บังคับกลับก่อน ----------
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

      if (engageable && !monster.returningHome) {
        this.applyCellularIntent(
          monster,
          intent,
          dx,
          dz,
          distToPlayer,
          type,
          dt,
          engageable,
        );
        if (this.bosses.has(monster) && intent.legacyState !== 'idle' && intent.legacyState !== 'return') {
          engagedBoss = monster;
          this.bossBar.show(type.name, type.level);
          this.bossBar.setFraction(monster.hpFraction);
        }
      } else if (monster.returningHome || intent.returningHome) {
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
      } else {
        monster.state = 'idle';
        this.wander(monster, dt);
      }
    }

    if (!engagedBoss || !engagedBoss.alive) this.bossBar.hide();
  }

  private applyCellularIntent(
    monster: Monster,
    intent: ReturnType<MonsterCellularWorld['getIntent']>,
    dx: number,
    dz: number,
    distToPlayer: number,
    type: MonsterType,
    dt: number,
    engageable: boolean,
  ): void {
    const speed = type.moveSpeed * intent.speedMultiplier;

    if (intent.locomotion === 'flee') {
      const flee = fleeDirection(
        monster.group.position.x,
        monster.group.position.z,
        this.controller.position.x,
        this.controller.position.z,
      );
      this.moveToward(monster, flee.dx, flee.dz, speed, dt);
      return;
    }

    if (intent.locomotion === 'regroup') {
      const pack = monster.cellularId
        ? this.cellularWorld.getPackCenter(monster.cellularId)
        : null;
      const cell = monster.cellularId
        ? this.cellularWorld.getCell(monster.cellularId)
        : undefined;
      const target = cell
        ? regroupTarget(cell, pack)
        : { x: monster.home.x, z: monster.home.y };
      const rx = target.x - monster.group.position.x;
      const rz = target.z - monster.group.position.z;
      this.moveToward(monster, rx, rz, speed, dt);
      this.faceTo(monster, rx, rz, dt);
      return;
    }

    if (intent.locomotion === 'rest') {
      return;
    }

    if (intent.shouldFacePlayer) {
      this.faceTo(monster, dx, dz, dt);
    }

    if (intent.shouldAttack && distToPlayer <= type.attackRange) {
      monster.state = 'attack';
      if (monster.attackCooldown <= 0 && engageable) {
        const heavy = type.heavyAttack;
        if (heavy && (monster.attackCount + 1) % heavy.everyNth === 0) {
          monster.pendingHeavy = true;
          monster.telegraphTimer = heavy.telegraph;
        } else {
          monster.attackCooldown = type.attackCooldown;
          monster.attackCount++;
          monster.playAttackAnimation(false);
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
      return;
    }

    if (
      intent.locomotion === 'run'
      || intent.locomotion === 'walk'
      || distToPlayer < type.aggroRange
    ) {
      let mx = dx;
      let mz = dz;
      if (intent.moveTargetX !== undefined && intent.moveTargetZ !== undefined) {
        mx = intent.moveTargetX - monster.group.position.x;
        mz = intent.moveTargetZ - monster.group.position.z;
      }
      const moveDist = Math.hypot(mx, mz);
      const closeEnough = intent.moveTargetX !== undefined
        ? moveDist > 0.8
        : distToPlayer > type.attackRange * 0.9;
      if (closeEnough) {
        monster.state = intent.locomotion === 'run' ? 'chase' : 'return';
        this.moveToward(monster, mx, mz, speed, dt);
      }
      return;
    }

    this.wander(monster, dt);
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

  getMonsterCount(): number {
    return this.monsters.length;
  }

  getAliveMonsterCount(): number {
    return this.monsters.filter((m) => m.alive).length;
  }

  findMonsterNear(worldX: number, worldZ: number, radius = 2.5): Monster | null {
    let best: Monster | null = null;
    let bestDist = radius;
    for (const m of this.monsters) {
      if (!m.alive) continue;
      const dx = m.group.position.x - worldX;
      const dz = m.group.position.z - worldZ;
      const d = Math.hypot(dx, dz);
      if (d < bestDist) {
        bestDist = d;
        best = m;
      }
    }
    return best;
  }

  getMonsterIndex(monster: Monster): number {
    return this.monsters.indexOf(monster) + 1;
  }
}
