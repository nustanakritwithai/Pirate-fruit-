import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  QUEST_PROGRESS_MAX_AMOUNT,
  QUEST_PROGRESS_MAX_EVENTS,
  QUEST_PROTOCOL_SCHEMA_VERSION,
  type QuestAcceptResponse,
  type QuestClaimResponse,
  type QuestProgressResponse,
  type QuestStateResponse,
} from '@pirate-fruit/shared';
import type { PostgresQuestRepository } from './questRepository.js';

const acceptSchema = z.object({
  schemaVersion: z.literal(QUEST_PROTOCOL_SCHEMA_VERSION),
  questId: z.string().min(1).max(128),
  replaceActive: z.boolean().optional(),
});

const progressSchema = z.object({
  schemaVersion: z.literal(QUEST_PROTOCOL_SCHEMA_VERSION),
  events: z
    .array(
      z.object({
        kind: z.enum(['kill', 'deliver']),
        targetId: z.string().min(1).max(128),
        amount: z.number().int().min(1).max(QUEST_PROGRESS_MAX_AMOUNT),
        isBoss: z.boolean().optional(),
        islandId: z.string().min(1).max(96).optional(),
      }),
    )
    .min(1)
    .max(QUEST_PROGRESS_MAX_EVENTS),
});

const claimSchema = z.object({
  schemaVersion: z.literal(QUEST_PROTOCOL_SCHEMA_VERSION),
  questId: z.string().min(1).max(128),
  idempotencyKey: z.string().min(8).max(128),
});

/**
 * S10 Quest/Reward Authority — Client ส่ง intent, Server ตัดสินสถานะ+รางวัล
 * เงินรางวัลเขียนเข้า characters.coins (canonical) พร้อม audit ใน quest_claims
 */
export class QuestService {
  constructor(private readonly repository: PostgresQuestRepository) {}

  async state(characterId: string): Promise<QuestStateResponse> {
    const snapshot = await this.repository.getState(characterId);
    return {
      ok: true,
      schemaVersion: QUEST_PROTOCOL_SCHEMA_VERSION,
      active: snapshot.active,
      completedQuestIds: snapshot.completedQuestIds,
    };
  }

  async accept(characterId: string, body: unknown): Promise<QuestAcceptResponse> {
    const request = acceptSchema.parse(body);
    const outcome = await this.repository.accept({
      characterId,
      questId: request.questId,
      replaceActive: request.replaceActive === true,
    });
    return {
      ok: true,
      schemaVersion: QUEST_PROTOCOL_SCHEMA_VERSION,
      questId: outcome.questId,
      progress: outcome.progress,
    };
  }

  async abandon(characterId: string): Promise<{ ok: true }> {
    await this.repository.abandon(characterId);
    return { ok: true };
  }

  async progress(characterId: string, body: unknown): Promise<QuestProgressResponse> {
    const request = progressSchema.parse(body);
    const outcome = await this.repository.applyProgress({
      characterId,
      events: request.events,
    });
    return {
      ok: true,
      schemaVersion: QUEST_PROTOCOL_SCHEMA_VERSION,
      questId: outcome.questId,
      progress: outcome.progress,
      completed: outcome.completed,
    };
  }

  async claim(characterId: string, body: unknown): Promise<QuestClaimResponse> {
    const request = claimSchema.parse(body);
    const requestHash = createHash('sha256')
      .update(request.questId, 'utf8')
      .digest('hex');
    const outcome = await this.repository.claim({
      characterId,
      questId: request.questId,
      idempotencyKey: request.idempotencyKey,
      requestHash,
    });
    return {
      ok: true,
      schemaVersion: QUEST_PROTOCOL_SCHEMA_VERSION,
      questId: outcome.questId,
      playerExp: outcome.playerExp,
      coins: outcome.coins,
      masteryBonus: outcome.masteryBonus,
      coinsTotal: outcome.coinsTotal,
      idempotentReplay: outcome.idempotentReplay,
    };
  }
}
