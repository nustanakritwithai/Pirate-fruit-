import {
  SHOP_PROTOCOL_SCHEMA_VERSION,
  type ShopPurchaseRequest,
  type ShopPurchaseResponse,
} from '@pirate-fruit/shared';
import { randomInt } from 'node:crypto';
import type { ShopService } from './shopService.js';
import {
  drawShopCatalog, safeCanonicalCoins, shopCost, shopInventoryKind,
  shopNextQuantity, shopRequestFromOperation, shopRequestHash,
} from './shopRules.js';
import { serializePlayerState, type CanonicalPlayerState } from '../player/playerState.js';

const receipts = new WeakMap<object, { idempotencyKey: string; hash: string; outcome: ShopPurchaseResponse }>();

/**
 * Canonical bridge for the existing ShopService authority.
 * It accepts only the shop protocol operation; price, item, coins, and quantity
 * remain entirely inside ShopService.purchase's transaction and catalog rules.
 */
export async function purchaseCanonicalShop(
  shop: Pick<ShopService, 'purchase'>,
  characterId: string,
  input: unknown,
): Promise<ShopPurchaseResponse> {
  const request: ShopPurchaseRequest = shopRequestFromOperation(input);
  return shop.purchase(characterId, request);
}

export function getCanonicalShopReceipt(state: CanonicalPlayerState) {
  return receipts.get(state);
}

/** Apply the existing shop economy to a canonical worker state without a Pool. */
export function applyCanonicalShopOperation(
  current: CanonicalPlayerState,
  input: unknown,
  roll: (max: number) => number = randomInt,
): { state: CanonicalPlayerState; persisted: ReturnType<typeof serializePlayerState>; outcome: ShopPurchaseResponse } {
  const request: ShopPurchaseRequest = shopRequestFromOperation(input);
  const hash = shopRequestHash(request);
  const prior = receipts.get(current);
  if (prior?.hash === hash) {
    const state = structuredClone(current);
    receipts.set(state, prior);
    return { state, persisted: serializePlayerState(state), outcome: { ...prior.outcome, idempotentReplay: true } };
  }
  if (prior?.idempotencyKey === request.idempotencyKey) throw new Error('IDEMPOTENCY_KEY_REUSED');
  const state = structuredClone(current);
  const drawn = request.action === 'draw' ? drawShopCatalog(roll) : null;
  const cost = shopCost(request, drawn);
  const coins = safeCanonicalCoins(String(state.progression.coins));
  if (coins < cost) throw new Error('INSUFFICIENT_COINS');

  const itemId = drawn?.id ?? request.potionId!;
  const inventory = state.inventory;
  let oldQuantity = 0;
  if (drawn) {
    const key: 'ownedSwords' | 'ownedGuns' | 'ownedStyles' | 'ownedFruits' = shopInventoryKind(drawn) === 'sword' ? 'ownedSwords'
      : shopInventoryKind(drawn) === 'gun' ? 'ownedGuns'
        : shopInventoryKind(drawn) === 'style' ? 'ownedStyles' : 'ownedFruits';
    const owned = inventory[key];
    oldQuantity = owned.includes(itemId) ? 1 : 0;
    if (!oldQuantity) owned.push(itemId);
  } else {
    oldQuantity = inventory.consumables[itemId] ?? 0;
    inventory.consumables[itemId] = oldQuantity + 1;
  }
  state.progression.coins = coins - cost;
  const quantity = shopNextQuantity(drawn, oldQuantity);
  const outcome: ShopPurchaseResponse = {
    ok: true, schemaVersion: SHOP_PROTOCOL_SCHEMA_VERSION, action: request.action,
    coins: state.progression.coins, item: drawn ?? { kind: 'consumable', id: request.potionId!, rarity: 'common' },
    quantity, isNew: oldQuantity === 0, idempotentReplay: false,
  };
  receipts.set(state, { idempotencyKey: request.idempotencyKey, hash, outcome });
  return { state, persisted: serializePlayerState(state), outcome };
}
