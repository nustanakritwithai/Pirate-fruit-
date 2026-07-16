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
