import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PirateMonsterAuthorityAdapter } from '../PirateMonsterAuthorityAdapter';
import { SharedMonsterClient } from '../SharedMonsterClient';

const root = process.env.POCKETMONSTER_CLIENT_ROOT
  ?? 'C:/Users/Administrator/Desktop/เซิพจารย/.worktrees/client-pr538-rebase-20260908';
const protocol = await import(/* @vite-ignore */ pathToFileURL(path.join(root, 'world-presence-protocol.mjs')).href);
const bridge = await import(/* @vite-ignore */ pathToFileURL(path.join(root, 'pirate-presence-bridge-v900.mjs')).href);
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/monster-authority-wire.actual.json'), 'utf8'));

describe('composed Server wire -> Parent -> Pirate receiver', () => {
  beforeEach(() => {
    const context = { clearRect: vi.fn(), fillRect: vi.fn(), strokeRect: vi.fn(), fillText: vi.fn(), fillStyle: '', strokeStyle: '', font: '', textBaseline: '', lineWidth: 1 };
    vi.stubGlobal('document', { createElement: vi.fn(() => ({ width: 0, height: 0, getContext: () => context })) });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('preserves authoritative target/HP once through both parent sanitizers and real receiver', () => {
    let now = 1_000;
    const parentSnapshot = protocol.sanitizeOnlineWorldSnapshot(fixture.payload, 'pirate-fruit');
    expect(parentSnapshot?.actors).toHaveLength(1);
    const iframeSnapshot = bridge.sanitizePirateWorldSnapshot(parentSnapshot);
    const iframeMessage = bridge.createPirateSnapshotMessage(iframeSnapshot);
    const adapter = new PirateMonsterAuthorityAdapter();
    const safeActors = adapter.sanitizeActors('pirate-fruit', iframeMessage.payload.actors, undefined, 'pirate-fruit');
    expect(safeActors).toHaveLength(1);
    expect(safeActors[0]?.authority?.attack?.targetId).toBe('player-1');
    const client = new SharedMonsterClient(new THREE.Scene(), 'pirate-fruit', () => 0, () => now, { spawnHitSpark: vi.fn(), spawnDamageNumber: vi.fn() }, targetId => targetId === 'player-1' ? new THREE.Vector3(3, 0, 4) : undefined);
    client.applyActors('pirate-fruit', safeActors, 'composed', 'player-1');
    client.applyActors('pirate-fruit', safeActors, 'composed', 'player-1');
    now += 180;
    client.update(.18);
    expect(client.collectPlayerHits(new THREE.Vector3(18.904702116597015, 0, -2.39975008994979))).toEqual([{ damage: 5, sourceX: expect.any(Number), sourceZ: expect.any(Number), attackId: 'monster:east-forest:player-1:1:monster-hit-1:1' }]);
    expect(client.collectPlayerHits(new THREE.Vector3())).toHaveLength(0);
  });

  it('rejects spoofed outbound authority while preserving player pose, and resets on reconnect', () => {
    const local = bridge.sanitizePirateLocalPresence({ type: bridge.PIRATE_LOCAL_PRESENCE_MESSAGE, zone: 'pirate-fruit', x: 1, z: 2, dir: 0, actors: fixture.payload.actors });
    expect(local).toMatchObject({ x: 1, z: 2, dir: 0 });
    expect(local).not.toHaveProperty('actors');
    const parentSnapshot = protocol.sanitizeOnlineWorldSnapshot(fixture.payload, 'pirate-fruit');
    const adapter = new PirateMonsterAuthorityAdapter();
    const client = new SharedMonsterClient(new THREE.Scene(), 'pirate-fruit');
    client.applyActors('pirate-fruit', adapter.sanitizeActors('pirate-fruit', parentSnapshot.actors, undefined, 'pirate-fruit'), 'composed', 'player-1');
    expect(client.count).toBe(1);
    client.resetSession(true);
    expect(client.count).toBe(0);
    expect(adapter.setZone('other-zone')).toBeUndefined();
  });
});

