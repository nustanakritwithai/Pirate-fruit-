import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  SHOP_DRAW_COST,
  SHOP_GACHA_CATALOG,
  SHOP_POTIONS,
  SHOP_PROTOCOL_SCHEMA_VERSION,
  SHOP_RARITY_WEIGHT,
  type ShopCatalogEntry,
  type ShopPurchaseRequest,
} from '@pirate-fruit/shared';

const shopOperationFields = z.object({
  idempotencyKey: z.string().min(8).max(128),
  action: z.enum(['draw', 'potion']),
  potionId: z.enum(['potion-hp', 'potion-mp']).optional(),
}).strict();

function validateShopOperation(value: { action: 'draw' | 'potion'; potionId?: 'potion-hp' | 'potion-mp' }, context: z.RefinementCtx) {
  if (value.action === 'potion' && !value.potionId) context.addIssue({ code: 'custom', message: 'potionId is required for potion purchases' });
  if (value.action === 'draw' && value.potionId !== undefined) context.addIssue({ code: 'custom', message: 'potionId is not valid for draws' });
}

export const shopOperationSchema = shopOperationFields.superRefine(validateShopOperation);

export type ShopOperation = z.infer<typeof shopOperationSchema>;

export const shopRequestSchema = shopOperationFields.extend({ schemaVersion: z.literal(SHOP_PROTOCOL_SCHEMA_VERSION) })
  .superRefine(validateShopOperation);

export function parseShopRequest(input: unknown): ShopPurchaseRequest {
  return shopRequestSchema.parse(input);
}

export function parseShopOperation(input: unknown): ShopOperation {
  return shopOperationSchema.parse(input);
}

export function shopRequestFromOperation(input: unknown): ShopPurchaseRequest {
  const operation = parseShopOperation(input);
  return { schemaVersion: SHOP_PROTOCOL_SCHEMA_VERSION, ...operation };
}

export function shopRequestHash(request: ShopPurchaseRequest): string {
  return createHash('sha256').update(`${request.action}|${request.potionId ?? ''}`, 'utf8').digest('hex');
}

export function drawShopCatalog(roll: (max: number) => number): ShopCatalogEntry {
  const total = SHOP_GACHA_CATALOG.reduce((sum, item) => sum + SHOP_RARITY_WEIGHT[item.rarity], 0);
  let remaining = roll(total);
  for (const item of SHOP_GACHA_CATALOG) {
    remaining -= SHOP_RARITY_WEIGHT[item.rarity];
    if (remaining < 0) return item;
  }
  return SHOP_GACHA_CATALOG[SHOP_GACHA_CATALOG.length - 1]!;
}

export function shopInventoryKind(item: ShopCatalogEntry): string {
  return item.kind === 'fighting-style' ? 'style' : item.kind;
}

export function shopCost(request: ShopPurchaseRequest, drawn: ShopCatalogEntry | null): number {
  return drawn ? SHOP_DRAW_COST : SHOP_POTIONS[request.potionId!].price;
}

export function shopNextQuantity(drawn: ShopCatalogEntry | null, oldQuantity: number): number {
  return drawn ? Math.max(1, oldQuantity) : oldQuantity + 1;
}

export function safeCanonicalCoins(value: string): number {
  const coins = Number(value);
  if (!Number.isSafeInteger(coins) || coins < 0) throw new Error('Invalid canonical coin balance');
  return coins;
}
