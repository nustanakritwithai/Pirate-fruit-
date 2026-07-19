import { buildServer } from './app.js';
import { loadEnvironment } from './config/environment.js';
import {
  createDatabaseProbe,
  createDatabaseProbeFromPool,
  createPostgresPool,
} from './persistence/database.js';
import { PostgresSessionRepository } from './auth/sessionRepository.js';
import { SessionService } from './auth/sessionService.js';
import { PostgresCharacterRepository } from './player/characterRepository.js';
import { PostgresPlayerSaveRepository } from './player/playerSaveRepository.js';
import { PlayerSaveService } from './player/playerSaveService.js';
import { PostgresEconomyWorldRepository } from './economy/economyWorldRepository.js';
import { EconomyRuntime, type EconomyRuntimeLogger } from './economy/economyRuntime.js';
import { startGuestCleanup } from './auth/sessionCleanup.js';
import { RealtimeHub } from './realtime/realtimeHub.js';
import { MonsterWorldService } from './world/monsterWorldService.js';
import { PostgresWorldMonsterRepository } from './world/worldMonsterRepository.js';
import { BoatWorldService } from './world/boatWorldService.js';
import { PostgresBoatWorldRepository } from './world/boatWorldRepository.js';
import { PostgresTradeRepository } from './trade/tradeRepository.js';
import { TradeService } from './trade/tradeService.js';
import { PostgresQuestRepository } from './quest/questRepository.js';
import { QuestService } from './quest/questService.js';
import { PostgresMonsterRepository } from './monster/monsterRepository.js';
import { MonsterService } from './monster/monsterService.js';
import { ProgressionService } from './progression/progressionService.js';

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
    ? new PlayerSaveService(new PostgresPlayerSaveRepository(pool, { preserveServerProgression: environment.ENABLE_PROGRESSION_SERVER }))
    : undefined;
  // S18: character select CRUD (เปิดใช้จริงเมื่อ ENABLE_CHARACTER_SELECT — route ตรวจ flag เอง)
  const characters = pool ? new PostgresCharacterRepository(pool) : undefined;
  let runtimeLogger: EconomyRuntimeLogger | null = null;
  const deferredEconomyLogger: EconomyRuntimeLogger = {
    info: (fields, message) => runtimeLogger?.info(fields, message),
    warn: (fields, message) => runtimeLogger?.warn(fields, message),
    error: (fields, message) => runtimeLogger?.error(fields, message),
  };
  const realtime = environment.ENABLE_REALTIME
    ? new RealtimeHub(
        {
          info: (fields, message) => runtimeLogger?.info(fields, message),
          warn: (fields, message) => runtimeLogger?.warn(fields, message),
        },
        () => Date.now(),
        200,
        environment.ENABLE_MULTIPLAYER,
        environment.ENABLE_PVP,
      )
    : undefined;
  const economy = pool && environment.ENABLE_ECONOMY_SERVER
    ? new EconomyRuntime({
        repository: new PostgresEconomyWorldRepository(pool),
        logger: deferredEconomyLogger,
        // S9: push โลกเศรษฐกิจให้ทุก connection ทันทีหลัง persist (tick หรือ trade)
        onSnapshotPersisted: realtime
          ? (snapshot) => realtime.broadcastEconomy(snapshot.tick, JSON.stringify(snapshot.document))
          : undefined,
      })
    : undefined;
  const trade = pool && economy && environment.ENABLE_TRADE_SERVER
    ? new TradeService(economy, new PostgresTradeRepository(pool))
    : undefined;
  const progressionAuthority = environment.ENABLE_PROGRESSION_SERVER;
  const quests = pool && environment.ENABLE_QUEST_SERVER
    ? new QuestService(new PostgresQuestRepository(pool, { progressionAuthority }))
    : undefined;
  const monsters = pool && environment.ENABLE_MONSTER_SERVER
    ? new MonsterService(new PostgresMonsterRepository(pool, { progressionAuthority }))
    : undefined;
  const progression = pool && progressionAuthority
    ? new ProgressionService(pool)
    : undefined;
  const app = await buildServer({ environment, database, sessions, characters, playerSaves, economy, trade, quests, monsters, progression, realtime });
  runtimeLogger = app.log;
  // S8 ops: เก็บกวาด session หมดอายุ + guest กำพร้าเป็นรอบ (ผู้เล่นที่มีเซฟจริงไม่ถูกแตะ)
  const stopGuestCleanup = pool && environment.ENABLE_REMOTE_SESSION
    ? startGuestCleanup(pool, app.log)
    : null;
  const stopRealtimeReaper = realtime?.startReaper() ?? null;
  // S15: รอบเกิดใหม่ PvP (แยกจาก reaper เพราะต้องละเอียดกว่ารอบ heartbeat)
  const stopCombatTicker = realtime && environment.ENABLE_PVP
    ? realtime.startCombatTicker()
    : null;
  // S16: มอนสเตอร์กลาง — Server จำลอง AI/HP/death/respawn แล้ว push snapshot/delta
  const monsterWorld = realtime && environment.ENABLE_SHARED_WORLD_MONSTERS
    ? new MonsterWorldService(realtime, {
        logger: app.log,
        repository: pool ? new PostgresWorldMonsterRepository(pool) : undefined,
      })
    : null;
  if (monsterWorld) {
    // ให้ hub ส่งต่อ world-monster-hit ไปยัง Server simulation ก่อนเปิด tick/snapshot
    realtime!.attachWorldMonsters(monsterWorld);
    await monsterWorld.load(); // restart recovery
    monsterWorld.start();
  }
  // S17: persistent boat entities. S14 presence remains untouched while the flag is false.
  const boatWorld = realtime && environment.ENABLE_BOAT_WORLD
    ? new BoatWorldService(realtime, {
        logger: app.log,
        repository: pool ? new PostgresBoatWorldRepository(pool) : undefined,
      })
    : null;
  if (boatWorld) {
    realtime!.attachBoatWorld(boatWorld);
    await boatWorld.load();
    boatWorld.start();
  }
  let shuttingDown = false;

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, 'graceful shutdown started');

    try {
      stopGuestCleanup?.();
      stopRealtimeReaper?.();
      stopCombatTicker?.();
      if (monsterWorld) await monsterWorld.stop(); // persist สถานะก่อนปิด
      if (boatWorld) await boatWorld.stop();
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
