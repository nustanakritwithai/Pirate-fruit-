export interface HealthResponse {
  ok: true;
  service: string;
  version: string;
  protocolVersion: number;
  commitSha?: string;
}

export interface VersionResponse {
  service: string;
  version: string;
  protocolVersion: number;
  sharedVersion: string;
  commitSha?: string;
  gitBranch?: string;
  features: {
    boatWorld: boolean;
  };
}

export type DatabaseReadiness = 'ready' | 'disabled' | 'unavailable';

export interface ReadyResponse {
  ok: boolean;
  service: string;
  version: string;
  protocolVersion: number;
  commitSha?: string;
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
