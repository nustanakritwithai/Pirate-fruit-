export interface RuntimeMetricsSnapshot {
  startedAt: string;
  uptimeSeconds: number;
  requestsTotal: number;
  failedRequestsTotal: number;
  sessionsCreatedTotal: number;
  sessionsResumedTotal: number;
  sessionsRejectedTotal: number;
  sessionsRevokedTotal: number;
  memory: NodeJS.MemoryUsage;
}

export class RuntimeMetrics {
  private readonly startedAt = new Date();
  private requestsTotal = 0;
  private failedRequestsTotal = 0;
  private sessionsCreatedTotal = 0;
  private sessionsResumedTotal = 0;
  private sessionsRejectedTotal = 0;
  private sessionsRevokedTotal = 0;

  recordResponse(statusCode: number): void {
    this.requestsTotal += 1;
    if (statusCode >= 500) this.failedRequestsTotal += 1;
  }

  recordSessionCreated(): void {
    this.sessionsCreatedTotal += 1;
  }

  recordSessionResumed(): void {
    this.sessionsResumedTotal += 1;
  }

  recordSessionRejected(): void {
    this.sessionsRejectedTotal += 1;
  }

  recordSessionRevoked(): void {
    this.sessionsRevokedTotal += 1;
  }

  snapshot(): RuntimeMetricsSnapshot {
    return {
      startedAt: this.startedAt.toISOString(),
      uptimeSeconds: Math.max(0, Math.floor(process.uptime())),
      requestsTotal: this.requestsTotal,
      failedRequestsTotal: this.failedRequestsTotal,
      sessionsCreatedTotal: this.sessionsCreatedTotal,
      sessionsResumedTotal: this.sessionsResumedTotal,
      sessionsRejectedTotal: this.sessionsRejectedTotal,
      sessionsRevokedTotal: this.sessionsRevokedTotal,
      memory: process.memoryUsage(),
    };
  }
}
