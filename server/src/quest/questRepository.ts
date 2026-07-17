import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import {
  QUESTS_BY_ID,
  QUEST_PROGRESS_MAX_AMOUNT,
  isQuestObjectivesComplete,
  type QuestDefinition,
  type QuestProgressEventPayload,
  type QuestRejectCode,
} from '@pirate-fruit/shared';

/** คำขอถูกปฏิเสธด้วยเหตุผลทางธุรกิจ (เลเวล/สถานะเควสต์/คีย์ซ้ำ) — ไม่ใช่ความผิดพลาดระบบ */
export class QuestRejectedError extends Error {
  constructor(
    readonly code: QuestRejectCode,
    message: string,
  ) {
    super(message);
    this.name = 'QuestRejectedError';
  }
}

export interface QuestStateSnapshot {
  active: { questId: string; progress: number[]; status: 'active' | 'completed' } | null;
  completedQuestIds: string[];
}

export interface QuestProgressOutcome {
  questId: string | null;
  progress: number[];
  completed: boolean;
}

export interface QuestClaimOutcome {
  questId: string;
  playerExp: number;
  coins: number;
  masteryBonus: number;
  coinsTotal: number;
  idempotentReplay: boolean;
}

interface QuestRow {
  id: string;
  quest_id: string;
  status: string;
  progress_json: { objectives?: unknown };
}

function numberFromBigint(value: string | number | bigint): number {
  return typeof value === 'number' ? value : Number(value);
}

function requireDefinition(questId: string): QuestDefinition {
  const definition = QUESTS_BY_ID.get(questId);
  if (!definition) {
    throw new QuestRejectedError('QUEST_NOT_FOUND', `Unknown quest '${questId}'`);
  }
  return definition;
}

/** progress_json เก็บเป็น {"objectives": number[]} — sanitize ทุกครั้งที่อ่าน */
function readProgress(row: QuestRow, definition: QuestDefinition): number[] {
  const raw = Array.isArray(row.progress_json?.objectives) ? row.progress_json.objectives : [];
  return definition.objectives.map((objective, index) => {
    const value = raw[index];
    const count = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : 0;
    return Math.min(objective.requiredAmount, Math.max(0, count));
  });
}

function eventMatchesObjective(
  event: QuestProgressEventPayload,
  objective: QuestDefinition['objectives'][number],
): boolean {
  if (objective.targetId !== event.targetId) return false;
  if (event.kind === 'kill') {
    return objective.type === 'kill' || (objective.type === 'boss' && event.isBoss === true);
  }
  if (objective.type !== 'deliver') return false;
  return !objective.islandId || objective.islandId === event.islandId;
}

/**
 * S10 Quest Authority — สถานะเควสต์และรางวัลเป็นของ Server
 * ทุกเมธอดเป็นธุรกรรม PostgreSQL เดียว เริ่มด้วยล็อกแถวตัวละคร (FOR UPDATE)
 * เพื่อ serialize ทุกอย่างของผู้เล่นคนเดียวกัน (แนวเดียวกับ trade S8)
 * เลขรางวัลอ่านจาก shared databook เท่านั้น — ไม่มีเลขใดมาจาก Client
 */
export class PostgresQuestRepository {
  constructor(private readonly pool: Pool) {}

  async getState(characterId: string): Promise<QuestStateSnapshot> {
    const result = await this.pool.query<QuestRow>(
      'select id::text as id, quest_id, status, progress_json from player_quests where character_id = $1',
      [characterId],
    );
    return this.buildSnapshot(result.rows);
  }

  private buildSnapshot(rows: QuestRow[]): QuestStateSnapshot {
    const activeRow = rows.find((row) => row.status === 'active' || row.status === 'completed');
    const completedQuestIds = rows
      .filter((row) => row.status === 'claimed')
      .map((row) => row.quest_id);
    if (!activeRow) return { active: null, completedQuestIds };
    const definition = QUESTS_BY_ID.get(activeRow.quest_id);
    if (!definition) return { active: null, completedQuestIds };
    return {
      active: {
        questId: activeRow.quest_id,
        progress: readProgress(activeRow, definition),
        status: activeRow.status === 'completed' ? 'completed' : 'active',
      },
      completedQuestIds,
    };
  }

  async accept(input: {
    characterId: string;
    questId: string;
    replaceActive: boolean;
  }): Promise<{ questId: string; progress: number[] }> {
    const definition = requireDefinition(input.questId);
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const character = await client.query<{ level: number }>(
        'select level from characters where id = $1 for update',
        [input.characterId],
      );
      const characterRow = character.rows[0];
      if (!characterRow) {
        throw new QuestRejectedError('SESSION_REQUIRED', 'Character identity was not found');
      }
      if (characterRow.level < definition.minimumLevel) {
        throw new QuestRejectedError(
          'LEVEL_TOO_LOW',
          `Quest requires level ${definition.minimumLevel}`,
        );
      }

      const rows = await client.query<QuestRow>(
        'select id::text as id, quest_id, status, progress_json from player_quests where character_id = $1',
        [input.characterId],
      );
      const activeRow = rows.rows.find(
        (row) => row.status === 'active' || row.status === 'completed',
      );
      if (activeRow?.quest_id === input.questId) {
        throw new QuestRejectedError('QUEST_ALREADY_ACTIVE', 'This quest is already active');
      }
      const previous = rows.rows.find((row) => row.quest_id === input.questId);
      if (!definition.repeatable && previous?.status === 'claimed') {
        throw new QuestRejectedError('QUEST_NOT_REPEATABLE', 'Quest was already completed');
      }
      if (activeRow) {
        if (!input.replaceActive) {
          throw new QuestRejectedError(
            'ACTIVE_QUEST_CONFLICT',
            `Another quest is active (${activeRow.quest_id})`,
          );
        }
        await client.query(
          `update player_quests set status = 'abandoned', updated_at = now() where id = $1`,
          [activeRow.id],
        );
      }

      const progress = definition.objectives.map(() => 0);
      const progressJson = JSON.stringify({ objectives: progress });
      if (previous) {
        await client.query(
          `update player_quests
              set status = 'active', progress_json = $2, accepted_at = now(),
                  completed_at = null, updated_at = now()
            where id = $1`,
          [previous.id, progressJson],
        );
      } else {
        await client.query(
          `insert into player_quests (character_id, quest_id, status, progress_json)
           values ($1, $2, 'active', $3)`,
          [input.characterId, input.questId, progressJson],
        );
      }
      await client.query('commit');
      return { questId: input.questId, progress };
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async abandon(characterId: string): Promise<void> {
    await this.pool.query(
      `update player_quests set status = 'abandoned', updated_at = now()
        where character_id = $1 and status in ('active', 'completed')`,
      [characterId],
    );
  }

  async applyProgress(input: {
    characterId: string;
    events: QuestProgressEventPayload[];
  }): Promise<QuestProgressOutcome> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      await client.query('select id from characters where id = $1 for update', [
        input.characterId,
      ]);
      const rows = await client.query<QuestRow>(
        'select id::text as id, quest_id, status, progress_json from player_quests where character_id = $1',
        [input.characterId],
      );
      const activeRow = rows.rows.find((row) => row.status === 'active');
      if (!activeRow) {
        // ไม่มีเควสต์ active — เหตุการณ์ค้างท่อจาก Client ถูกทิ้งเฉย ๆ (ไม่ใช่ error)
        const completedRow = rows.rows.find((row) => row.status === 'completed');
        await client.query('commit');
        if (completedRow) {
          const definition = QUESTS_BY_ID.get(completedRow.quest_id);
          if (definition) {
            return {
              questId: completedRow.quest_id,
              progress: readProgress(completedRow, definition),
              completed: true,
            };
          }
        }
        return { questId: null, progress: [], completed: false };
      }
      const definition = requireDefinition(activeRow.quest_id);
      const progress = readProgress(activeRow, definition);

      for (const event of input.events) {
        const amount = Math.min(
          QUEST_PROGRESS_MAX_AMOUNT,
          Math.max(0, Math.floor(event.amount)),
        );
        if (amount <= 0) continue;
        definition.objectives.forEach((objective, index) => {
          if (!eventMatchesObjective(event, objective)) return;
          progress[index] = Math.min(objective.requiredAmount, progress[index] + amount);
        });
      }

      const completed = isQuestObjectivesComplete(definition, progress);
      await client.query(
        `update player_quests
            set progress_json = $2, status = $3,
                completed_at = case when $3 = 'completed' then now() else completed_at end,
                updated_at = now()
          where id = $1`,
        [activeRow.id, JSON.stringify({ objectives: progress }), completed ? 'completed' : 'active'],
      );
      await client.query('commit');
      return { questId: activeRow.quest_id, progress, completed };
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async claim(input: {
    characterId: string;
    questId: string;
    idempotencyKey: string;
    requestHash: string;
  }): Promise<QuestClaimOutcome> {
    const definition = requireDefinition(input.questId);
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const character = await client.query<{ coins: string }>(
        'select coins::text as coins from characters where id = $1 for update',
        [input.characterId],
      );
      const characterRow = character.rows[0];
      if (!characterRow) {
        throw new QuestRejectedError('SESSION_REQUIRED', 'Character identity was not found');
      }
      const coins = numberFromBigint(characterRow.coins);

      // Idempotent replay: คีย์เดิม + เควสต์เดิม → คืนผลเดิมโดยไม่แจกซ้ำ
      const existing = await client.query<{
        quest_id: string;
        request_hash: string;
        player_exp: number;
        coins: number;
        mastery_bonus: number;
        coins_after: string;
      }>(
        `select quest_id, request_hash, player_exp, coins, mastery_bonus, coins_after::text as coins_after
           from quest_claims
          where character_id = $1 and idempotency_key = $2`,
        [input.characterId, input.idempotencyKey],
      );
      const replay = existing.rows[0];
      if (replay) {
        if (replay.request_hash !== input.requestHash) {
          throw new QuestRejectedError(
            'IDEMPOTENCY_KEY_REUSED',
            'Idempotency key was reused with a different quest claim',
          );
        }
        await client.query('commit');
        return {
          questId: replay.quest_id,
          playerExp: replay.player_exp,
          coins: replay.coins,
          masteryBonus: replay.mastery_bonus,
          coinsTotal: numberFromBigint(replay.coins_after),
          idempotentReplay: true,
        };
      }

      const rows = await client.query<QuestRow>(
        'select id::text as id, quest_id, status, progress_json from player_quests where character_id = $1 and quest_id = $2',
        [input.characterId, input.questId],
      );
      const questRow = rows.rows[0];
      if (!questRow || questRow.status === 'abandoned') {
        throw new QuestRejectedError('NO_ACTIVE_QUEST', 'Quest is not active for this character');
      }
      if (questRow.status !== 'completed') {
        // status 'active' = objective ยังไม่ครบตามบันทึกของ Server
        // status 'claimed' = รอบนี้เคลมไปแล้ว (คีย์ใหม่แต่ไม่มีรอบใหม่ที่ค้าง)
        throw new QuestRejectedError(
          'QUEST_NOT_COMPLETE',
          questRow.status === 'claimed'
            ? 'Quest reward was already claimed'
            : 'Quest objectives are not complete yet',
        );
      }

      const rewards = definition.rewards;
      const masteryBonus = rewards.masteryBonus ?? 0;
      const coinsTotal = coins + rewards.coins;
      await client.query(
        'update characters set coins = $2, updated_at = now() where id = $1',
        [input.characterId, String(coinsTotal)],
      );
      await client.query(
        `update player_quests set status = 'claimed', updated_at = now() where id = $1`,
        [questRow.id],
      );
      await client.query(
        `insert into quest_claims
           (id, character_id, quest_id, idempotency_key, request_hash,
            player_exp, coins, mastery_bonus, coins_after)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          randomUUID(),
          input.characterId,
          input.questId,
          input.idempotencyKey,
          input.requestHash,
          rewards.playerExp,
          rewards.coins,
          masteryBonus,
          String(coinsTotal),
        ],
      );
      await client.query('commit');
      return {
        questId: input.questId,
        playerExp: rewards.playerExp,
        coins: rewards.coins,
        masteryBonus,
        coinsTotal,
        idempotentReplay: false,
      };
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
