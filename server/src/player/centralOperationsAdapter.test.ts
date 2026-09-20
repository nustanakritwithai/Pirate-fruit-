import { describe, expect, it } from 'vitest';
import { applyCentralOperation } from './centralOperationsAdapter.js';
import { defaultPlayerState } from './playerState.js';

describe('คำสั่งเดิมผ่าน canonical transaction', () => {
  it('เก็บผลซื้อใน JSON state และไม่หักเงินซ้ำทั้ง command และ business retry', () => {
    const current = defaultPlayerState(); current.progression.coins = 100;
    const operation = { type: 'shopPurchase', action: 'potion', potionId: 'potion-hp', idempotencyKey: 'shop:fixture-1' };
    const first = applyCentralOperation(current, operation, 'fixture-command-0001');
    const persisted = JSON.parse(JSON.stringify(first.state));
    const same = applyCentralOperation(persisted, operation, 'fixture-command-0001');
    const retry = applyCentralOperation(persisted, operation, 'fixture-command-0002');
    expect(first.state.progression.coins).toBe(60);
    expect(same.state.progression.coins).toBe(60);
    expect(retry.state.inventory.consumables['potion-hp']).toBe(1);
    expect(current.progression.coins).toBe(100);
    expect(JSON.stringify(first.persisted)).not.toContain('operationReceipts');
    expect(() => applyCentralOperation(persisted, { ...operation, potionId: 'potion-mp' }, 'fixture-command-0001')).toThrow('IDEMPOTENCY_KEY_REUSED');
  });
  it('ไม่รับจำนวน kill หรือรางวัลจาก client เป็น quest progress', () => {
    const current = defaultPlayerState();
    expect(() => applyCentralOperation(current, { type: 'questProgress', events: [{ kind: 'kill', amount: 99 }] }, 'fixture-command-0003')).toThrow();
    const read = applyCentralOperation(current, { type: 'questProgress' }, 'fixture-command-0003');
    expect(read.state.progression).toEqual(current.progression);
  });
});
