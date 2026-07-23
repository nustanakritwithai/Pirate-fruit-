import { describe, expect, it } from 'vitest';
import {
  AUTHORITATIVE_BOAT_DEFINITIONS,
  BOAT_CANNON_COOLDOWN_MS,
  BOAT_DOCK_SPAWNS,
  BOAT_RESPAWN_MS,
  BOAT_WORLD_BOUNDARY,
  type BoatWorldSnapshot,
} from '@pirate-fruit/shared';
import { BoatSimulation, type CanonicalBoat } from './boatSimulation.js';

const canonical = (entityId: string, ownerId: string, definitionId = 'training-dinghy'): CanonicalBoat => ({
  entityId, ownerId, definitionId,
  hp: AUTHORITATIVE_BOAT_DEFINITIONS[definitionId]!.maxHp,
  maxHp: AUTHORITATIVE_BOAT_DEFINITIONS[definitionId]!.maxHp,
  cargoCapacity: 8,
});

const row = (overrides: Partial<BoatWorldSnapshot> & Pick<BoatWorldSnapshot, 'entityId' | 'ownerId'>): BoatWorldSnapshot => ({
  definitionId: 'training-dinghy', islandId: 'starter-island', x: 0, z: 0,
  heading: 0, speed: 0, hp: 130, maxHp: 130, anchor: false, state: 'sailing',
  passengerIds: [], ...overrides,
});

describe('S17 BoatSimulation', () => {
  it('summons only a canonical boat at a server-owned dock', () => {
    const sim = new BoatSimulation();
    const boat = sim.summon(canonical('boat-a', 'owner-a'), 'starter-island');
    expect(boat).toMatchObject({
      entityId: 'boat-a', ownerId: 'owner-a', definitionId: 'training-dinghy',
      ...BOAT_DOCK_SPAWNS['starter-island'], hp: 130, anchor: true, state: 'docked',
    });
    expect(sim.summon({ ...canonical('bad', 'owner'), definitionId: 'client-invented-boat' }, 'starter-island')).toBeNull();
  });

  it('keeps a newly summoned starter boat on the starter island after the first world tick', () => {
    const sim = new BoatSimulation();
    const boat = sim.summon(canonical('boat-starter', 'owner-starter'), 'starter-island', 1_000)!;

    sim.tick(1_100, 100);

    expect(sim.stateOf(boat.entityId)).toMatchObject({
      islandId: 'starter-island',
      ...BOAT_DOCK_SPAWNS['starter-island'],
    });
    expect(sim.board(
      boat.entityId,
      'owner-starter',
      'starter-island',
      BOAT_DOCK_SPAWNS['starter-island']!.x,
      BOAT_DOCK_SPAWNS['starter-island']!.z,
    )?.passengerIds).toContain('owner-starter');
  });

  it('accepts clamped helm input but never a client position', () => {
    const sim = new BoatSimulation();
    sim.restore([row({ entityId: 'boat-a', ownerId: 'owner-a', helmId: 'owner-a', passengerIds: ['owner-a'] })]);
    expect(sim.setInput(100, 'attacker', 'boat-a', 1, 1)).toBeNull();
    expect(sim.setInput(100, 'owner-a', 'boat-a', 99, -99)).not.toBeNull();
    sim.tick(200, 100);
    const state = sim.stateOf('boat-a')!;
    expect(Math.hypot(state.x, state.z)).toBeLessThan(1);
    expect(state.speed).toBeLessThanOrEqual(AUTHORITATIVE_BOAT_DEFINITIONS['training-dinghy']!.maxSpeed);
  });

  it('applies boost on the authoritative simulation instead of trusting client speed', () => {
    const sim = new BoatSimulation();
    sim.restore([row({ entityId: 'boat-a', ownerId: 'owner-a', helmId: 'owner-a', passengerIds: ['owner-a'] })]);
    sim.setInput(100, 'owner-a', 'boat-a', 1, 0, false, true);
    sim.tick(200, 100);
    const boosted = sim.stateOf('boat-a')!;
    expect(boosted.speed).toBeGreaterThan(AUTHORITATIVE_BOAT_DEFINITIONS['training-dinghy']!.acceleration * 0.1);
    expect(boosted.speed).toBeLessThanOrEqual(AUTHORITATIVE_BOAT_DEFINITIONS['training-dinghy']!.maxSpeed * 1.35);

    // A second request during cooldown is accepted as ordinary input but cannot
    // extend the boost beyond the server-owned window.
    sim.setInput(300, 'owner-a', 'boat-a', 1, 0, false, true);
    sim.tick(400, 100);
    expect(sim.stateOf('boat-a')!.speed).toBeLessThanOrEqual(
      AUTHORITATIVE_BOAT_DEFINITIONS['training-dinghy']!.maxSpeed * 1.35,
    );
  });

  it('boards only in range, carries passenger identity, and disembarks cleanly', () => {
    const sim = new BoatSimulation();
    sim.restore([row({ entityId: 'boat-a', ownerId: 'owner-a', x: 10, z: 10 })]);
    expect(sim.board('boat-a', 'guest', 'starter-island', 100, 100)).toBeNull();
    expect(sim.board('boat-a', 'guest', 'starter-island', 12, 10)?.passengerIds).toContain('guest');
    expect(sim.stateOf('boat-a')?.helmId).toBeUndefined();
    expect(sim.takeHelm('boat-a', 'guest')?.helmId).toBe('guest');
    expect(sim.leaveHelm('guest')?.helmId).toBeUndefined();
    expect(sim.boatOfPassenger('guest')?.entityId).toBe('boat-a');
    expect(sim.disembark('guest')?.passengerIds).not.toContain('guest');
  });

  it('resolves broadside cannon damage, cooldown, sinking, and server respawn', () => {
    const sim = new BoatSimulation();
    sim.restore([
      row({ entityId: 'boat-a', ownerId: 'owner-a', helmId: 'owner-a', passengerIds: ['owner-a'], x: 0, z: 0, heading: 0 }),
      row({ entityId: 'boat-b', ownerId: 'owner-b', x: 10, z: 0, hp: 18, maxHp: 130 }),
    ]);
    const hit = sim.fire(2_000, 'owner-a', 'boat-a', 'port');
    expect(hit).toMatchObject({ damage: 18, sunk: true, target: { entityId: 'boat-b', hp: 0, state: 'sunk' } });
    expect(sim.fire(2_001, 'owner-a', 'boat-a', 'port')).toBeNull();
    expect(sim.tick(2_000 + BOAT_RESPAWN_MS - 1, 100).respawns).toHaveLength(0);
    const respawns = sim.tick(2_000 + BOAT_RESPAWN_MS + 1, 100).respawns;
    expect(respawns[0]).toMatchObject({ entityId: 'boat-b', hp: 130, state: 'docked' });
    expect(BOAT_CANNON_COOLDOWN_MS).toBeGreaterThan(0);
  });

  it('does not teleport through the world boundary during a long frame', () => {
    const sim = new BoatSimulation();
    sim.restore([row({ entityId: 'boat-a', ownerId: 'owner-a', helmId: 'owner-a', passengerIds: ['owner-a'], x: BOAT_WORLD_BOUNDARY - 1, heading: Math.PI / 2, speed: 9 })]);
    sim.setInput(1_000, 'owner-a', 'boat-a', 1, 0);
    const before = sim.stateOf('boat-a')!;
    sim.tick(1_250, 5_000); // dt is capped; collision restores the previous safe transform
    const after = sim.stateOf('boat-a')!;
    expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeLessThan(3);
    expect(Math.hypot(after.x, after.z)).toBeLessThanOrEqual(BOAT_WORLD_BOUNDARY);
  });

  it('moves boat interest to the nearest harbor while sailing between islands', () => {
    const sim = new BoatSimulation();
    sim.restore([row({
      entityId: 'boat-a', ownerId: 'owner-a', helmId: 'owner-a', passengerIds: ['owner-a'],
      x: 61, z: -86, heading: Math.PI, speed: 9,
    })]);
    sim.setInput(1_000, 'owner-a', 'boat-a', 1, 0, false);
    const result = sim.tick(1_250, 250);
    expect(sim.stateOf('boat-a')?.islandId).toBe('mist-jungle');
    expect(result.islandTransitions).toMatchObject([
      { fromIslandId: 'starter-island', toIslandId: 'mist-jungle' },
    ]);
  });

  it('restores persistent boat/passenger state after restart and handles load budget', () => {
    const sim = new BoatSimulation();
    const many = Array.from({ length: 200 }, (_, index) => row({
      entityId: `boat-${index}`, ownerId: `owner-${index}`,
      x: (index % 20) * 15, z: Math.floor(index / 20) * 15,
      ...(index === 0 ? { helmId: 'owner-0', passengerIds: ['owner-0'], speed: 4 } : {}),
    }));
    sim.restore(many);
    expect(sim.disconnect('owner-0')).toMatchObject({ anchor: true, passengerIds: [] });
    const recovered = new BoatSimulation();
    recovered.restore(sim.serialize());
    expect(recovered.snapshotForIsland('starter-island')).toHaveLength(200);
    expect(recovered.boatOfPassenger('owner-0')).toBeNull();
    const started = Date.now();
    for (let tick = 0; tick < 20; tick += 1) recovered.tick(tick * 100, 100);
    expect(Date.now() - started).toBeLessThan(500);
  });
});
