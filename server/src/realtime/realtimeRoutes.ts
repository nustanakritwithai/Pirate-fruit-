import websocket from '@fastify/websocket';
import type { FastifyInstance } from 'fastify';
import { REALTIME_MAX_CLIENT_MESSAGE_BYTES } from '@pirate-fruit/shared';
import { sessionCookieName } from '../auth/sessionCookie.js';
import type { SessionService } from '../auth/sessionService.js';
import { isTrustedOrigin, type ServerEnvironment } from '../config/environment.js';
import type { RealtimeHub, RealtimeSocket } from './realtimeHub.js';

interface RealtimeRouteDependencies {
  environment: ServerEnvironment;
  sessions?: SessionService;
  realtime?: RealtimeHub;
}

/**
 * S9 — GET /ws (WebSocket upgrade)
 * ปิด flag = ไม่ register route เลย (ตอบ 404 เหมือนไม่มีระบบนี้)
 * Auth ที่จังหวะ upgrade: Origin allowlist + session cookie (HttpOnly ใบเดียว
 * กับ REST) — ปิดด้วยโค้ด 44xx ให้ client แยกเหตุผลได้โดยไม่ retry รัว
 */
export async function registerRealtimeRoutes(
  app: FastifyInstance,
  dependencies: RealtimeRouteDependencies,
): Promise<void> {
  const { environment, sessions, realtime } = dependencies;
  if (!environment.ENABLE_REALTIME || !sessions || !realtime) return;

  await app.register(websocket, {
    options: { maxPayload: REALTIME_MAX_CLIENT_MESSAGE_BYTES * 4 },
  });

  app.get('/ws', { websocket: true }, async (socket, request) => {
    const origin = request.headers.origin;
    if (!isTrustedOrigin(origin, environment)) {
      socket.close(4403, 'origin not allowed');
      return;
    }
    const session = await sessions.authenticate(
      request.cookies[sessionCookieName(environment)],
    );
    if (!session) {
      socket.close(4401, 'session required');
      return;
    }

    const connection = realtime.register(
      socket as unknown as RealtimeSocket,
      session.record.userId,
      session.record.characterId,
      session.record.characterName,
    );
    if (!connection) return;

    socket.on('message', (data: Buffer | string) => {
      realtime.handleClientMessage(connection, data);
    });
    socket.on('close', () => realtime.unregister(connection));
    socket.on('error', () => realtime.unregister(connection));
  });
}
