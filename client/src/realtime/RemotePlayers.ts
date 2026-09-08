/**
 * S13/S14 — Multiplayer Movement + Naval (ฝั่งภาพ)
 * รับ presence ของผู้เล่นคนอื่นจาก RealtimeClient แล้วเรนเดอร์:
 * - เดินเท้า → Pirate V1 แบบเดียวกับผู้เล่นปัจจุบัน
 * - S14 ขับเรือ → เรือ proxy ขนาด/สีตามรุ่น (BOAT_DEFINITIONS)
 * ไถลเข้าหาตำแหน่งล่าสุดแบบนุ่ม (interpolate) เพื่อกลบ jitter ของเน็ต
 * - presence เป็นข้อมูลแสดงผลล้วน: ไม่มีผล gameplay/collision (เฟสนี้ทะลุกันได้)
 * - ผู้เล่นบนเกาะอื่นถูก Server กรองออกแล้ว; ที่นี่ยังกรองซ้ำตามเกาะปัจจุบันด้วย
 */

import * as THREE from 'three';
import type { Updatable } from '../engine/Game';
import { BOAT_DEFINITIONS } from '../boat/BoatData';
import type { RealtimePresenceSnapshot } from './RealtimeClient';
import type { RealtimeKnockback } from '@pirate-fruit/shared';
import type { RealtimeVisualEvent, RealtimeProjectileState } from '@pirate-fruit/shared';
import { createPiratePlayerVisual } from '../art/PiratePlayerVisual';
import { attachmentSocketsFromPirateRig } from '../art/CharacterRig';
import { EquipmentVisuals } from '../art/EquipmentVisuals';
import { createPlayerShieldVisual } from '../art/PlayerShieldVisual';
import {
  Effects,
  type BladeTrailPresentationDiagnostic,
  type EnergyProjectileVisual,
} from '../effects/Effects';
import { PlayerActionAnimator } from '../animation/PlayerActionAnimator';
import type { GraphicsTier } from '../engine/GraphicsQuality';

const LERP_PER_SECOND = 9; // ความเร็วไถลเข้าหาเป้า (สูง = ตามติดขึ้น)
const STALE_MS = 20_000; // ไม่ได้ยิน presence เกินนี้ = ถือว่าหลุด เอาออก
const MAX_EXTRAPOLATION_SECONDS = 0.25; // Server world snapshot cadence = 4Hz
const MAX_REMOTE_SPEED = 24; // presentation-only safety bound (world units/sec)
const MAX_TELEPORT_SAMPLE_DISTANCE = 12; // larger samples reset velocity, never extrapolate
const MAX_RENDER_SPEED = 60; // presentation-only correction bound (world units/sec)
const RENDER_PROGRESS_FALLBACK_SECONDS = 0.6;

type RemoteLod = 'full' | 'low' | 'hidden';
interface RemoteRenderOptions {
  focus?: () => THREE.Vector3;
  tier?: GraphicsTier;
}

const BOAT_BY_ID = new Map(BOAT_DEFINITIONS.map((definition) => [definition.id, definition]));

/** ชนิด avatar ปัจจุบัน — เปลี่ยนเมื่อผู้เล่นขึ้น/ลงเรือ (หรือเปลี่ยนรุ่นเรือ) */
type AvatarKind = string; // 'foot' | `boat:${boatId}`

interface RemoteProjectileSample {
  state: RealtimeProjectileState;
  receivedAt: number;
  elapsedSinceSample: number;
  correction: THREE.Vector3;
}

interface RemotePlayer {
  group: THREE.Group;
  target: THREE.Vector3;
  targetHeading: number;
  islandId: string;
  onBoat: boolean;
  name: string;
  avatarKind: AvatarKind;
  lastSeenAt: number;
  /** S15: แพ้ (ถูกซ่อนจนกว่าจะเกิดใหม่) */
  defeated: boolean;
  hp: number;
  hpMax: number;
  hpKnown: boolean;
  healthBar: THREE.Sprite;
  animator: PlayerActionAnimator | null;
  equipment: EquipmentVisuals | null;
  projectiles: Map<string, EnergyProjectileVisual>;
  projectileSamples: Map<string, RemoteProjectileSample>;
  endedProjectiles: Set<string>;
  shield: THREE.Mesh | null;
  locomotion: 'idle' | 'walk' | 'run' | 'swim';
  animation: NonNullable<RealtimePresenceSnapshot['animation']>;
  /** Current sender runtime and high-water sequence for short-action dedupe. */
  actionSessionId: string | null;
  actionHighestSequence: number;
  activeActionIdentity: string | null;
  /** Render-only progress for sparse 4Hz samples; never feeds targeting/combat. */
  renderActionIdentity: string | null;
  renderAttackProgress: number;
  renderSkillProgress: number;
  retiredActionSessions: Set<string>;
  lod: RemoteLod;
  snapshot: RealtimePresenceSnapshot;
  /** Presentation-only recoil layered over interpolated Server presence. */
  hitOffset: THREE.Vector3;
  /** Last hit impulse, held until a newer presence frame confirms the movement. */
  hitOrigin: THREE.Vector3;
  hitDirection: THREE.Vector3;
  hitDistance: number;
  hitUntil: number;
  targetVelocity: THREE.Vector3;
  visualSessionId: string | null;
  visualSequence: number;
  visualStateSequence: number;
  retiredVisualSessions: Set<string>;
}

function defaultAnimation(): NonNullable<RealtimePresenceSnapshot['animation']> {
  return { combatState: 'idle', category: 'style', onGround: true, dashing: false, verticalVelocity: 0 };
}

function deadAnimation(
  previous: NonNullable<RealtimePresenceSnapshot['animation']>,
): NonNullable<RealtimePresenceSnapshot['animation']> {
  const {
    actionSessionId: _actionSessionId,
    actionSequence: _actionSequence,
    actionDurationMs: _actionDurationMs,
    ...base
  } = previous as RemoteAnimationWithActionIdentity;
  return {
    ...base,
    combatState: 'dead',
    onGround: true,
    dashing: false,
    verticalVelocity: 0,
  };
}

type RemoteAnimationWithActionIdentity = NonNullable<RealtimePresenceSnapshot['animation']> & {
  actionSessionId?: string;
  actionSequence?: number;
  actionDurationMs?: number;
};

const ACTION_SESSION_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const MAX_ACTION_SEQUENCE = 2_147_483_647;
const MAX_RETIRED_ACTION_SESSIONS = 8;

function actionIdentityOf(animation: RemoteAnimationWithActionIdentity): {
  sessionId: string;
  sequence: number;
  identity: string;
} | null {
  if (typeof animation.actionSessionId !== 'string'
    || !ACTION_SESSION_PATTERN.test(animation.actionSessionId)
    || !Number.isInteger(animation.actionSequence)
    || animation.actionSequence! < 1
    || animation.actionSequence! > MAX_ACTION_SEQUENCE) return null;
  return {
    sessionId: animation.actionSessionId,
    sequence: animation.actionSequence!,
    identity: `${animation.actionSessionId}:${animation.actionSequence}`,
  };
}

function initializeActionDedupe(animation: RemoteAnimationWithActionIdentity): Pick<RemotePlayer,
  'actionSessionId' | 'actionHighestSequence' | 'activeActionIdentity' | 'retiredActionSessions'> {
  const action = actionIdentityOf(animation);
  return {
    actionSessionId: action?.sessionId ?? null,
    actionHighestSequence: action?.sequence ?? 0,
    activeActionIdentity: action?.identity ?? null,
    retiredActionSessions: new Set<string>(),
  };
}

/**
 * Accept an unseen action, or another sample of the currently active action.
 * A replay after idle/newer action is ignored so it cannot restart animation.
 */
function applyRemoteAnimation(
  player: RemotePlayer,
  animation: RemoteAnimationWithActionIdentity,
): void {
  const action = actionIdentityOf(animation);
  if (!action) {
    player.activeActionIdentity = null;
    player.animation = animation;
    player.renderActionIdentity = null;
    player.renderAttackProgress = 0;
    player.renderSkillProgress = 0;
    return;
  }

  if (player.retiredActionSessions.has(action.sessionId)) return;
  if (player.actionSessionId !== action.sessionId) {
    if (player.actionSessionId) {
      player.retiredActionSessions.add(player.actionSessionId);
      while (player.retiredActionSessions.size > MAX_RETIRED_ACTION_SESSIONS) {
        const oldest = player.retiredActionSessions.values().next().value as string | undefined;
        if (!oldest) break;
        player.retiredActionSessions.delete(oldest);
      }
    }
    player.actionSessionId = action.sessionId;
    player.actionHighestSequence = action.sequence;
    player.activeActionIdentity = action.identity;
    player.animation = animation;
    player.renderActionIdentity = action.identity;
    player.renderAttackProgress = animation.attackProgress ?? 0;
    player.renderSkillProgress = animation.skillAnimationProgress ?? 0;
    return;
  }

  if (action.sequence > player.actionHighestSequence) {
    player.actionHighestSequence = action.sequence;
    player.activeActionIdentity = action.identity;
    player.animation = animation;
    player.renderActionIdentity = action.identity;
    player.renderAttackProgress = animation.attackProgress ?? 0;
    player.renderSkillProgress = animation.skillAnimationProgress ?? 0;
    return;
  }
  if (action.sequence === player.actionHighestSequence
    && action.identity === player.activeActionIdentity) {
    player.animation = animation;
    player.renderActionIdentity = action.identity;
    player.renderAttackProgress = Math.max(player.renderAttackProgress, animation.attackProgress ?? 0);
    player.renderSkillProgress = Math.max(player.renderSkillProgress, animation.skillAnimationProgress ?? 0);
  }
}

function animationForRender(
  player: RemotePlayer,
  dt: number,
): RemoteAnimationWithActionIdentity {
  const animation = player.animation as RemoteAnimationWithActionIdentity;
  const action = actionIdentityOf(animation);
  if (!action || player.renderActionIdentity !== action.identity) return animation;
  // actionDurationMs is the bounded relay/latch window, not a physical combat
  // duration. Use a presentation fallback only when wire progress stalls;
  // monotonic wire progress remains the lower bound and identity never replays.
  const durationSeconds = RENDER_PROGRESS_FALLBACK_SECONDS;
  const step = Math.max(0, dt) / durationSeconds;
  const nextAttackProgress = Math.min(1, player.renderAttackProgress + step);
  const nextSkillProgress = Math.min(1, player.renderSkillProgress + step);
  player.renderAttackProgress = Math.max(player.renderAttackProgress, nextAttackProgress);
  player.renderSkillProgress = Math.max(player.renderSkillProgress, nextSkillProgress);
  return {
    ...animation,
    ...(animation.attackProgress !== undefined
      ? { attackProgress: player.renderAttackProgress }
      : {}),
    ...(animation.skillAnimationProgress !== undefined
      ? { skillAnimationProgress: player.renderSkillProgress }
      : {}),
  };
}

function makeNameSprite(name: string): THREE.Sprite {
  // headless (เทสต์) ไม่มี document — คืน sprite เปล่า ๆ ให้ logic ทำงานต่อได้
  if (typeof document === 'undefined') {
    return new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
  }
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = 'rgba(5,18,26,.72)';
    ctx.beginPath();
    ctx.roundRect(8, 8, 368, 80, 26);
    ctx.fill();
    ctx.strokeStyle = 'rgba(126,203,255,.7)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.font = '700 34px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#d6ecff';
    ctx.fillText(name.slice(0, 16), 192, 49);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(3.6, 0.9, 1);
  sprite.position.y = 3.4;
  return sprite;
}

function makeHealthBar(): THREE.Sprite {
  if (typeof document === 'undefined') return new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 24;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(2.4, 0.23, 1);
  sprite.position.y = 3.05;
  return sprite;
}

function updateHealthBar(sprite: THREE.Sprite, hp: number, hpMax: number, dead: boolean): void {
  const ratio = Math.max(0, Math.min(1, hp / Math.max(1, hpMax)));
  sprite.scale.x = 2.4;
  sprite.visible = !dead;
  const material = sprite.material as THREE.SpriteMaterial;
  const canvas = material.map?.image as HTMLCanvasElement | undefined;
  const ctx = canvas?.getContext?.('2d');
  if (!ctx || !canvas) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#260b0b'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = ratio > 0.35 ? '#4ade80' : '#ef4444'; ctx.fillRect(2, 2, (canvas.width - 4) * ratio, canvas.height - 4);
  if (material.map) material.map.needsUpdate = true;
}

/** Current canonical on-foot visual; appearance fields are ready for future variants. */
function makePlayerBody(snapshot: RealtimePresenceSnapshot): { group: THREE.Group; animator: PlayerActionAnimator; equipment: EquipmentVisuals; shield: THREE.Mesh } {
  const visual = createPiratePlayerVisual();
  visual.group.name = `remote-player:${snapshot.appearance?.avatarId ?? 'pirate-v1'}`;
  const active = snapshot.presentation?.activeItem;
  const equipment = new EquipmentVisuals(
    visual.group,
    () => active ? { itemId: active.itemId, category: active.category, name: active.itemId } : null,
    attachmentSocketsFromPirateRig(visual.rig),
  );
  const shield = createPlayerShieldVisual();
  visual.group.add(shield);
  return { group: visual.group, animator: new PlayerActionAnimator(visual.rig), equipment, shield };
}

/** Three-mesh silhouette for mid-distance players; same Pirate V1 palette, no rig cost. */
/** S14: เรือ proxy แบบเบา (ตัวเรือ + ใบเรือ) ขนาด/สีตามรุ่น — ไม่ใช้ BoatModel เต็ม */
function makeBoatProxy(boatId: string | undefined): THREE.Group {
  const group = new THREE.Group();
  const definition = boatId ? BOAT_BY_ID.get(boatId) : undefined;
  const length = definition?.length ?? 6;
  const width = definition?.width ?? 2.2;
  const color = definition?.color ?? 0x8a5a2b;
  const hullMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.05 });
  const hull = new THREE.Mesh(new THREE.BoxGeometry(width, 0.9, length), hullMaterial);
  hull.position.y = 0.45;
  group.add(hull);
  if (definition?.hasSail !== false) {
    const mastMaterial = new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.8 });
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, length * 0.7, 8), mastMaterial);
    mast.position.y = length * 0.35 + 0.9;
    group.add(mast);
    const sailMaterial = new THREE.MeshStandardMaterial({
      color: 0xf3ead2, roughness: 0.9, side: THREE.DoubleSide,
    });
    const sail = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.8, length * 0.5), sailMaterial);
    sail.position.set(0, length * 0.3 + 0.9, 0);
    group.add(sail);
  }
  return group;
}

function avatarKindOf(snapshot: RealtimePresenceSnapshot): AvatarKind {
  return snapshot.onBoat ? `boat:${snapshot.boatId ?? 'default'}` : 'foot';
}

function buildAvatar(snapshot: RealtimePresenceSnapshot, lod: RemoteLod): { group: THREE.Group; animator: PlayerActionAnimator | null; equipment: EquipmentVisuals | null; shield: THREE.Mesh | null } {
  const avatar = snapshot.onBoat
    ? { group: makeBoatProxy(snapshot.boatId), animator: null, equipment: null, shield: null }
    : makePlayerBody(snapshot);
  const { group } = avatar;
  if (lod !== 'hidden') group.add(makeNameSprite(snapshot.name || 'นักผจญภัย'));
  return avatar;
}

export class RemotePlayers implements Updatable {
  private readonly players = new Map<string, RemotePlayer>();
  private readonly pendingAuthorityDamage = new Map<string, number>();
  private readonly pendingAuthorityHp = new Map<string, { hp: number; hpMax: number; lifeState: 'alive' | 'dead' }>();
  private readonly pendingAuthorityResults = new Map<string, { finalHp: number; expiresAt: number }>();
  private readonly effects: Effects;
  private currentIslandId: string;
  private receivedPresence = 0;
  private acceptedPresence = 0;
  private ignoredIslandPresence = 0;
  private lastPresence: { playerId: string; islandId: string; accepted: boolean } | null = null;

  constructor(
    private readonly scene: THREE.Scene,
    islandId: string,
    private readonly now: () => number = () => Date.now(),
    _renderOptions: RemoteRenderOptions = {},
  ) {
    this.currentIslandId = islandId;
    this.effects = new Effects(scene);
  }

  get count(): number {
    return this.players.size;
  }

  /** Read-only runtime counters for production multiplayer diagnosis. */
  get diagnostics(): {
    currentIslandId: string;
    receivedPresence: number;
    acceptedPresence: number;
    ignoredIslandPresence: number;
    renderedPlayers: number;
    lod: Record<RemoteLod, number>;
    lastPresence: { playerId: string; islandId: string; accepted: boolean } | null;
  } {
    const lod: Record<RemoteLod, number> = { full: 0, low: 0, hidden: 0 };
    for (const player of this.players.values()) lod[player.lod] += 1;
    return {
      currentIslandId: this.currentIslandId,
      receivedPresence: this.receivedPresence,
      acceptedPresence: this.acceptedPresence,
      ignoredIslandPresence: this.ignoredIslandPresence,
      renderedPlayers: this.players.size,
      lod,
      lastPresence: this.lastPresence ? { ...this.lastPresence } : null,
    };
  }

  /** Narrow, credential-free Browser acceptance seam for Pocket presentation. */
  presentationDiagnostics(): { bladeTrails: BladeTrailPresentationDiagnostic[] } {
    return { bladeTrails: this.effects.bladeTrailDiagnostics() };
  }

  /** ผู้เล่นเราย้ายเกาะ → ล้างผีทั้งหมด (Server จะ seed ชุดใหม่ของเกาะใหม่เอง) */
  setIsland(islandId: string): void {
    if (islandId === this.currentIslandId) return;
    this.currentIslandId = islandId;
    for (const playerId of [...this.players.keys()]) this.remove(playerId);
  }

  applyPresence(snapshot: RealtimePresenceSnapshot): void {
    this.receivedPresence += 1;
    if (snapshot.islandId !== this.currentIslandId) {
      this.ignoredIslandPresence += 1;
      this.lastPresence = { playerId: snapshot.playerId, islandId: snapshot.islandId, accepted: false };
      // A delayed frame from the previous island must not delete a newer visible avatar.
      // Explicit presence-leave and setIsland remain the only removal paths.
      return;
    }
    this.acceptedPresence += 1;
    this.lastPresence = { playerId: snapshot.playerId, islandId: snapshot.islandId, accepted: true };
    const receivedAt = this.now();
    const kind = avatarKindOf(snapshot);
    let player = this.players.get(snapshot.playerId);
    if (!player) {
      const lod = this.initialLod(snapshot);
      const avatar = buildAvatar(snapshot, lod);
      const { group } = avatar;
      const healthBar = makeHealthBar();
      healthBar.visible = false;
      group.add(healthBar);
      group.position.set(snapshot.x, snapshot.y, snapshot.z);
      group.rotation.y = snapshot.heading;
      this.scene.add(group);
      const animation = snapshot.animation ?? defaultAnimation();
      this.players.set(snapshot.playerId, {
        group,
        target: new THREE.Vector3(snapshot.x, snapshot.y, snapshot.z),
        targetHeading: snapshot.heading,
        islandId: snapshot.islandId,
        onBoat: snapshot.onBoat,
        name: snapshot.name,
        avatarKind: kind,
        lastSeenAt: receivedAt,
        defeated: false,
        hp: 100,
        hpMax: 100,
        hpKnown: false,
        healthBar,
        animator: avatar.animator,
        equipment: avatar.equipment,
        projectiles: new Map(),
        projectileSamples: new Map(),
        endedProjectiles: new Set(),
        shield: avatar.shield,
        locomotion: snapshot.locomotion ?? 'idle',
        animation,
        ...initializeActionDedupe(animation as RemoteAnimationWithActionIdentity),
        renderActionIdentity: actionIdentityOf(animation as RemoteAnimationWithActionIdentity)?.identity ?? null,
        renderAttackProgress: animation.attackProgress ?? 0,
        renderSkillProgress: animation.skillAnimationProgress ?? 0,
        lod,
        snapshot,
        hitOffset: new THREE.Vector3(),
        hitOrigin: new THREE.Vector3(snapshot.x, snapshot.y, snapshot.z),
        hitDirection: new THREE.Vector3(),
        hitDistance: 0,
        hitUntil: 0,
        targetVelocity: new THREE.Vector3(),
        visualSessionId: null,
        visualSequence: 0,
        visualStateSequence: 0,
        retiredVisualSessions: new Set(),
      });
      const created = this.players.get(snapshot.playerId);
      if (created) {
        this.applyVisual(snapshot.visual, created);
        const pending = this.pendingAuthorityHp.get(snapshot.playerId.toLowerCase());
        if (pending) {
          this.applyAuthoritativeHp(snapshot.playerId, pending.hp, pending.hpMax, pending.lifeState);
          this.pendingAuthorityHp.delete(snapshot.playerId.toLowerCase());
        }
        const pendingResult = this.pendingAuthorityResults.get(snapshot.playerId.toLowerCase());
        if (pendingResult && pendingResult.expiresAt >= this.now()) {
          this.applyAuthoritativeResult(snapshot.playerId, pendingResult.finalHp);
        }
        this.pendingAuthorityResults.delete(snapshot.playerId.toLowerCase());
      }
      return;
    }
    // S14: ผู้เล่นขึ้น/ลงเรือ หรือเปลี่ยนรุ่นเรือ → สร้าง avatar ใหม่ที่ตำแหน่งเดิม
    if (kind !== player.avatarKind) {
      const position = player.group.position.clone();
      const rotationY = player.group.rotation.y;
      this.disposeGroup(player.group);
      const nextLod = this.initialLod(snapshot);
      const avatar = buildAvatar(snapshot, nextLod);
      const { group } = avatar;
      const healthBar = makeHealthBar();
      healthBar.visible = false;
      group.add(healthBar);
      group.position.copy(position);
      group.rotation.y = rotationY;
      this.scene.add(group);
      player.group = group;
      player.avatarKind = kind;
      player.animator = avatar.animator;
      player.equipment = avatar.equipment;
      player.shield = avatar.shield;
      player.healthBar = healthBar;
      player.lod = nextLod;
    }
    // Presence frames already in flight can describe the pre-hit position. Keep
    // the recoil visible until a later frame has actually moved in the impulse
    // direction; otherwise the ghost only twitches and immediately snaps back.
    const sampleSeconds = Math.max(
      0.05,
      Math.min(1, (receivedAt - player.lastSeenAt) / 1000),
    );
    const displacement = new THREE.Vector3(
      snapshot.x - player.target.x,
      snapshot.y - player.target.y,
      snapshot.z - player.target.z,
    );
    if (displacement.length() > MAX_TELEPORT_SAMPLE_DISTANCE) {
      player.targetVelocity.set(0, 0, 0);
    } else if (displacement.lengthSq() > 1e-6) {
      const rawVelocity = displacement.multiplyScalar(1 / sampleSeconds);
      // Extrapolate horizontal travel only. Vertical presence remains an
      // interpolated target so jump/fall frames cannot over-predict Y.
      rawVelocity.y = 0;
      if (rawVelocity.length() > MAX_REMOTE_SPEED) rawVelocity.setLength(MAX_REMOTE_SPEED);
      player.targetVelocity.lerp(rawVelocity, 0.75);
    } else {
      player.targetVelocity.set(0, 0, 0);
    }
    if (player.hitDistance > 0 && receivedAt < player.hitUntil) {
      const progress = (snapshot.x - player.hitOrigin.x) * player.hitDirection.x
        + (snapshot.z - player.hitOrigin.z) * player.hitDirection.z;
      if (progress >= player.hitDistance * 0.45) {
        player.hitOffset.set(0, 0, 0);
        player.hitDistance = 0;
      }
    } else if (player.hitDistance > 0) {
      player.hitOffset.set(0, 0, 0);
      player.hitDistance = 0;
    }
    player.target.set(snapshot.x, snapshot.y, snapshot.z);
    player.targetHeading = snapshot.heading;
    player.onBoat = snapshot.onBoat;
    player.locomotion = snapshot.locomotion ?? 'idle';
    if (player.equipment && snapshot.presentation) {
      const active = snapshot.presentation?.activeItem;
      player.equipment.setActiveItem(active ? { itemId: active.itemId, category: active.category, name: active.itemId } : null);
    }
    // A missing/null wire animation means current idle, not "keep the last
    // action". Transient reliability is handled by the bounded publisher latch.
    // A combat-defeat event is authoritative for the presentation lifecycle.
    // Keep the dead pose visible until the matching respawn event; delayed
    // attack/presence frames must not resurrect or restart the old action.
    if (!player.defeated) {
      applyRemoteAnimation(
        player,
        (snapshot.animation ?? defaultAnimation()) as RemoteAnimationWithActionIdentity,
      );
    }
    player.snapshot = snapshot;
    updateHealthBar(player.healthBar, player.hp, player.hpMax, player.defeated);
    this.applyVisual(snapshot.visual, player);
    player.lastSeenAt = this.now();
  }

  /** Applies server player HP for an observer without affecting movement/combat. */
  applyAuthoritativeHp(playerId: string, hp: number, hpMax: number, lifeState: 'alive' | 'dead'): void {
    const actualId = [...this.players.keys()].find((id) => id.toLowerCase() === playerId.trim().toLowerCase());
    const player = actualId ? this.players.get(actualId) : undefined;
    if (!player) {
      this.pendingAuthorityHp.set(playerId.trim().toLowerCase(), { hp, hpMax, lifeState });
      return;
    }
    const previousHp = player.hp;
    player.hp = Math.max(0, Math.min(hpMax, hp));
    player.hpMax = Math.max(1, hpMax);
    player.hpKnown = true;
    this.pendingAuthorityDamage.set(actualId!, Math.max(0, previousHp - player.hp));
    if (lifeState === 'dead') this.markDefeated(actualId!);
    else this.markRespawn(actualId!);
    updateHealthBar(player.healthBar, player.hp, player.hpMax, player.defeated);
  }

  /** Displays a confirmed result at the target; HP was already applied by snapshot. */
  applyAuthoritativeResult(targetId: string, finalHp: number): void {
    const actualId = [...this.players.keys()].find((id) => id.toLowerCase() === targetId.trim().toLowerCase());
    const player = actualId ? this.players.get(actualId) : undefined;
    if (!player) {
      this.pendingAuthorityResults.set(targetId.trim().toLowerCase(), { finalHp, expiresAt: this.now() + 5_000 });
      return;
    }
    const amount = this.pendingAuthorityDamage.get(actualId!) ?? 0;
    this.pendingAuthorityDamage.delete(actualId!);
    if (typeof document !== 'undefined' && amount > 0) this.effects.spawnPlayerDamageNumber(player.group.position, Math.round(amount));
    if (finalHp <= 0) player.group.visible = false;
  }

  /** Apply a Server-confirmed hit impulse without mutating authoritative presence. */
  applyCombatHit(playerId: string, knockback?: RealtimeKnockback): void {
    const player = this.players.get(playerId);
    if (!player) return;
    const directionX = Number(knockback?.directionX ?? 0);
    const directionZ = Number(knockback?.directionZ ?? -1);
    const length = Math.hypot(directionX, directionZ) || 1;
    const speed = Math.max(0, Number(knockback?.speed ?? 4));
    const duration = Math.max(0.05, Number(knockback?.duration ?? 0.16));
    // Keep remote recoil visible for the full impulse instead of capping normal
    // melee hits to the old sub-meter presentation distance.
    const distance = THREE.MathUtils.clamp(speed * duration, 0.25, 5.5);
    const normalizedX = directionX / length;
    const normalizedZ = directionZ / length;
    player.hitOrigin.copy(player.target);
    player.hitDirection.set(normalizedX, 0, normalizedZ);
    player.hitDistance = distance;
    player.hitUntil = this.now() + 1_200;
    player.hitOffset.set(normalizedX * distance, 0, normalizedZ * distance);
    player.animation = {
      ...player.animation,
      combatState: knockback ? 'knockback' : 'stunned',
    };
  }

  private initialLod(_snapshot: RealtimePresenceSnapshot): RemoteLod {
    return 'full';
  }

  private setLod(player: RemotePlayer, lod: RemoteLod): void {
    if (lod === player.lod) {
      // Defeated is a presentation lifecycle state, not a visibility state.
      player.group.visible = lod !== 'hidden';
      return;
    }
    const position = player.group.position.clone();
    const rotationY = player.group.rotation.y;
    this.disposeGroup(player.group);
    const avatar = buildAvatar(player.snapshot, lod);
    avatar.group.position.copy(position);
    avatar.group.rotation.y = rotationY;
    avatar.group.visible = lod !== 'hidden';
    this.scene.add(avatar.group);
    player.group = avatar.group;
    player.animator = avatar.animator;
    player.equipment = avatar.equipment;
    player.shield = avatar.shield;
    player.lod = lod;
  }

  /** ชนิด avatar ปัจจุบันของผู้เล่น ('foot' | `boat:<id>`) — ใช้ในเทสต์ */
  avatarKindFor(playerId: string): string | null {
    return this.players.get(playerId)?.avatarKind ?? null;
  }

  /** Presentation diagnostics/tests only. */
  lodFor(playerId: string): RemoteLod | null {
    return this.players.get(playerId)?.lod ?? null;
  }

  private disposeGroup(group: THREE.Group): void {
    this.scene.remove(group);
    group.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose();
      } else if (object instanceof THREE.Sprite) {
        object.material.map?.dispose();
        object.material.dispose();
      }
    });
  }

  remove(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player) return;
    this.pendingAuthorityDamage.delete(playerId);
    for (const projectile of player.projectiles.values()) this.effects.removeEnergyProjectile(projectile);
    player.projectiles.clear();
    player.projectileSamples.clear();
    this.effects.clearOwner(player);
    this.disposeGroup(player.group);
    this.players.delete(playerId);
  }

  update(dt: number): void {
    const factor = 1 - Math.exp(-LERP_PER_SECOND * dt); // frame-rate independent lerp
    const now = this.now();
    const cutoff = now - STALE_MS;
    for (const [playerId, player] of [...this.players]) {
      if (player.lastSeenAt < cutoff) {
        this.remove(playerId);
        continue;
      }
      this.setLod(player, 'full');
      const extrapolationSeconds = Math.max(
        0,
        Math.min(MAX_EXTRAPOLATION_SECONDS, (now - player.lastSeenAt) / 1000),
      );
      const renderTarget = player.target.clone().addScaledVector(
        player.targetVelocity,
        extrapolationSeconds,
      );
      const currentPosition = player.group.position.clone();
      const nextPosition = currentPosition.clone().lerp(renderTarget, factor);
      const step = nextPosition.sub(currentPosition);
      const maxStep = MAX_RENDER_SPEED * Math.max(0, dt);
      if (step.length() > maxStep && maxStep > 0) {
        step.setLength(maxStep);
      }
      player.group.position.copy(currentPosition).add(step);
      player.hitOffset.multiplyScalar(Math.exp(-2 * Math.min(dt, 0.05)));
      if (player.hitOffset.lengthSq() < 1e-5) player.hitOffset.set(0, 0, 0);
      player.group.position.add(player.hitOffset);
      // หมุนตัวเข้าหา heading เป้าหมายแบบสั้นสุด (กันหมุนรอบเกิน)
      const current = player.group.rotation.y;
      let delta = player.targetHeading - current;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      player.group.rotation.y = current + delta * factor;
      const animation = animationForRender(player, dt);
      if (player.lod === 'full') player.animator?.update(dt, {
        ...animation,
        locomotion: player.locomotion,
        actionSessionId: animation.actionSessionId,
        actionSequence: animation.actionSequence,
      });
      player.equipment?.update(dt);
      if (player.shield) {
        player.shield.visible = (player.shield.userData.remoteShieldActive === true) && player.lod === 'full';
        player.shield.position.y = 0.35;
      }
      for (const [id, projectile] of player.projectiles) {
        const sample = player.projectileSamples.get(id);
        if (!sample) continue;
        sample.elapsedSinceSample = Math.max(sample.elapsedSinceSample + Math.max(0, dt), (now - sample.receivedAt) / 1000);
        const remainingMs = sample.state.remainingMs - sample.elapsedSinceSample * 1000;
        if (remainingMs <= 0 || sample.elapsedSinceSample > 3) {
          this.removeProjectile(player, id);
          continue;
        }
        const prediction = Math.min(MAX_EXTRAPOLATION_SECONDS, sample.elapsedSinceSample);
        sample.correction.multiplyScalar(Math.exp(-12 * Math.max(0, dt)));
        projectile.root.position.set(
          sample.state.position.x + sample.state.velocity.x * prediction,
          sample.state.position.y + sample.state.velocity.y * prediction,
          sample.state.position.z + sample.state.velocity.z * prediction,
        ).add(sample.correction);
        const fraction = sample.state.lifeFraction >= 1 ? 1 : sample.state.lifeFraction * remainingMs / Math.max(1, sample.state.remainingMs);
        this.effects.replayForOwner(player, () => this.effects.updateEnergyProjectile(projectile, dt, fraction));
      }
    }
    this.effects.update(dt);
  }

  /** S15: ตำแหน่งปัจจุบันของผู้เล่นคนอื่น (สำหรับเด้งเลขดาเมจ) — null ถ้าไม่รู้จัก */
  positionOf(playerId: string): THREE.Vector3 | null {
    return this.players.get(playerId)?.group.position.clone() ?? null;
  }

  /**
   * S15: ผู้เล่นคนอื่นที่อยู่ในกรวยโจมตีหน้าเรา (ไว้ส่งเจตนาโจมตีให้ Server ตัดสิน)
   * forward = เวกเตอร์หน้า (x,z) ของผู้เล่นเรา; range/halfAngle = ระยะ/ครึ่งมุมกรวย (เรเดียน)
   */
  targetsInCone(
    origin: THREE.Vector3,
    forwardX: number,
    forwardZ: number,
    range: number,
    halfAngle: number,
  ): string[] {
    const flen = Math.hypot(forwardX, forwardZ) || 1;
    const fx = forwardX / flen;
    const fz = forwardZ / flen;
    const cosHalf = Math.cos(halfAngle);
    const hits: string[] = [];
    for (const [playerId, player] of this.players) {
      if (player.defeated) continue;
      // Target selection must use the latest server-relayed presence, not the
      // interpolated render ghost which deliberately trails a moving player.
      const dx = player.target.x - origin.x;
      const dy = player.target.y - origin.y;
      const dz = player.target.z - origin.z;
      const dist = Math.hypot(dx, dz);
      const distance3d = Math.hypot(dx, dy, dz);
      if (distance3d > range || dist < 1e-3) continue;
      if ((dx / dist) * fx + (dz / dist) * fz < cosHalf) continue; // นอกมุมกรวย
      hits.push(playerId);
    }
    return hits.sort((a, b) => {
      const pa = this.players.get(a)!.target;
      const pb = this.players.get(b)!.target;
      return pa.distanceToSquared(origin) - pb.distanceToSquared(origin);
    });
  }

  /** Mobile fallback: nearest living player in true server-side 3D range. */
  nearestTargetInRange(origin: THREE.Vector3, range: number): string | null {
    let bestId: string | null = null;
    let bestDistanceSq = range * range;
    for (const [playerId, player] of this.players) {
      if (player.defeated) continue;
      const distanceSq = player.target.distanceToSquared(origin);
      if (distanceSq > bestDistanceSq) continue;
      bestDistanceSq = distanceSq;
      bestId = playerId;
    }
    return bestId;
  }

  latestPositionOf(playerId: string): THREE.Vector3 | null {
    return this.players.get(playerId)?.target.clone() ?? null;
  }

  /** S15: เป้าแพ้ → ซ่อนผีจนกว่าจะเกิดใหม่ (Server เป็นคนบอกเวลา) */
  markDefeated(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player) return;
    player.defeated = true;
    player.activeActionIdentity = null;
    player.animation = deadAnimation(player.animation);
    player.renderActionIdentity = null;
    player.renderAttackProgress = 0;
    player.renderSkillProgress = 0;
    // Defeated players are excluded from target selection, but remain visible
    // long enough for the actual combat-defeat transition to render dead.
    player.group.visible = player.lod !== 'hidden';
  }

  markRespawn(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player) return;
    player.defeated = false;
    player.animation = {
      ...defaultAnimation(),
      category: player.animation.category,
    };
    player.activeActionIdentity = null;
    player.renderActionIdentity = null;
    player.renderAttackProgress = 0;
    player.renderSkillProgress = 0;
    player.targetVelocity.set(0, 0, 0);
    player.group.visible = player.lod !== 'hidden';
    player.lastSeenAt = this.now();
  }

  dispose(): void {
    for (const playerId of [...this.players.keys()]) this.remove(playerId);
    this.effects.dispose();
  }

  private applyVisual(visual: RealtimePresenceSnapshot['visual'], player: RemotePlayer): void {
    if (!visual || visual.schemaVersion !== 1) return;
    if (player.retiredVisualSessions.has(visual.sessionId)) return;
    if (player.visualSessionId !== visual.sessionId) {
      if (player.visualSessionId) player.retiredVisualSessions.add(player.visualSessionId);
      while (player.retiredVisualSessions.size > 64) player.retiredVisualSessions.delete(player.retiredVisualSessions.values().next().value!);
      for (const id of player.projectiles.keys()) this.removeProjectile(player, id);
      this.effects.clearOwner(player);
      player.endedProjectiles.clear();
      player.visualSessionId = visual.sessionId;
      player.visualSequence = 0;
      player.visualStateSequence = 0;
    }
    // event queue และ current state มี cadence คนละชุด จึงกันซ้ำแยกกัน
    for (const event of visual.events) {
      if (!Number.isSafeInteger(event.sequence) || event.sequence <= player.visualSequence) continue;
      player.visualSequence = event.sequence;
      if (event.kind === 'projectile-end' && event.projectileId) {
        player.endedProjectiles.add(event.projectileId);
        this.removeProjectile(player, event.projectileId);
      }
      if (event.ageMs < 0 || event.ageMs > 3000) continue;
      // current projectiles คือชุดครบ ส่วน start/end ที่จบภายใน snapshot แสดง impact จาก end
      // แสงปืน/รอยฟันสั้นกว่ารอบ snapshot: เล่นเหตุการณ์ใหม่ครบหนึ่งครั้ง
      // ageMs ใช้คัดข้อมูลหมดอายุ ไม่ตัดเฟรมภาพที่ผู้ชมยังไม่เคยเห็น
      this.effects.replayForOwner(player, () => this.replayOneShot(event));
    }
    while (player.endedProjectiles.size > 512) player.endedProjectiles.delete(player.endedProjectiles.values().next().value!);
    if (visual.stateSequence <= player.visualStateSequence) return;
    if (player.shield) {
      const shieldMaterial = player.shield.material as THREE.MeshBasicMaterial;
      shieldMaterial.opacity = THREE.MathUtils.clamp(visual.shield?.opacity ?? 0, 0, 1);
      player.shield.userData.remoteShieldActive = visual.shield?.active === true;
      player.shield.visible = player.shield.userData.remoteShieldActive && player.lod === 'full';
    }
    player.visualStateSequence = visual.stateSequence;
    const active = new Set(visual.projectiles.filter(projectile => projectile.remainingMs > 0).map((projectile) => projectile.id));
    for (const projectileId of player.endedProjectiles) active.delete(projectileId);
    for (const projectile of visual.projectiles) {
      if (player.endedProjectiles.has(projectile.id) || projectile.remainingMs <= 0) continue;
      let render = player.projectiles.get(projectile.id);
      const fresh = !render;
      if (!render) {
        render = this.effects.createEnergyProjectile(
          new THREE.Vector3(projectile.position.x, projectile.position.y, projectile.position.z),
          new THREE.Vector3(projectile.direction.x, projectile.direction.y, projectile.direction.z),
          projectile.color,
          projectile.scale,
        );
        player.projectiles.set(projectile.id, render);
      }
      const target = new THREE.Vector3(projectile.position.x, projectile.position.y, projectile.position.z);
      const correction = fresh ? new THREE.Vector3() : render.root.position.clone().sub(target);
      if (correction.length() > 12) correction.set(0, 0, 0);
      render.direction.set(projectile.direction.x, projectile.direction.y, projectile.direction.z).normalize();
      render.root.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), render.direction);
      this.effects.seekEnergyProjectile(render, projectile.elapsed, projectile.lifeFraction);
      player.projectileSamples.set(projectile.id, { state: { ...projectile, position: { ...projectile.position }, velocity: { ...projectile.velocity }, direction: { ...projectile.direction } }, receivedAt: this.now(), elapsedSinceSample: 0, correction });
    }
    for (const projectileId of player.projectiles.keys()) {
      if (!active.has(projectileId)) {
        this.removeProjectile(player, projectileId);
      }
    }
  }

  private removeProjectile(player: RemotePlayer, id: string): void {
    const visual = player.projectiles.get(id);
    if (visual) this.effects.removeEnergyProjectile(visual);
    player.projectiles.delete(id);
    player.projectileSamples.delete(id);
  }

  private replayOneShot(event: RealtimeVisualEvent): void {
    const position = event.position;
    if (!position) return;
    const point = new THREE.Vector3(position.x, position.y, position.z);
    switch (event.kind) {
      case 'slash': this.effects.spawnSlash(point, event.heading ?? 0, event.color ?? 0x9fdcff, event.scale ?? 1, event.assetId as never); break;
      case 'blade-trail': this.effects.spawnBladeTrail(new THREE.Vector3(event.bladeBase?.x ?? position.x, event.bladeBase?.y ?? position.y, event.bladeBase?.z ?? position.z), new THREE.Vector3(event.bladeTip?.x ?? position.x, event.bladeTip?.y ?? position.y, event.bladeTip?.z ?? position.z), point, event.heading ?? 0, event.comboIndex ?? 0, event.color ?? 0x9fdcff, event.finisher ?? false); break;
      case 'gun-shot': if (event.endpoint) this.effects.spawnGunShot(point, new THREE.Vector3(event.endpoint.x, event.endpoint.y, event.endpoint.z), event.color ?? 0xffd477, event.impacted ?? false, event.power ?? 1); break;
      case 'energy-launch': if (event.direction) this.effects.spawnEnergyLaunch(point, new THREE.Vector3(event.direction.x, event.direction.y, event.direction.z), event.color ?? 0x74e8ff, event.scale ?? 1); break;
      case 'shockwave': this.effects.spawnShockwave(point, event.radius ?? 1, event.color ?? 0xbfe8ff, event.assetId as never); break;
      case 'beam': if (event.direction) this.effects.spawnBeam(point, new THREE.Vector3(event.direction.x, event.direction.y, event.direction.z), event.length ?? 1, event.color ?? 0xbfe8ff); break;
      case 'hit-spark': this.effects.spawnHitSpark(point, event.color ?? 0xfff1a8); break;
      case 'energy-impact': this.effects.spawnEnergyImpact(point, event.color ?? 0x74e8ff, event.scale ?? 1); break;
      case 'projectile-end': this.effects.spawnEnergyImpact(point, event.color ?? 0x74e8ff, (event.scale ?? 1) * (event.burstScale ?? 0.8)); break;
    }
  }
}
