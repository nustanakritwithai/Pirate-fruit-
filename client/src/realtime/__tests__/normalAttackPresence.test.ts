import * as THREE from 'three';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { Effects } from '../../effects/Effects';
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

function gameplaySwordAttack() {
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
  combat.bindVisualAnchors(equipment);
  combat.update(0); // consumes the real M1 input and starts the windup
  input.consumeAttack.mockReturnValue(false);
  combat.update(0.2); // crosses training-sword's 0.14s hit windup
  return { scene, scoped, combat };
}

describe('normal sword attack presentation path', () => {
  it('captures the actual PlayerCombat blade trail and publishes it through ParentPresence', () => {
    const { scoped } = gameplaySwordAttack();
    const visual = scoped.current();
    expect(visual.events.filter((event) => event.kind === 'blade-trail')).toHaveLength(1);

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
    const qaDir = resolve(process.cwd(), '../../..', '.qa-presence-smooth-20260906');
    mkdirSync(qaDir, { recursive: true });
    writeFileSync(resolve(qaDir, 'sword-gameplay-frame.json'), `${JSON.stringify(message.visual, null, 2)}\n`, 'utf8');

    const remoteScene = new THREE.Scene();
    const remote = new RemotePlayers(remoteScene, 'pirate-fruit', () => 1_000, { tier: 'high', focus: () => new THREE.Vector3(2, 0, 3) });
    const wireVisual = sanitizeVisual(message.visual);
    expect(wireVisual).not.toBeNull();
    const snapshot: RealtimePresenceSnapshot = {
      playerId: 'remote-sword', name: 'QA', islandId: 'pirate-fruit', x: 2, y: 0, z: 3, heading: 0, onBoat: false,
      visual: wireVisual!,
    };
    remote.applyPresence(snapshot);
    expect(remoteScene.getObjectByName('effect:blade-trail')).toBeTruthy();
    remote.dispose();
    bridge.dispose();
  });
});
