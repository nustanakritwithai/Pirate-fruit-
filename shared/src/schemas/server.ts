export interface HealthResponse {
  ok: true;
  service: string;
  version: string;
  protocolVersion: number;
}

export interface VersionResponse {
  service: string;
  version: string;
  protocolVersion: number;
  sharedVersion: string;
}

export type DatabaseReadiness = 'ready' | 'disabled' | 'unavailable';

export interface ReadyResponse {
  ok: boolean;
  service: string;
  version: string;
  protocolVersion: number;
  database: DatabaseReadiness;
  checkedAt: string;
}

export interface ApiErrorResponse {
  ok: false;
  error: {
    code: string;
    message: string;
    requestId: string;
  };
}
