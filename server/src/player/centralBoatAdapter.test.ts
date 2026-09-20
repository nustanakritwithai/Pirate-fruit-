import { describe, expect, it } from 'vitest';
import { defaultPlayerState } from './playerState.js';
import { applyCanonicalBoatOperation } from './centralBoatAdapter.js';

function stateWithCoins(coins = 10_000) {
  const state = defaultPlayerState();
  state.boats = [];
  state.progression.coins = coins;
  return state;
}

describe('central boat adapter', () => {
  it('ซื้อเรือด้วยราคา shared และหักเหรียญ canonical พร้อมตั้งเรือ active', () => {
    const result = applyCanonicalBoatOperation(stateWithCoins(), { type: 'boatPurchase', boatId: 'swift-sloop', price: 1 });
    expect(result.outcome).toMatchObject({ ok: true, type: 'boatPurchase', boatId: 'swift-sloop', coins: 9_500 });
    expect(result.state.boats).toHaveLength(1);
    expect(result.state.boats[0]).toMatchObject({ definitionId: 'swift-sloop', active: true });
  });

  it('อัปเกรดเฉพาะเรือที่เป็นเจ้าของและใช้ระดับ/ราคา server catalog', () => {
    const purchased = applyCanonicalBoatOperation(stateWithCoins(), { type: 'boatPurchase', boatId: 'swift-sloop' });
    const result = applyCanonicalBoatOperation(purchased.state, { type: 'boatUpgrade', boatId: 'swift-sloop', kind: 'hull', price: 0 });
    expect(result.outcome).toMatchObject({ ok: true, type: 'boatUpgrade', level: 1, coins: 9_100 });
    expect(result.state.boats[0]!.upgrades.hull).toBe(1);
    expect(() => applyCanonicalBoatOperation(result.state, { type: 'boatUpgrade', boatId: 'war-galleon', kind: 'hull' })).toThrow('BOAT_NOT_OWNED');
  });

  it('ปฏิเสธซื้อซ้ำ เงินไม่พอ และการอัปเกรดเกินเพดานโดยไม่กลาย state', () => {
    const purchased = applyCanonicalBoatOperation(stateWithCoins(5_000), { type: 'boatPurchase', boatId: 'swift-sloop' });
    expect(() => applyCanonicalBoatOperation(purchased.state, { type: 'boatPurchase', boatId: 'swift-sloop' })).toThrow('BOAT_ALREADY_OWNED');
    expect(() => applyCanonicalBoatOperation(stateWithCoins(499), { type: 'boatPurchase', boatId: 'swift-sloop' })).toThrow('INSUFFICIENT_COINS');
    let current = purchased.state;
    for (let i = 0; i < 3; i++) current = applyCanonicalBoatOperation(current, { type: 'boatUpgrade', boatId: 'swift-sloop', kind: 'hull' }).state;
    expect(() => applyCanonicalBoatOperation(current, { type: 'boatUpgrade', boatId: 'swift-sloop', kind: 'hull' })).toThrow('BOAT_UPGRADE_MAX');
  });
});
