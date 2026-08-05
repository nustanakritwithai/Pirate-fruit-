import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { TradeAction, TradeCargoSlotSnapshot, TradeRejectCode } from '@pirate-fruit/shared';

/** ธุรกรรมถูกปฏิเสธด้วยเหตุผลทางธุรกิจ (เงิน/ของ/ความจุ) — ไม่ใช่ความผิดพลาดระบบ */
export class TradeRejectedError extends Error {
  constructor(
    readonly code: TradeRejectCode,
    message: string,
  ) {
    super(message);
    this.name = 'TradeRejectedError';
  }
}

export interface TradeMutationInput {
  characterId: string;
  action: TradeAction;
  islandId: string;
  commodityId: string;
  quantity: number;
  unitPrice: number;
  /** buy = ราคารวมที่จะหัก, sell = ยอดสุทธิที่จะได้ (หลังหัก fee แล้ว) */
  total: number;
  fee: number;
  idempotencyKey: string;
  requestHash: string;
  /** เช็คความจุด้วย databook เดียวกับ browser (ส่งมาจาก engine — pure) */
  cargoFits(boatId: string, slots: readonly TradeCargoSlotSnapshot[]): boolean;
}

export interface TradeMutationOutcome {
  coins: number;
  cargo: TradeCargoSlotSnapshot[];
  idempotentReplay: boolean;
}

export interface PreparedTradeMutation {
  outcome: TradeMutationOutcome;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

interface StoredOutcomeMetadata {
  requestHash?: string;
  result?: { coins?: number; cargo?: TradeCargoSlotSnapshot[] };
}

function numberFromBigint(value: string | number | bigint): number {
  return typeof value === 'number' ? value : Number(value);
}

export class PostgresTradeRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * ธุรกรรมเดียวจบ: ล็อกแถวตัวละคร (serialize ทุกอย่างของผู้เล่นคนนี้) →
   * เช็ค idempotency → ตรวจเงิน/ของ/ความจุ → เขียน coins + player_cargo +
   * บันทึก audit ลง trade_transactions → commit
   */
  async execute(input: TradeMutationInput): Promise<TradeMutationOutcome> {
    const prepared = await this.prepare(input);
    try {
      await prepared.commit();
      return prepared.outcome;
    } catch (error) {
      await prepared.rollback().catch(() => undefined);
      throw error;
    }
  }

  /** Hold the player transaction open until the economy snapshot is durably persisted. */
  async prepare(input: TradeMutationInput): Promise<PreparedTradeMutation> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');

      const character = await client.query<{ coins: string }>(
        'select coins::text as coins from characters where id = $1 for update',
        [input.characterId],
      );
      const characterRow = character.rows[0];
      if (!characterRow) {
        throw new TradeRejectedError('SESSION_REQUIRED', 'Character identity was not found');
      }
      const coins = numberFromBigint(characterRow.coins);

      // Idempotent replay: คำสั่งเดิม (key+payload เดิม) คืนผลเดิมโดยไม่ทำซ้ำ
      const existing = await client.query<{ metadata_json: StoredOutcomeMetadata }>(
        `select metadata_json from trade_transactions
          where character_id = $1 and idempotency_key = $2`,
        [input.characterId, input.idempotencyKey],
      );
      const replay = existing.rows[0];
      if (replay) {
        if (replay.metadata_json?.requestHash !== input.requestHash) {
          throw new TradeRejectedError(
            'IDEMPOTENCY_KEY_REUSED',
            'Idempotency key was reused with a different trade payload',
          );
        }
        return preparedMutation(client, {
          coins: replay.metadata_json.result?.coins ?? coins,
          cargo: replay.metadata_json.result?.cargo ?? [],
          idempotentReplay: true,
        });
      }

      // เรือที่เลือกอยู่ = เจ้าของช่อง cargo (S6 normalize ไว้ใน player_boats แล้ว)
      const boat = await client.query<{ id: string; boat_definition_id: string }>(
        `select id, boat_definition_id from player_boats
          where character_id = $1 and is_active = true
          limit 1`,
        [input.characterId],
      );
      const boatRow = boat.rows[0];
      if (!boatRow) {
        throw new TradeRejectedError(
          'INVALID_TRADE_REQUEST',
          'An active boat is required before trading cargo',
        );
      }

      const cargoRows = await client.query<{ commodity_id: string; quantity: number }>(
        `select commodity_id, quantity from player_cargo
          where character_id = $1 and boat_id = $2
          order by id`,
        [input.characterId, boatRow.id],
      );
      const slots: TradeCargoSlotSnapshot[] = cargoRows.rows.map((row) => ({
        commodityId: row.commodity_id,
        quantity: row.quantity,
      }));

      let nextCoins: number;
      if (input.action === 'buy') {
        if (coins < input.total) {
          throw new TradeRejectedError(
            'INSUFFICIENT_COINS',
            `Need ${input.total} coins but only ${coins} are available`,
          );
        }
        if (!input.cargoFits(boatRow.boat_definition_id, slots)) {
          throw new TradeRejectedError('CARGO_FULL', 'Cargo slots or weight capacity exceeded');
        }
        nextCoins = coins - input.total;
        await client.query(
          `insert into player_cargo (character_id, boat_id, commodity_id, quantity, updated_at)
           values ($1, $2, $3, $4, now())
           on conflict (character_id, boat_id, commodity_id)
           do update set quantity = player_cargo.quantity + excluded.quantity, updated_at = now()`,
          [input.characterId, boatRow.id, input.commodityId, input.quantity],
        );
      } else {
        const held = slots.find((slot) => slot.commodityId === input.commodityId)?.quantity ?? 0;
        if (held < input.quantity) {
          throw new TradeRejectedError(
            'INSUFFICIENT_CARGO',
            `Only ${held} units are held in cargo`,
          );
        }
        nextCoins = coins + input.total;
        if (held === input.quantity) {
          await client.query(
            `delete from player_cargo
              where character_id = $1 and boat_id = $2 and commodity_id = $3`,
            [input.characterId, boatRow.id, input.commodityId],
          );
        } else {
          await client.query(
            `update player_cargo
                set quantity = quantity - $4, updated_at = now()
              where character_id = $1 and boat_id = $2 and commodity_id = $3`,
            [input.characterId, boatRow.id, input.commodityId, input.quantity],
          );
        }
      }

      await client.query(
        'update characters set coins = $2, updated_at = now() where id = $1',
        [input.characterId, String(nextCoins)],
      );

      const after = await client.query<{ commodity_id: string; quantity: number }>(
        `select commodity_id, quantity from player_cargo
          where character_id = $1 and boat_id = $2
          order by id`,
        [input.characterId, boatRow.id],
      );
      const cargo: TradeCargoSlotSnapshot[] = after.rows.map((row) => ({
        commodityId: row.commodity_id,
        quantity: row.quantity,
      }));

      await client.query(
        `insert into trade_transactions
           (id, character_id, action, island_id, commodity_id, quantity,
            unit_price, fee, total, idempotency_key, metadata_json)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          randomUUID(),
          input.characterId,
          input.action,
          input.islandId,
          input.commodityId,
          input.quantity,
          String(input.unitPrice),
          String(input.fee),
          String(input.total),
          input.idempotencyKey,
          JSON.stringify({
            requestHash: input.requestHash,
            result: { coins: nextCoins, cargo },
          } satisfies StoredOutcomeMetadata),
        ],
      );

      return preparedMutation(client, { coins: nextCoins, cargo, idempotentReplay: false });
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      client.release();
      throw error;
    }
  }
}

function preparedMutation(
  client: PoolClient,
  outcome: TradeMutationOutcome,
): PreparedTradeMutation {
  let settled = false;
  const settle = async (operation: 'commit' | 'rollback'): Promise<void> => {
    if (settled) return;
    try {
      await client.query(operation);
      settled = true;
      client.release();
    } catch (error) {
      if (operation === 'commit') {
        await client.query('rollback').catch(() => undefined);
      }
      settled = true;
      const releaseError = error instanceof Error ? error : new Error(String(error));
      client.release(releaseError);
      throw error;
    }
  };
  return {
    outcome,
    commit: () => settle('commit'),
    rollback: () => settle('rollback'),
  };
}
