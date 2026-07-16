export interface RuntimeMetricsSnapshot {
  startedAt: string;
  uptimeSeconds: number;
  requestsTotal: number;
  failedRequestsTotal: number;
  memory: NodeJS.MemoryUsage;
}

export class RuntimeMetrics {
  private readonly startedAt = new Date();
  private requestsTotal = 0;
  private failedRequestsTotal = 0;

  recordResponse(statusCode: number): void {
    this.requestsTotal += 1;
    if (statusCode >= 500) this.failedRequestsTotal += 1;
  }

  snapshot(): RuntimeMetricsSnapshot {
    return {
      startedAt: this.startedAt.toISOString(),
      uptimeSeconds: Math.max(0, Math.floor(process.uptime())),
      requestsTotal: this.requestsTotal,
      failedRequestsTotal: this.failedRequestsTotal,
      memory: process.memoryUsage(),
    };
  }
}
