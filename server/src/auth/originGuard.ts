import type { FastifyReply, FastifyRequest } from 'fastify';
import { isTrustedOrigin, type ServerEnvironment } from '../config/environment.js';

type ApiErrorFactory = (
  request: FastifyRequest,
  code: string,
  message: string,
) => { ok: false; error: { code: string; message: string; requestId: string } };

/** Reject unsafe mutations when Origin is missing or not allow-listed. */
export async function rejectUntrustedOrigin(
  request: FastifyRequest,
  reply: FastifyReply,
  environment: ServerEnvironment,
  apiError: ApiErrorFactory,
): Promise<boolean> {
  if (isTrustedOrigin(request.headers.origin, environment)) return false;
  await reply
    .status(403)
    .send(apiError(request, 'UNTRUSTED_ORIGIN', 'Request origin is not allowed'));
  return true;
}
