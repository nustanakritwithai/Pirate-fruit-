import { buildServer } from './app.js';
import { loadEnvironment } from './config/environment.js';
import {
  createDatabaseProbe,
  createDatabaseProbeFromPool,
  createPostgresPool,
} from './persistence/database.js';
import { PostgresSessionRepository } from './auth/sessionRepository.js';
import { SessionService } from './auth/sessionService.js';
import { PostgresPlayerSaveRepository } from './player/playerSaveRepository.js';
import { PlayerSaveService } from './player/playerSaveService.js';
import { PostgresEconomyWorldRepository } from './economy/economyWorldRepository.js';
import { EconomyRuntime, type EconomyRuntimeLogger } from './economy/economyRuntime.js';
import { startGuestCleanup } from './auth/sessionCleanup.js';
import { PostgresTradeRepository } from './trade/tradeRepository.js';
import { TradeService } from './trade/tradeService.js';

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
  const playerSaves = pool
    ? new PlayerSaveService(new PostgresPlayerSaveRepository(pool))
    : undefined;
  let runtimeLogger: EconomyRuntimeLogger | null = null;
  const deferredEconomyLogger: EconomyRuntimeLogger = {
    info: (fields, message) => runtimeLogger?.info(fields, message),
    warn: (fields, message) => runtimeLogger?.warn(fields, message),
    error: (fields, message) => runtimeLogger?.error(fields, message),
  };
  const economy = pool && environment.ENABLE_ECONOMY_SERVER
    ? new EconomyRuntime({
        repository: new PostgresEconomyWorldRepository(pool),
        logger: deferredEconomyLogger,
      })
    : undefined;
  const trade = pool && economy && environment.ENABLE_TRADE_SERVER
    ? new TradeService(economy, new PostgresTradeRepository(pool))
    : undefined;
  const app = await buildServer({ environment, database, sessions, playerSaves, economy, trade });
  runtimeLogger = app.log;
  // S8 ops: เก็บกวาด session หมดอายุ + guest กำพร้าเป็นรอบ (ผู้เล่นที่มีเซฟจริงไม่ถูกแตะ)
  const stopGuestCleanup = pool && environment.ENABLE_REMOTE_SESSION
    ? startGuestCleanup(pool, app.log)
    : null;
  let shuttingDown = false;

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, 'graceful shutdown started');

    try {
      stopGuestCleanup?.();
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
    await economy?.start();
    await app.listen({ host: environment.HOST, port: environment.PORT });
  } catch (error) {
    app.log.fatal({ err: error }, 'server startup failed');
    await app.close().catch(() => undefined);
    process.exitCode = 1;
  }
}

void start();
