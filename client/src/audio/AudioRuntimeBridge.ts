import type { BoatManager } from '../boat/BoatManager';
import type { PlayerCombat } from '../combat/PlayerCombat';
import type { Updatable } from '../engine/Game';
import type { CharacterController, MoveState } from '../player/CharacterController';
import { findDockAt } from '../island/IslandRegistry';
import type { AudioManager } from './AudioManager';

interface RuntimeBridgeOptions {
  audio: AudioManager;
  controller: CharacterController;
  boats: BoatManager;
  combat: PlayerCombat;
}

/** Read-only observer over gameplay state. It emits presentation cues only and never feeds
 * state back into combat, monsters, boats, saves or the realtime authority path. */
export class AudioRuntimeBridge implements Updatable {
  private pollAccum = 0;
  private ambienceAccum = 0;
  private stepDistance = 0;
  private combatTimer = 0;
  private deathTimer = 0;
  private bossActive = false;
  private previousMove: MoveState;
  private previousY: number;
  private previousHp: number;
  private previousCombat: string;
  private previousSkillType: PlayerCombat['skillAnimationType'];
  private previousGuard: number;
  private previousRider: 'off' | 'deck' | 'helm';
  private previousAnchor = false;

  constructor(private readonly options: RuntimeBridgeOptions) {
    this.previousMove = { ...options.controller.moveState };
    this.previousY = options.controller.position.y;
    this.previousHp = options.controller.hp;
    this.previousCombat = options.combat.state;
    this.previousSkillType = options.combat.skillAnimationType;
    this.previousGuard = options.combat.guardFraction;
    this.previousRider = options.boats.riderState;
    this.previousAnchor = options.boats.activeBoat?.anchor ?? false;
  }

  markCombat(seconds = 4): void {
    this.combatTimer = Math.max(this.combatTimer, seconds);
  }

  notifyDeath(eventId?: string): void {
    this.deathTimer = Math.max(this.deathTimer, 0.9);
    this.options.audio.play('player.death', eventId ? { eventId } : undefined);
    this.syncMusic();
  }

  notifyRespawn(eventId?: string): void {
    this.deathTimer = 0;
    this.options.audio.play('player.respawn', eventId ? { eventId } : undefined);
    this.syncMusic();
  }

  setBossActive(active: boolean): void {
    this.bossActive = active;
    if (active) this.markCombat(5);
  }

  update(dt: number): void {
    if (!this.options.audio.enabled) return;
    this.pollAccum += dt;
    this.ambienceAccum += dt;
    this.combatTimer = Math.max(0, this.combatTimer - dt);
    this.deathTimer = Math.max(0, this.deathTimer - dt);
    if (this.pollAccum < 0.05) return;
    const elapsed = this.pollAccum;
    this.pollAccum = 0;
    this.observeMovement(elapsed);
    this.observeCombat();
    this.observeBoat();
    this.observeHealth();
    this.options.audio.setListener(this.options.controller.position);
    this.syncMusic();
    this.observeAmbience();
  }

  private observeMovement(dt: number): void {
    const { audio, controller } = this.options;
    const move = controller.moveState;
    if (!this.previousMove.dashing && move.dashing) audio.play('player.dash');
    if (!this.previousMove.swimming && move.swimming) audio.play('player.swim');
    if (this.previousMove.onGround && !move.onGround && controller.verticalSpeed > 0.5) {
      audio.play('player.jump');
    }
    if (!this.previousMove.onGround && move.onGround && this.previousY > controller.position.y + 0.02) {
      audio.play('player.land');
    }
    if (move.onGround && move.speed > 0.7 && this.options.boats.riderState === 'off') {
      this.stepDistance += move.speed * dt;
      if (this.stepDistance >= (move.sprinting ? 2.1 : 1.65)) {
        this.stepDistance = 0;
        audio.play('player.step');
      }
    } else {
      this.stepDistance = Math.min(this.stepDistance, 1);
    }
    this.previousMove = { ...move };
    this.previousY = controller.position.y;
  }

  private observeCombat(): void {
    const state = this.options.combat.state;
    if (state !== this.previousCombat) {
      if (state.startsWith('attack')) {
        this.options.audio.play('combat.m1-swing');
        this.markCombat();
      } else if (state === 'casting') {
        this.previousSkillType = this.options.combat.skillAnimationType;
        this.options.audio.play('combat.skill-cast');
        this.markCombat(5);
      } else if (state === 'stunned' || state === 'knockback' || state === 'knockdown') {
        this.options.audio.play(
          this.previousGuard > 0 && this.options.combat.guardFraction <= 0
            ? 'combat.guard-break'
            : 'combat.stun',
        );
        this.markCombat();
      } else if (state === 'dead') {
        this.notifyDeath();
      }
    }
    if (
      this.previousCombat === 'casting'
      && state === 'idle'
      && (this.previousSkillType === 'projectile'
        || this.previousSkillType === 'homing'
        || this.previousSkillType === 'beam')
    ) {
      this.options.audio.play('combat.projectile', { position: this.options.controller.position });
    }
    this.previousCombat = state;
    this.previousGuard = this.options.combat.guardFraction;
  }

  private observeBoat(): void {
    const { audio, boats } = this.options;
    const rider = boats.riderState;
    const boat = boats.activeBoat;
    if (rider !== this.previousRider) {
      if (this.previousRider === 'off' && rider !== 'off') audio.play('boat.board');
      if (this.previousRider !== 'off' && rider === 'off') audio.play('boat.disembark');
      this.previousRider = rider;
    }
    const anchor = boat?.anchor ?? false;
    if (anchor !== this.previousAnchor && boat) {
      audio.play('boat.anchor', { position: boat.group.position });
      this.previousAnchor = anchor;
    }
    if (boat && rider !== 'off' && Math.abs(boat.speed) > 0.8) {
      audio.play('boat.throttle', { position: boat.group.position });
    }
  }

  private observeHealth(): void {
    const hp = this.options.controller.hp;
    if (hp < this.previousHp) {
      this.markCombat();
      if (this.options.controller.moveState.swimming) this.options.audio.play('player.drowning');
      if (this.options.combat.blocking) this.options.audio.play('combat.block');
    }
    if (this.previousHp > 0 && hp <= 0) this.notifyDeath();
    if (this.previousHp <= 0 && hp > 0) this.notifyRespawn();
    this.previousHp = hp;
  }

  private syncMusic(): void {
    const rider = this.options.boats.riderState;
    this.options.audio.setMusicObservation({
      dead: this.deathTimer > 0 || this.options.controller.hp <= 0,
      boss: this.bossActive,
      combat: this.combatTimer > 0,
      onBoat: rider !== 'off',
      onFoot: rider === 'off',
      loading: false,
    });
  }

  private observeAmbience(): void {
    if (this.ambienceAccum < 2.8) return;
    this.ambienceAccum = 0;
    const position = this.options.controller.position;
    const cue = this.options.boats.riderState !== 'off'
      ? 'world.waves'
      : findDockAt(position.x, position.z) ? 'world.dock' : 'world.wind';
    this.options.audio.play(cue, {
      position: { x: position.x + 5, y: position.y, z: position.z + 3 },
    });
  }
}
