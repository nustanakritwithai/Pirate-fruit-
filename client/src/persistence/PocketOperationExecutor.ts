export interface PocketOperationReply {
  revision: number;
  persisted: unknown;
  outcome: unknown;
}

export interface PocketOperationExecutor {
  request(operation: Record<string, unknown>): Promise<PocketOperationReply>;
}

interface WindowWithPocketOperations extends Window {
  POCKETMONSTER_PIRATE_OPERATIONS?: { request?: (operation: Record<string, unknown>) => Promise<unknown> };
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function createPocketOperationExecutor(
  bridge: { request(operation: Record<string, unknown>): Promise<unknown> },
): PocketOperationExecutor {
  return Object.freeze({
    async request(operation: Record<string, unknown>): Promise<PocketOperationReply> {
      const result = object(await bridge.request(operation));
      if (!result || !Number.isSafeInteger(result.revision) || result.revision < 0
        || !Object.prototype.hasOwnProperty.call(result, 'persisted')
        || !Object.prototype.hasOwnProperty.call(result, 'outcome')) {
        throw new Error('POCKET_OPERATION_REPLY_INVALID');
      }
      return { revision: result.revision, persisted: result.persisted, outcome: result.outcome };
    },
  });
}

export function getPocketOperationExecutor(
  windowLike: WindowWithPocketOperations | undefined = typeof window === 'undefined' ? undefined : window,
): PocketOperationExecutor | null {
  const request = windowLike?.POCKETMONSTER_PIRATE_OPERATIONS?.request;
  return typeof request === 'function'
    ? createPocketOperationExecutor({ request: request.bind(windowLike.POCKETMONSTER_PIRATE_OPERATIONS) })
    : null;
}

export async function requestPocketOperation<T>(
  executor: PocketOperationExecutor,
  operation: Record<string, unknown>,
  verify: (value: unknown) => value is T,
): Promise<T> {
  const result = await executor.request(operation);
  if (!verify(result.outcome)) throw new Error('POCKET_OPERATION_OUTCOME_INVALID');
  return result.outcome;
}
