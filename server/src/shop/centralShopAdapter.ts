import {
  SHOP_PROTOCOL_SCHEMA_VERSION,
  type ShopPurchaseRequest,
  type ShopPurchaseResponse,
} from '@pirate-fruit/shared';
import type { ShopService } from './shopService.js';
import { shopRequestFromOperation } from './shopRules.js';

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
