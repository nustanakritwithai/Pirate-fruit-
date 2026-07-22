export interface AuthoritativeResyncOptions {
  refreshEconomy(): void;
  refreshQuest?: () => Promise<unknown>;
  refreshProgression?: () => Promise<unknown>;
  flushAndRecoverSave?: () => Promise<unknown>;
}

/**
 * A realtime sequence gap can affect more than the economy snapshot. Coalesce repeated
 * gap signals while refreshing every REST-backed authority domain once.
 */
export function createAuthoritativeResyncHandler(
  options: AuthoritativeResyncOptions,
): () => void {
  let inFlight: Promise<void> | null = null;
  return () => {
    options.refreshEconomy();
    if (inFlight) return;
    const tasks = [
      options.refreshQuest,
      options.refreshProgression,
      options.flushAndRecoverSave,
    ].filter((task): task is () => Promise<unknown> => Boolean(task));
    inFlight = Promise.allSettled(tasks.map((task) => task()))
      .then(() => undefined)
      .finally(() => { inFlight = null; });
  };
}
