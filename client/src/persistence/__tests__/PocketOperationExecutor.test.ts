import { describe, expect, it } from 'vitest';
import { createRemoteQuestOperationExecutor } from '../../quest/RemoteQuestClient';
import { createRemoteShopOperationExecutor } from '../../shop/RemoteShopClient';
import { createPocketOperationExecutor, getPocketOperationExecutor } from '../PocketOperationExecutor';

describe('Pocket parent operation bridge', () => {
  it('maps shop and quest calls to server operations and returns verified outcomes', async () => {
    const operations: Record<string, unknown>[] = [];
    const bridge = createPocketOperationExecutor({
      async request(operation) {
        operations.push(operation);
        if (operation.type === 'shopPurchase') return { revision: 2, persisted: {}, outcome: {
          ok: true, schemaVersion: 1, action: 'draw', coins: 90,
          item: { kind: 'sword', id: 's1', name: 'S1', rarity: 'common' }, quantity: 1,
          isNew: true, idempotentReplay: false,
        } };
        if (operation.type === 'questState') return { revision: 3, persisted: {}, outcome: {
          ok: true, schemaVersion: 1, active: null, completedQuestIds: [],
        } };
        return { revision: 4, persisted: {}, outcome: { ok: true, schemaVersion: 1, questId: null, progress: [], completed: false } };
      },
    });
    const shop = createRemoteShopOperationExecutor(bridge);
    const quest = createRemoteQuestOperationExecutor(bridge);
    expect((await shop.purchase('draw')).coins).toBe(90);
    expect((await quest.state()).active).toBeNull();
    await quest.progress([{ kind: 'kill', targetId: 'slime', amount: 1 }]);
    expect(operations.map(operation => operation.type)).toEqual(['shopPurchase', 'questState', 'questProgress']);
    expect(operations[2]).toEqual({ type: 'questProgress' });
  });

  it('discovers the parent bridge before any HTTP feature flag is consulted', async () => {
    const parent = { request: async () => ({ revision: 7, persisted: { online: true }, outcome: { ok: true } }) };
    const executor = getPocketOperationExecutor({ POCKETMONSTER_PIRATE_OPERATIONS: parent } as Window);
    expect(executor).not.toBeNull();
    await expect(executor!.request({ type: 'questState' })).resolves.toEqual({
      revision: 7, persisted: { online: true }, outcome: { ok: true },
    });
  });

  it('rejects malformed bridge replies before they reach domain clients', async () => {
    const bridge = createPocketOperationExecutor({ async request() { return { revision: -1, persisted: {}, outcome: {} }; } });
    await expect(bridge.request({ type: 'questState' })).rejects.toThrow('POCKET_OPERATION_REPLY_INVALID');
  });
});
