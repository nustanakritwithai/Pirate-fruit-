import {
  SHOP_PROTOCOL_SCHEMA_VERSION,
  type ShopPurchaseRequest,
  type ShopPurchaseResponse,
  type ShopPotionId,
} from '@pirate-fruit/shared';
import { getRemoteSession } from '../session/RemoteSession';
import { getPocketOperationExecutor, requestPocketOperation, type PocketOperationExecutor } from '../persistence/PocketOperationExecutor';

export interface RemoteShopExecutor {
  purchase(action: 'draw' | 'potion', potionId?: ShopPotionId): Promise<ShopPurchaseResponse>;
}

function isShopPurchaseResponse(value: unknown): value is ShopPurchaseResponse {
  const payload = value as Partial<ShopPurchaseResponse> | null;
  return !!payload && payload.ok === true
    && payload.schemaVersion === SHOP_PROTOCOL_SCHEMA_VERSION
    && (payload.action === 'draw' || payload.action === 'potion')
    && typeof payload.coins === 'number' && !!payload.item
    && typeof payload.quantity === 'number' && typeof payload.isNew === 'boolean'
    && typeof payload.idempotentReplay === 'boolean';
}

function idempotencyKey(): string {
  const suffix = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `shop:${suffix}`;
}

export function createRemoteShopExecutor(
  apiUrl: string,
  csrfToken: string,
  fetcher: typeof globalThis.fetch = globalThis.fetch.bind(globalThis),
): RemoteShopExecutor {
  const baseUrl = apiUrl.replace(/\/+$/, '');
  return {
    async purchase(action, potionId) {
      const body: ShopPurchaseRequest = {
        schemaVersion: SHOP_PROTOCOL_SCHEMA_VERSION,
        idempotencyKey: idempotencyKey(),
        action,
        ...(potionId ? { potionId } : {}),
      };
      let lastError: Error | null = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const response = await fetcher(`${baseUrl}/api/shop/purchase`, {
            method: 'POST',
            credentials: 'include',
            headers: {
              accept: 'application/json',
              'content-type': 'application/json',
              'x-csrf-token': csrfToken,
            },
            body: JSON.stringify(body),
          });
          const payload = await response.json().catch(() => null) as Partial<ShopPurchaseResponse> & {
            error?: { message?: string };
          } | null;
          if (!response.ok) throw new Error(payload?.error?.message ?? `Shop request failed (${response.status})`);
          if (
            payload?.ok !== true
            || payload.schemaVersion !== SHOP_PROTOCOL_SCHEMA_VERSION
            || typeof payload.coins !== 'number'
            || !payload.item
          ) throw new Error('Shop response is invalid');
          return payload as ShopPurchaseResponse;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          if (attempt === 1) throw lastError;
        }
      }
      throw lastError ?? new Error('Shop request failed');
    },
  };
}

export function createRemoteShopOperationExecutor(executor: PocketOperationExecutor): RemoteShopExecutor {
  return {
    async purchase(action, potionId) {
      const idempotencyKeyValue = idempotencyKey();
      return requestPocketOperation(executor, {
        type: 'shopPurchase', action, idempotencyKey: idempotencyKeyValue,
        ...(potionId ? { potionId } : {}),
      }, isShopPurchaseResponse);
    },
  };
}

export function initializeRemoteShop(): RemoteShopExecutor | null {
  const pocketExecutor = getPocketOperationExecutor();
  if (pocketExecutor) return createRemoteShopOperationExecutor(pocketExecutor);
  const enabled = import.meta.env.VITE_ENABLE_PROGRESSION_SERVER;
  if (enabled !== 'true' && enabled !== '1') return null;
  const session = getRemoteSession();
  const raw = import.meta.env.VITE_API_URL?.trim();
  if (session.mode !== 'online' || !session.csrfToken || !raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return createRemoteShopExecutor(url.toString(), session.csrfToken);
  } catch {
    return null;
  }
}
