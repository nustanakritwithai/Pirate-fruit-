import * as THREE from 'three';
import type { Input } from '../engine/Input';
import type { CharacterController } from '../player/CharacterController';
import type { MonsterManager } from '../monster/MonsterManager';
import type { Effects } from '../effects/Effects';
import type { TouchControls } from '../ui/TouchControls';
import {
  WEAPONS,
  COMBO_WINDOW,
  SKILLS,
  WAVE_SPEED,
  WAVE_LIFETIME,
  WAVE_HIT_RADIUS,
  SPIN_RADIUS,
  SPIN_KNOCKBACK,
  LUNGE_DISTANCE,
  LUNGE_DURATION,
  LUNGE_HIT_RADIUS,
  BLOCK_DAMAGE_RATIO,
  BLOCK_ENERGY_COST,
  REGEN_DELAY,
  REGEN_RATE,
} from './CombatData';
import type { Monster } from '../monster/Monster';

interface WaveProjectile {
  mesh: THREE.Mesh;
  dirX: number;
  dirZ: number;
  life: number;
  hit: Set<Monster>;
}

/**
 * ระบบต่อสู้ของผู้เล่น (Phase 5):
 * อาวุธ 2 ชนิด (หมัด/ดาบ) + คอมโบ 3 จังหวะ, Block, สกิล 3 ตัว, HP regen นอกคอมแบต
 * ดาเมจส่งผ่าน MonsterManager (กรวยหน้า / รัศมี / projectile)
 */
export class PlayerCombat {
  private weaponIndex = 0;
  private attackCooldown = 0;
  private comboStep = 0;
  private comboTimer = 0;
  private skillCooldowns = [0, 0, 0];
  private timeSinceDamaged = 99;

  private readonly projectiles: WaveProjectile[] = [];
  private readonly shield: THREE.Mesh;
  private readonly waveGeo = new THREE.RingGeometry(0.6, 1.7, 22, 1, 0, Math.PI * 0.8);

  constructor(
    private scene: THREE.Scene,
    private input: Input,
    private controller: CharacterController,
    private monsters: MonsterManager,
    private effects: Effects,
    private touch: TouchControls | null,
  ) {
    // โล่ครึ่งทรงกลมโปร่งแสง โชว์ตอนกด Block
    this.shield = new THREE.Mesh(
      new THREE.SphereGeometry(1.25, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.62),
      new THREE.MeshBasicMaterial({
        color: 0x8fd4ff,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.shield.visible = false;
    scene.add(this.shield);

    if (touch) {
      touch.unlockSkills([SKILLS[0].icon, SKILLS[1].icon, SKILLS[2].icon]);
      touch.setWeaponIcon(this.weapon.icon);
      touch.bindSkillCooldowns([
        () => this.skillCooldownFraction(0),
        () => this.skillCooldownFraction(1),
        () => this.skillCooldownFraction(2),
      ]);
    }
  }

  get weapon() {
    return WEAPONS[this.weaponIndex];
  }

  get attackCooldownFraction(): number {
    return Math.max(0, this.attackCooldown) / this.weapon.cooldown;
  }

  skillCooldownFraction(index: number): number {
    return Math.max(0, this.skillCooldowns[index]) / SKILLS[index].cooldown;
  }

  /** กำลังยกโล่อยู่ไหม (block ได้เฉพาะตอนคุมตัวละครปกติ) */
  get blocking(): boolean {
    return (
      this.input.block &&
      this.controller.inputEnabled &&
      !this.controller.isMounted &&
      this.controller.energy > 0
    );
  }

  /** เรียกจาก MonsterManager ก่อนหักเลือดผู้เล่น — Block ลดดาเมจแลกพลังงาน */
  modifyIncomingDamage(amount: number): number {
    this.timeSinceDamaged = 0;
    if (this.blocking && this.controller.energy >= BLOCK_ENERGY_COST) {
      this.controller.energy -= BLOCK_ENERGY_COST;
      this.effects.spawnHitSpark(this.controller.position, 0x8fd4ff);
      return amount * BLOCK_DAMAGE_RATIO;
    }
    return amount;
  }

  update(dt: number): void {
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    for (let i = 0; i < 3; i++) this.skillCooldowns[i] = Math.max(0, this.skillCooldowns[i] - dt);

    // หมดหน้าต่างคอมโบ → เริ่มนับจังหวะใหม่
    this.comboTimer -= dt;
    if (this.comboTimer <= 0) this.comboStep = 0;

    // ---------- HP regen นอกคอมแบต ----------
    this.timeSinceDamaged += dt;
    if (
      this.timeSinceDamaged > REGEN_DELAY &&
      this.controller.hp > 0 &&
      this.controller.hp < this.controller.hpMax &&
      !this.controller.isMounted
    ) {
      this.controller.hp = Math.min(this.controller.hpMax, this.controller.hp + REGEN_RATE * dt);
    }

    // ---------- โล่ Block ----------
    const blocking = this.blocking;
    this.shield.visible = blocking;
    if (blocking) {
      this.shield.position.copy(this.controller.position);
      this.shield.position.y += 0.35;
    }

    const canAct = this.controller.inputEnabled && !this.controller.isMounted;

    // ---------- สลับอาวุธ ----------
    if (this.input.consumeWeaponSwitch() && canAct) {
      this.weaponIndex = (this.weaponIndex + 1) % WEAPONS.length;
      this.comboStep = 0;
      this.attackCooldown = Math.min(this.attackCooldown, 0.15);
      this.touch?.setWeaponIcon(this.weapon.icon);
      this.touch?.notify(`ใช้${this.weapon.name}แล้ว ${this.weapon.icon}`);
    }

    // ---------- โจมตีปกติ + คอมโบ ----------
    const attackRequested = this.input.consumeAttack();
    if (attackRequested && canAct && !blocking && this.attackCooldown === 0) {
      this.performAttack();
    }

    // ---------- สกิล ----------
    const skillRequested = this.input.consumeSkill();
    if (skillRequested >= 1 && skillRequested <= 3 && canAct && !blocking) {
      this.castSkill(skillRequested - 1);
    }

    // ---------- projectile ฟันคลื่น ----------
    this.updateProjectiles(dt);
  }

  private performAttack(): void {
    const weapon = this.weapon;
    const step = this.comboStep;
    const multiplier = weapon.comboMultipliers[step];
    const isFinisher = step === weapon.comboMultipliers.length - 1;

    this.attackCooldown = weapon.cooldown * (isFinisher ? 1.35 : 1);
    this.comboTimer = COMBO_WINDOW;
    this.comboStep = isFinisher ? 0 : step + 1;

    const position = this.controller.position;
    const heading = this.controller.heading;
    this.effects.spawnSlash(position, heading, weapon.color, isFinisher ? 1.6 : 1);
    this.monsters.playerAttack(position, heading, {
      damage: weapon.damage * multiplier,
      range: weapon.range,
      arcCos: Math.cos(THREE.MathUtils.degToRad(weapon.arcDeg / 2)),
      knockback: isFinisher ? weapon.finisherKnockback : 2,
    });
  }

  private castSkill(index: number): void {
    if (this.skillCooldowns[index] > 0) return;
    const skill = SKILLS[index];
    if (this.controller.energy < skill.energyCost) {
      this.touch?.notify('พลังงานไม่พอ ⚡');
      return;
    }
    this.controller.energy -= skill.energyCost;
    this.skillCooldowns[index] = skill.cooldown;

    const position = this.controller.position;
    const heading = this.controller.heading;
    const dirX = Math.sin(heading);
    const dirZ = Math.cos(heading);

    if (skill.id === 'wave-slash') {
      // คลื่นพลังพุ่งไปข้างหน้า ตัดทุกตัวที่ขวางทาง
      const mesh = new THREE.Mesh(
        this.waveGeo,
        new THREE.MeshBasicMaterial({
          color: 0x74e8ff,
          transparent: true,
          opacity: 0.9,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      mesh.position.set(position.x + dirX * 1.2, position.y + 1.15, position.z + dirZ * 1.2);
      mesh.rotation.set(-Math.PI / 2, 0, 0);
      mesh.rotateZ(heading - Math.PI * 0.4);
      this.scene.add(mesh);
      this.projectiles.push({ mesh, dirX, dirZ, life: WAVE_LIFETIME, hit: new Set() });
      this.effects.spawnSlash(position, heading, 0x74e8ff, 1.3);
    } else if (skill.id === 'moon-spin') {
      // หมุนฟาดรอบตัว + ผลักศัตรูกระเด็น
      this.effects.spawnShockwave(position, SPIN_RADIUS);
      this.monsters.damageRadius(position, SPIN_RADIUS, skill.damage, SPIN_KNOCKBACK);
    } else if (skill.id === 'lunge-strike') {
      // พุ่งไปข้างหน้าแล้วฟันทุกตัวตามเส้นทาง
      this.controller.startDash(dirX, dirZ, LUNGE_DISTANCE / LUNGE_DURATION, LUNGE_DURATION);
      const samplePoint = new THREE.Vector3();
      const damaged = new Set<Monster>();
      for (let step = 0; step <= 3; step++) {
        samplePoint.set(
          position.x + dirX * (LUNGE_DISTANCE * step) / 3,
          position.y,
          position.z + dirZ * (LUNGE_DISTANCE * step) / 3,
        );
        for (const monster of this.monsters.monstersNear(samplePoint.x, samplePoint.z, LUNGE_HIT_RADIUS)) {
          if (damaged.has(monster)) continue;
          damaged.add(monster);
          this.monsters.applyHit(monster, skill.damage, position.x, position.z, 6);
        }
      }
      this.effects.spawnSlash(position, heading, 0xffe27a, 1.5);
    }
  }

  private updateProjectiles(dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const wave = this.projectiles[i];
      wave.life -= dt;
      wave.mesh.position.x += wave.dirX * WAVE_SPEED * dt;
      wave.mesh.position.z += wave.dirZ * WAVE_SPEED * dt;
      (wave.mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(1, wave.life / WAVE_LIFETIME + 0.35) * 0.9;

      for (const monster of this.monsters.monstersNear(
        wave.mesh.position.x,
        wave.mesh.position.z,
        WAVE_HIT_RADIUS,
      )) {
        if (wave.hit.has(monster)) continue;
        wave.hit.add(monster);
        this.monsters.applyHit(monster, SKILLS[0].damage, wave.mesh.position.x - wave.dirX, wave.mesh.position.z - wave.dirZ, 5);
      }

      if (wave.life <= 0) {
        this.scene.remove(wave.mesh);
        (wave.mesh.material as THREE.Material).dispose();
        this.projectiles.splice(i, 1);
      }
    }
  }
}
