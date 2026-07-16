import {
  PROTOCOL_VERSION,
  SERVER_SERVICE_NAME,
  SHARED_PACKAGE_VERSION,
  type HealthResponse,
  type VersionResponse,
} from '@pirate-fruit/shared';

export const SERVER_VERSION = '0.1.0';

/** S1 foundation only: HTTP/WebSocket wiring is intentionally deferred to S2. */
export function createHealthResponse(): HealthResponse {
  return {
    ok: true,
    service: SERVER_SERVICE_NAME,
    version: SERVER_VERSION,
    protocolVersion: PROTOCOL_VERSION,
  };
}

export function createVersionResponse(): VersionResponse {
  return {
    service: SERVER_SERVICE_NAME,
    version: SERVER_VERSION,
    protocolVersion: PROTOCOL_VERSION,
    sharedVersion: SHARED_PACKAGE_VERSION,
  };
}
