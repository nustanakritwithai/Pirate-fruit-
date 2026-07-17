/**
 * S11 — ตัวประสานรางวัลมอนสเตอร์ local ↔ Server
 * โหมด remote: การฆ่าถูกคิวไว้ (ไม่แจกรางวัล local) แล้วรายงานเป็นชุด —
 * รางวัลทั้งหมด (exp/เหรียญ/mastery) apply จากคำตอบ Server เท่านั้น
 * - คิวเก็บลง localStorage: ปิดแท็บ/รีเฟรชแล้วรางวัลค้างท่อไม่หาย
 * - batch ที่กำลังส่งจำ idempotency key ไว้ — ส่งซ้ำหลังพัง/รีเฟรชไม่แจกซ้ำ
 * - การแตก mastery ต่ออาวุธใช้สูตรแบ่งเดิม (ฝั่ง client รู้ว่าไอเทมไหนตี)
 *   ด้วย "จำนวน" ที่ Server ตัดสิน
 */

import type { GrantedReward, LoadoutCategory, RewardContribution, RewardEnemy } from '../progression/ProgressionTypes';
import { masteryRewards } from '../progression/RewardSystem';
import {
  newKillBatchKey,
  type RemoteMonsterExecutor,
} from './RemoteMonsterClient';

export interface MonsterRewardSink {
  addPlayerExp(amount: number, source?: string): unknown;
  addCoins(amount: number, source?: string): void;
  addMasteryExp(itemId: string, category: LoadoutCategory, amount: number): unknown;
  emitRewardGranted(reward: GrantedReward): void;
  save(): void;
}

interface PendingKill {
  monsterId: string;
  contribution: RewardContribution;
}

interface StoredState {
  queue: PendingKill[];
  batch?: { key: string; count: number };
}

const STORAGE_KEY = 'pirate-fruit:pending-kills-v1';
const FLUSH_DELAY_MS = 1_200;
const RETRY_DELAY_MS = 5_000;
const MAX_BATCH = 20;
const MAX_QUEUE = 400;

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function browserStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export class RemoteMonsterSync {
  private queue: PendingKill[] = [];
  private batchKey: { key: string; count: number } | null = null;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private inflight = false;
  private stopped = false;

  constructor(
    private readonly executor: RemoteMonsterExecutor,
    private readonly sink: MonsterRewardSink,
    private readonly storage: StorageLike | null = browserStorage(),
  ) {
    this.restore();
    if (this.queue.length > 0 || this.batchKey) this.scheduleFlush(0);
  }

  stop(): void {
    this.stopped = true;
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
  }

  /** เรียกจาก ProgressionManager แทนการแจกรางวัล local (คืน true = คิวแล้ว) */
  enqueueKill(enemy: RewardEnemy, contribution: RewardContribution): boolean {
    if (this.queue.length >= MAX_QUEUE) return false; // ท่อเต็มผิดปกติ — ปล่อย local กันรางวัลหาย
    this.queue.push({ monsterId: enemy.id, contribution });
    this.persist();
    this.scheduleFlush();
    return true;
  }

  get pendingCount(): number {
    return this.queue.length;
  }

  private restore(): void {
    const raw = this.storage?.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as StoredState;
      if (Array.isArray(parsed.queue)) {
        this.queue = parsed.queue.filter(
          (entry) => entry && typeof entry.monsterId === 'string' && !!entry.contribution,
        );
      }
      if (parsed.batch && typeof parsed.batch.key === 'string') {
        this.batchKey = { key: parsed.batch.key, count: Math.max(1, parsed.batch.count | 0) };
      }
    } catch {
      this.storage?.removeItem(STORAGE_KEY);
    }
  }

  private persist(): void {
    try {
      this.storage?.setItem(
        STORAGE_KEY,
        JSON.stringify({ queue: this.queue, batch: this.batchKey ?? undefined } satisfies StoredState),
      );
    } catch { /* storage เต็ม/ปิด — คิวยังอยู่ใน memory */ }
  }

  private scheduleFlush(delay = FLUSH_DELAY_MS): void {
    if (this.stopped || this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, delay);
  }

  private async flush(): Promise<void> {
    if (this.inflight || this.stopped || this.queue.length === 0) return;
    this.inflight = true;
    try {
      // batch เดิมที่ค้าง (จากรอบก่อน/ก่อนรีเฟรช) ต้องส่งด้วย key เดิม + ชุดเดิม
      const count = Math.min(this.batchKey?.count ?? Math.min(MAX_BATCH, this.queue.length), this.queue.length);
      if (!this.batchKey || this.batchKey.count !== count) {
        // ไม่มี batch ค้าง หรือคิวถูกตัดจน payload ไม่ตรงของเดิม → เริ่ม batch ใหม่
        this.batchKey = { key: newKillBatchKey(), count };
        this.persist();
      }
      const batch = this.queue.slice(0, count);
      const response = await this.executor.reportKills(
        batch.map((kill) => ({ monsterId: kill.monsterId, count: 1 })),
        this.batchKey.key,
      );

      // apply รางวัลตามที่ Server ตัดสิน (ลำดับตรงกับที่ส่ง)
      response.rewards.forEach((reward, index) => {
        const kill = batch[index];
        if (!kill) return;
        this.sink.addPlayerExp(reward.playerExp, `enemy:${reward.monsterId}`);
        this.sink.addCoins(reward.coins, `enemy:${reward.monsterId}`);
        const mastery = masteryRewards(reward.masteryExp, kill.contribution);
        for (const grant of mastery) {
          this.sink.addMasteryExp(grant.itemId, grant.category, grant.amount);
        }
        this.sink.emitRewardGranted({
          playerExp: reward.playerExp,
          coins: reward.coins,
          mastery,
          multiplier: 1,
        });
      });
      this.queue.splice(0, batch.length);
      this.batchKey = null;
      this.persist();
      this.sink.save();
    } catch (error) {
      // key เดิมเคยถูกใช้กับ payload อื่น (ข้อมูลค้างเพี้ยน) → เริ่ม batch ใหม่รอบหน้า
      if ((error as { code?: string }).code === 'IDEMPOTENCY_KEY_REUSED') {
        this.batchKey = null;
        this.persist();
      }
      this.scheduleFlush(RETRY_DELAY_MS);
      return;
    } finally {
      this.inflight = false;
    }
    if (this.queue.length > 0) this.scheduleFlush();
  }
}
