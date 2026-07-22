import { describe, expect, it } from 'vitest';
import type { RealtimeBoatIntent, RealtimeServerMessage } from '@pirate-fruit/shared';
import type { RealtimeHub } from '../realtime/realtimeHub.js';
import { BoatWorldService } from './boatWorldService.js';
import type { BoatWorldRepository } from './boatWorldRepository.js';

describe('S17 BoatWorldService', () => {
  it('publishes authoritative passenger presence immediately when boarding an anchored boat', async () => {
    const passengerUpdates: unknown[][] = [];
    const disembarkUpdates: unknown[][] = [];
    const hub = {
      attachBoatWorld: () => undefined,
      broadcastBoat: () => undefined,
      updateBoatPassengerPresence: (...args: unknown[]) => passengerUpdates.push(args),
      updateDisembarkedPresence: (...args: unknown[]) => disembarkUpdates.push(args),
    } as unknown as RealtimeHub;
    const repository: BoatWorldRepository = {
      loadAll: async () => [],
      loadActiveBoat: async (characterId) => ({
        entityId: 'boat-a', ownerId: characterId, definitionId: 'training-dinghy',
        hp: 130, maxHp: 130, cargoCapacity: 8,
      }),
      saveAll: async () => undefined,
    };
    const service = new BoatWorldService(hub, { repository, now: () => 1_000 });
    const presence = { islandId: 'starter-island', x: 4, y: 0, z: -43, heading: 0, onBoat: false };
    await service.handleIntent('owner-a', presence,
      { type: 'boat-intent', intentId: 'intent-summon', action: 'summon' });
    const result = await service.handleIntent('owner-a', presence,
      { type: 'boat-intent', intentId: 'intent-board1', action: 'board', entityId: 'boat-a' });
    expect(result.accepted).toBe(true);
    expect((await service.handleIntent('owner-a', presence,
      { type: 'boat-intent', intentId: 'intent-helm-1', action: 'take-helm', entityId: 'boat-a' })).accepted).toBe(true);
    expect((await service.handleIntent('owner-a', presence,
      { type: 'boat-intent', intentId: 'intent-helm-2', action: 'leave-helm', entityId: 'boat-a' })).accepted).toBe(true);
    expect((await service.handleIntent('owner-a', presence,
      { type: 'boat-intent', intentId: 'intent-leave1', action: 'disembark', entityId: 'boat-a' })).accepted).toBe(true);
    expect(passengerUpdates).toEqual([
      ['owner-a', 'starter-island', 4.2, -43, expect.any(Number), 'training-dinghy'],
    ]);
    expect(disembarkUpdates).toHaveLength(1);
  });

  it('authorizes the canonical active boat and deduplicates repeated intentId', async () => {
    const messages: RealtimeServerMessage[] = [];
    const hub = {
      attachBoatWorld: () => undefined,
      broadcastBoat: (_island: string, message: RealtimeServerMessage) => messages.push(message),
      updateBoatPassengerPresence: () => undefined,
    } as unknown as RealtimeHub;
    let loads = 0;
    const repository: BoatWorldRepository = {
      loadAll: async () => [],
      loadActiveBoat: async (characterId) => {
        loads += 1;
        return { entityId: '30000000-0000-4000-8000-000000000001', ownerId: characterId,
          definitionId: 'training-dinghy', hp: 130, maxHp: 130, cargoCapacity: 8 };
      },
      saveAll: async () => undefined,
    };
    const service = new BoatWorldService(hub, { repository, now: () => 1_000 });
    const intent: RealtimeBoatIntent = { type: 'boat-intent', intentId: 'intent-0001', action: 'summon' };
    const presence = { islandId: 'starter-island', x: 4, y: 0, z: -40, heading: 0, onBoat: false };
    const first = await service.handleIntent('owner-a', presence, intent);
    const duplicate = await service.handleIntent('owner-a', presence, intent);
    expect(first).toEqual(duplicate);
    expect(first.accepted).toBe(true);
    expect(loads).toBe(1);
    expect(messages.filter((message) => message.type === 'boat-delta')).toHaveLength(1);
  });

  it('rejects an ownership mismatch and a summon outside a dock', async () => {
    const hub = { attachBoatWorld: () => undefined, broadcastBoat: () => undefined,
      updateBoatPassengerPresence: () => undefined } as unknown as RealtimeHub;
    const repository: BoatWorldRepository = {
      loadAll: async () => [],
      loadActiveBoat: async () => ({ entityId: 'boat-a', ownerId: 'someone-else', definitionId: 'training-dinghy', hp: 130, maxHp: 130, cargoCapacity: 8 }),
      saveAll: async () => undefined,
    };
    const service = new BoatWorldService(hub, { repository });
    expect((await service.handleIntent('owner-a', { islandId: 'starter-island', x: 500, y: 0, z: 500, heading: 0, onBoat: false },
      { type: 'boat-intent', intentId: 'intent-far1', action: 'summon' })).reason).toBe('dock-range');
    expect((await service.handleIntent('owner-a', { islandId: 'starter-island', x: 4, y: 0, z: -43, heading: 0, onBoat: false },
      { type: 'boat-intent', intentId: 'intent-own1', action: 'summon' })).reason).toBe('active-boat-required');
  });
});
