import { buildServer } from './app.js';
import { loadEnvironment } from './config/environment.js';
import {
  createDatabaseProbe,
  createDatabaseProbeFromPool,
  createPostgresPool,
} from './persistence/database.js';
import { PostgresSessionRepository } from './auth/sessionRepository.js';
import { SessionService } from './auth/sessionService.js';

async function start(): Promise<void> {
  const environment = loadEnvironment();
  const pool = environment.DATABASE_URL
    ? createPostgresPool(environment.DATABASE_URL)
    : undefined;
  const database = pool ? createDatabaseProbeFromPool(pool) : createDatabaseProbe();
  const sessions = pool && environment.SESSION_SECRET
    ? new SessionService(
        new PostgresSessionRepository(pool),
        environment.SESSION_SECRET,
        environment.SESSION_TTL_DAYS,
      )
    : undefined;
  const app = await buildServer({ environment, database, sessions });
  let shuttingDown = false;

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, 'graceful shutdown started');

    try {
      await app.close();
      app.log.info('graceful shutdown completed');
    } catch (error) {
      app.log.error({ err: error }, 'graceful shutdown failed');
      process.exitCode = 1;
    }
  };

  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));

  try {
    await app.listen({ host: environment.HOST, port: environment.PORT });
  } catch (error) {
    app.log.fatal({ err: error }, 'server startup failed');
    await app.close().catch(() => undefined);
    process.exitCode = 1;
  }
}

void start();
