import * as THREE from 'three';
import { mkdirSync, writeFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  BLADE_TRAIL_FINISHER_LIFETIME_SECONDS,
  BLADE_TRAIL_LIFETIME_SECONDS,
  Effects,
} from '../../effects/Effects';
import { EquipmentVisuals } from '../../art/EquipmentVisuals';
import { createPiratePlayerVisual } from '../../art/PiratePlayerVisual';
import { attachmentSocketsFromPirateRig } from '../../art/CharacterRig';
import { PlayerCombat } from '../../combat/PlayerCombat';
import { SkillLoadout } from '../../combat/SkillLoadout';
import { ScopedVisualEffects } from '../ScopedVisualEffects';
import { PocketMonsterParentPresence, PIRATE_LOCAL_PRESENCE_MESSAGE } from '../PocketMonsterParentPresence';
import { sanitizeVisual } from '../PresentationProtocol';
import { RemotePlayers } from '../RemotePlayers';
import type { RealtimePresenceSnapshot } from '../RealtimeClient';

const QA_OUTPUT_DIR_ENV = 'PIRATE_PRESENCE_QA_OUTPUT_DIR';

function exportQaFrame(fileName: string, visual: NonNullable<RealtimePresenceSnapshot['visual']>): void {
  const configured = process.env[QA_OUTPUT_DIR_ENV]?.trim();
  if (!configured) return;
  if (!isAbsolute(configured)) {
    throw new Error(`${QA_OUTPUT_DIR_ENV} must be an absolute declared output directory`);
  }
  const outputDirectory = resolve(configured);
  const outputPath = resolve(outputDirectory, fileName);
  const childPath = relative(outputDirectory, outputPath);
  if (!childPath || childPath.startsWith('..') || isAbsolute(childPath)) {
    throw new Error('sword QA fixture path escaped its declared output directory');
  }
  mkdirSync(outputDirectory, { recursive: true });
  const deterministic = {
    ...visual,
    sessionId: 'qa_sword_session',
    stateSequence: 1,
    events: visual.events.map((event, index) => ({ ...event, sequence: index + 1, ageMs: 0 })),
  };
  writeFileSync(outputPath, `${JSON.stringify(deterministic, null, 2)}\n`, 'utf8');
}

function gameplaySwordAttack(targetComboIndex: 0 | 1 | 2 | 3, bindAnchors = true) {
  const scene = new THREE.Scene();
  const playerRoot = new THREE.Group();
  const playerVisual = createPiratePlayerVisual();
  playerRoot.add(playerVisual.group);
  playerRoot.position.set(2, 0, 3);
  scene.add(playerRoot);
  const item = { itemId: 'training-sword', category: 'sword' as const, name: 'ดาบฝึกหัด' };
  const equipment = new EquipmentVisuals(playerRoot, () => item, attachmentSocketsFromPirateRig(playerVisual.rig));
  equipment.update();
  const input = Object.assign(Object.create(null), {
    block: false,
    consumeAttack: vi.fn(() => true),
    consumeWeaponSwitch: vi.fn(() => false),
    consumeSkillAim: vi.fn(() => null),
    consumeUltimateAim: vi.fn(() => null),
    getSkillAimPreview: vi.fn(() => null),
  });
  const controller = {
    position: new THREE.Vector3(2, 0, 3), heading: 0, hp: 100, hpMax: 100, mp: 100, mpMax: 100,
    isMounted: false, inputEnabled: true, verticalSpeed: 0,
    setMovementLock: vi.fn(), applyStun: vi.fn(), applyKnockback: vi.fn(),
  };
  const monsters = { playerAttack: vi.fn() };
  const scoped = new ScopedVisualEffects(new Effects(scene));
  const loadout = new SkillLoadout();
  loadout.equipSword('training-sword');
  const combat = new PlayerCombat(scene, input, controller as never, monsters as never, scoped, null, loadout);
  if (bindAnchors) combat.bindVisualAnchors(equipment);
  for (let comboIndex = 0; comboIndex <= targetComboIndex; comboIndex += 1) {
    input.consumeAttack.mockReturnValueOnce(true);
    combat.update(0); // consumes the real M1 input and starts this combo swing
    input.consumeAttack.mockReturnValue(false);
    combat.update(1); // crosses windup+recovery without expiring the combo window
    if (comboIndex < targetComboIndex) {
      scoped.acknowledgeEvents(scoped.pendingEventCount());
    }
  }
  return { scene, scoped };
}

describe('normal sword attack presentation path', () => {
  it.each([
    { comboIndex: 0 as const, finisher: false },
    { comboIndex: 1 as const, finisher: false },
    { comboIndex: 2 as const, finisher: false },
    { comboIndex: 3 as const, finisher: true },
  ])('renders a visible remote blade trail for gameplay combo $comboIndex', ({ comboIndex, finisher }) => {
    const { scene: sourceScene, scoped } = gameplaySwordAttack(comboIndex);
    const visual = scoped.current();
    expect(visual.events.filter((event) => event.kind === 'blade-trail')).toHaveLength(1);
    const sourceEvent = visual.events.find((event) => event.kind === 'blade-trail')!;
    expect(sourceEvent).toMatchObject({ comboIndex, finisher });
    const sourceSword = sourceScene.getObjectByName('equipment:sword')!;
    expect(sourceSword.visible).toBe(true);

    const sent: unknown[] = [];
    const host = {
      addMessageListener: vi.fn(), removeMessageListener: vi.fn(), isParentSource: () => true,
      postToParent: (message: unknown) => sent.push(message),
    };
    const bridge = new PocketMonsterParentPresence({
      targetOrigin: 'https://pocket.example', host,
      remotePlayers: { setIsland: vi.fn(), applyPresence: vi.fn(), remove: vi.fn() },
      getPosition: () => ({ x: 2, y: 0, z: 3 }), getHeading: () => 0,
      getIslandId: () => 'pirate-fruit', heightAt: () => 0,
      getVisual: () => scoped.current(), now: () => 1_000,
    });
    bridge.start();
    const message = sent.find((entry) => (entry as { type?: string }).type === PIRATE_LOCAL_PRESENCE_MESSAGE) as { visual?: { events?: unknown[] } };
    expect(message.visual?.events?.filter((event) => (event as { kind?: string }).kind === 'blade-trail')).toHaveLength(1);

    const remoteScene = new THREE.Scene();
    const remote = new RemotePlayers(remoteScene, 'pirate-fruit', () => 1_000, { tier: 'high', focus: () => new THREE.Vector3(2, 0, 3) });
    const wireVisual = sanitizeVisual(message.visual);
    expect(wireVisual).not.toBeNull();
    const snapshot: RealtimePresenceSnapshot = {
      playerId: 'remote-sword', name: 'QA', islandId: 'pirate-fruit', x: 2, y: 0, z: 3, heading: 0, onBoat: false,
      visual: wireVisual!,
      presentation: {
        schemaVersion: 1, avatarId: 'pirate-v1', appearanceId: 'player-orange',
        clothingIds: [], equipmentIds: ['training-sword'],
        activeItem: { category: 'sword', itemId: 'training-sword' },
      },
    };
    remote.applyPresence(snapshot);
    const diagnostics = remote.presentationDiagnostics().bladeTrails;
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      comboIndex,
      finisher,
      lifetimeMs: (finisher
        ? BLADE_TRAIL_FINISHER_LIFETIME_SECONDS
        : BLADE_TRAIL_LIFETIME_SECONDS) * 1_000,
      visible: true,
      overlayDepthTestDisabled: true,
    });
    expect(new THREE.Vector3(
      diagnostics[0].bladeBase!.x,
      diagnostics[0].bladeBase!.y,
      diagnostics[0].bladeBase!.z,
    ).distanceTo(new THREE.Vector3(
      sourceEvent.bladeBase!.x,
      sourceEvent.bladeBase!.y,
      sourceEvent.bladeBase!.z,
    ))).toBeLessThan(0.02);
    expect(new THREE.Vector3(
      diagnostics[0].bladeTip!.x,
      diagnostics[0].bladeTip!.y,
      diagnostics[0].bladeTip!.z,
    ).distanceTo(new THREE.Vector3(
      sourceEvent.bladeTip!.x,
      sourceEvent.bladeTip!.y,
      sourceEvent.bladeTip!.z,
    ))).toBeLessThan(0.02);
    remote.update(1 / 60);
    expect(remoteScene.getObjectByName('remote-player:pirate-v1')?.getObjectByName('equipment:sword')?.visible).toBe(true);
    expect(sourceSword.visible).toBe(true);

    // The same session/sequence must not replay the one-shot.
    remote.applyPresence(snapshot);
    expect(remote.presentationDiagnostics().bladeTrails).toHaveLength(1);

    exportQaFrame(`sword-gameplay-${finisher ? 'finisher3' : 'combo0'}.json`, wireVisual!);

    // Explicit player removal owns and cleans the transient effect.
    remote.remove(snapshot.playerId);
    expect(remote.presentationDiagnostics().bladeTrails).toHaveLength(0);

    // A fresh receiver must also expire the effect at the product lifetime.
    const expiryScene = new THREE.Scene();
    const expiryRemote = new RemotePlayers(expiryScene, 'pirate-fruit', () => 1_000);
    expiryRemote.applyPresence(snapshot);
    expiryRemote.update((finisher
      ? BLADE_TRAIL_FINISHER_LIFETIME_SECONDS
      : BLADE_TRAIL_LIFETIME_SECONDS) + 0.01);
    expect(expiryRemote.presentationDiagnostics().bladeTrails).toHaveLength(0);
    expiryRemote.dispose();

    remote.dispose();
    bridge.dispose();
  });

  it('uses the local sword fallback slash when gameplay has no blade anchor', () => {
    const { scoped } = gameplaySwordAttack(0, false);
    const visual = scoped.current();
    expect(visual.events.filter((event) => event.kind === 'slash')).toHaveLength(1);
    expect(visual.events.find((event) => event.kind === 'slash')).toMatchObject({
      heading: 0,
      color: 0x9fdcff,
      scale: 1,
    });
  });

  it('captures the actual blocked-hit spark for remote replay', () => {
    const scene = new THREE.Scene();
    const input = Object.assign(Object.create(null), {
      block: true,
      consumeAttack: vi.fn(() => false),
      consumeWeaponSwitch: vi.fn(() => false),
      consumeSkillAim: vi.fn(() => null),
      consumeUltimateAim: vi.fn(() => null),
      getSkillAimPreview: vi.fn(() => null),
    });
    const controller = {
      position: new THREE.Vector3(2, 0, 3), heading: 0, hp: 100, hpMax: 100, mp: 100, mpMax: 100,
      isMounted: false, inputEnabled: true, verticalSpeed: 0,
      setMovementLock: vi.fn(), applyStun: vi.fn(), applyKnockback: vi.fn(),
    };
    const scoped = new ScopedVisualEffects(new Effects(scene));
    const combat = new PlayerCombat(scene, input, controller as never, { playerAttack: vi.fn() } as never, scoped, null, new SkillLoadout());
    combat.update(0);
    combat.modifyIncomingDamage({ amount: 10, sourceX: 3, sourceZ: 3, unblockable: false, knockback: 0, tags: ['melee'] });
    expect(scoped.current().events.filter((event) => event.kind === 'hit-spark')).toHaveLength(1);
  });

  it('cleans a visible blade trail when the receiver changes zone', () => {
    const { scoped } = gameplaySwordAttack(0);
    const remote = new RemotePlayers(new THREE.Scene(), 'pirate-fruit', () => 1_000);
    remote.applyPresence({
      playerId: 'remote-sword', name: 'QA', islandId: 'pirate-fruit',
      x: 2, y: 0, z: 3, heading: 0, onBoat: false,
      visual: sanitizeVisual(scoped.current())!,
    });
    expect(remote.presentationDiagnostics().bladeTrails).toHaveLength(1);
    remote.setIsland('another-zone');
    expect(remote.presentationDiagnostics().bladeTrails).toHaveLength(0);
    remote.dispose();
  });
});
