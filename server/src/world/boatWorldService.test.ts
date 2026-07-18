import { describe, expect, it } from 'vitest';
import type { RealtimeBoatIntent, RealtimeServerMessage } from '@pirate-fruit/shared';
import type { RealtimeHub } from '../realtime/realtimeHub.js';
import { BoatWorldService } from './boatWorldService.js';
import type { BoatWorldRepository } from './boatWorldRepository.js';

describe('S17 BoatWorldService', () => {
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
