/**
 * S10 — ตัวประสานเควสต์ local ↔ Server
 * หลักการ: เกมยังตอบสนองทันที (accept/นับแต้มโชว์ใน UI ทันที) แต่ "รางวัล"
 * แจกได้จากคำตอบ claim ของ Server เท่านั้น — โหมด remote ไม่มีการแจกรางวัล local
 * - เหตุการณ์ kill/deliver ถูกคิวแล้ว flush เป็นชุด (debounce) → Server คืน
 *   progress ทางการมาทับของ local
 * - Server แจ้ง completed → คงสถานะพร้อมส่งไว้จนผู้เล่นกดส่งเควส
 * - เปิดเกมใหม่: ดึงสถานะจาก Server มา reconcile (Server ชนะ) — local มีเควสต์
 *   ที่ Server ไม่รู้จัก → รับใหม่บน Server แล้วรายงานแต้มที่ค้างไว้
 */

import type { QuestProgressEventPayload } from '@pirate-fruit/shared';
import { QUESTS_BY_ID } from '@pirate-fruit/shared';
import {
  newQuestClaimKey,
  RemoteQuestError,
  type RemoteQuestExecutor,
} from './RemoteQuestClient';

export interface RemoteQuestHost {
  /** เควสต์ active ฝั่ง local (id + progress ปัจจุบัน) */
  getLocalActive(): { questId: string; progress: number[] } | null;
  /** ตั้งสถานะ local ให้ตรงกับ Server (ไม่แจกรางวัล) */
  forceState(questId: string | null, progress: number[]): void;
  /** progress ทางการจาก Server มาทับของ local (เควสต์เดิม) */
  syncServerProgress(questId: string, progress: number[]): void;
  /** รางวัลที่ Server ตัดสิน — apply เข้า progression + ปิดเควสต์ + emit event */
  applyServerClaim(
    questId: string,
    rewards: { playerExp: number; coins: number; masteryBonus: number },
  ): void;
  /** ข้อความแจ้งผู้เล่น (toast) — optional */
  notice?(message: string): void;
}

const FLUSH_DELAY_MS = 1_000;
const RETRY_DELAY_MS = 5_000;

export class RemoteQuestSync {
  private queue: QuestProgressEventPayload[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private inflight = false;
  private pendingClaim: { questId: string; key: string } | null = null;
  private stopped = false;

  constructor(
    private readonly executor: RemoteQuestExecutor,
    private readonly host: RemoteQuestHost,
  ) {}

  stop(): void {
    this.stopped = true;
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
  }

  /** เรียกครั้งเดียวหลังบูต — ปรับ local ให้ตรง Server แล้วไล่เก็บงานที่ค้าง */
  async reconcile(): Promise<void> {
    let state;
    try {
      state = await this.executor.state();
    } catch {
      return; // ออนไลน์ไม่ได้ตอนนี้ — ค่อยตามเก็บตอน flush รอบถัดไป
    }
    const local = this.host.getLocalActive();

    if (state.active) {
      if (!local || local.questId !== state.active.questId) {
        this.host.forceState(state.active.questId, state.active.progress);
      } else {
        this.host.syncServerProgress(state.active.questId, state.active.progress);
      }
      if (state.active.status === 'completed') {
        this.scheduleFlush(0);
      }
      return;
    }

    if (local) {
      // Server ไม่มีเควสต์นี้ (เล่น local มาก่อน/เพิ่งเปิด flag) → รับใหม่บน Server
      // แล้วรายงานแต้มที่นับไว้ (เป็น client report ชั้นเดียวกับรายงานสด)
      const definition = QUESTS_BY_ID.get(local.questId);
      if (!definition) return;
      try {
        await this.executor.accept(local.questId, true);
      } catch (error) {
        if (error instanceof RemoteQuestError && error.code === 'LEVEL_TOO_LOW') {
          this.host.forceState(null, []);
          this.host.notice?.('เควสต์ถูกยกเลิก: เลเวลบน Server ยังไม่ถึง');
        }
        return;
      }
      definition.objectives.forEach((objective, index) => {
        const count = Math.min(objective.requiredAmount, local.progress[index] ?? 0);
        if (count <= 0) return;
        this.enqueue({
          kind: objective.type === 'deliver' ? 'deliver' : 'kill',
          targetId: objective.targetId,
          amount: count,
          isBoss: objective.type === 'boss' ? true : undefined,
          islandId: objective.islandId,
        });
      });
      this.scheduleFlush(0);
    }
  }

  /** local รับเควสต์แล้ว → บอก Server (ไม่บล็อก UI; ขัดแย้ง → Server ชนะ) */
  notifyAccepted(questId: string, replaceActive: boolean): void {
    this.queue = [];
    this.pendingClaim = null;
    void this.executor
      .accept(questId, replaceActive)
      .catch(async (error: unknown) => {
        if (!(error instanceof RemoteQuestError) || error.code === 'NETWORK') {
          // ออฟไลน์ชั่วคราว — reconcile รอบถัดไปจะรับใหม่ให้เอง
          return;
        }
        if (error.code === 'QUEST_ALREADY_ACTIVE') return; // ตรงกันอยู่แล้ว
        // ขัดแย้งจริง (เลเวล/เควสต์อื่น active) → ดึงสถานะ Server มาทับ
        try {
          const state = await this.executor.state();
          this.host.forceState(state.active?.questId ?? null, state.active?.progress ?? []);
          this.host.notice?.('เควสต์ถูกปรับตามข้อมูล Server');
        } catch { /* ไว้ค่อย reconcile */ }
      });
  }

  notifyAbandoned(): void {
    this.queue = [];
    this.pendingClaim = null;
    void this.executor.abandon().catch(async () => {
      this.host.notice?.('ยกเลิกเควสต์บน Server ไม่สำเร็จ — กำลังคืนสถานะเดิม');
      await this.reconcile();
      this.scheduleFlush(RETRY_DELAY_MS);
    });
  }

  notifyKill(targetId: string, isBoss: boolean): void {
    this.enqueue({ kind: 'kill', targetId, amount: 1, isBoss: isBoss ? true : undefined });
    this.scheduleFlush();
  }

  notifyDeliver(commodityId: string, islandId: string, quantity: number): void {
    let remaining = Math.max(1, Math.floor(quantity));
    while (remaining > 0) {
      const amount = Math.min(99, remaining);
      this.enqueue({ kind: 'deliver', targetId: commodityId, amount, islandId });
      remaining -= amount;
    }
    this.scheduleFlush();
  }

  /** local เห็นว่าครบแล้ว — เร่ง flush เพื่อให้ Server ยืนยันและเข้าสู่ claim */
  requestClaim(questId: string): void {
    this.beginClaim(questId);
    this.scheduleFlush(0);
  }

  /** local เห็นว่าครบแล้ว — flush progress แต่รอผู้เล่นกดส่งเควสก่อน claim */
  notifyCompleted(_questId: string): void {
    this.scheduleFlush(0);
  }

  private beginClaim(questId: string): void {
    if (this.pendingClaim?.questId !== questId) {
      this.pendingClaim = { questId, key: newQuestClaimKey() };
    }
  }

  private enqueue(event: QuestProgressEventPayload): void {
    // รวมเหตุการณ์ชนิดเดียวกันในคิว (กันคิวบวมตอนออฟไลน์)
    const same = this.queue.find(
      (queued) =>
        queued.kind === event.kind
        && queued.targetId === event.targetId
        && queued.isBoss === event.isBoss
        && queued.islandId === event.islandId
        && queued.amount < 99,
    );
    if (same) same.amount = Math.min(99, same.amount + event.amount);
    else this.queue.push(event);
  }

  private scheduleFlush(delay = FLUSH_DELAY_MS): void {
    if (this.stopped || this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, delay);
  }

  private async flush(): Promise<void> {
    if (this.inflight || this.stopped) return;
    this.inflight = true;
    try {
      if (this.queue.length > 0) {
        const batch = this.queue.slice(0, 10);
        const response = await this.executor.progress(batch);
        // ส่งสำเร็จแล้วเท่านั้นจึงตัดออกจากคิว
        this.queue.splice(0, batch.length);
        if (response.questId) {
          const optimistic = [...response.progress];
          const definition = QUESTS_BY_ID.get(response.questId);
          if (definition) {
            for (const event of this.queue) {
              definition.objectives.forEach((objective, index) => {
                const matchesKind = event.kind === 'deliver'
                  ? objective.type === 'deliver'
                  : objective.type === 'kill' || objective.type === 'boss' && event.isBoss === true;
                if (!matchesKind || objective.targetId !== event.targetId) return;
                if (objective.islandId && objective.islandId !== event.islandId) return;
                optimistic[index] = Math.min(
                  objective.requiredAmount,
                  (optimistic[index] ?? 0) + event.amount,
                );
              });
            }
          }
          this.host.syncServerProgress(response.questId, optimistic);
        }
      }
      if (this.pendingClaim && this.queue.length === 0) {
        const { questId, key } = this.pendingClaim;
        try {
          const outcome = await this.executor.claim(questId, key);
          this.pendingClaim = null;
          this.host.applyServerClaim(outcome.questId, {
            playerExp: outcome.playerExp,
            coins: outcome.coins,
            masteryBonus: outcome.masteryBonus,
          });
        } catch (error) {
          if (error instanceof RemoteQuestError && error.code === 'QUEST_NOT_COMPLETE') {
            // Server ยังเห็นไม่ครบ (เหตุการณ์บางส่วนยังไม่ถึง) — รอรายงานรอบถัดไป
            // หรือรอบนี้เคยเคลมสำเร็จไปแล้ว → เลิกพยายาม
            const state = await this.executor.state().catch(() => null);
            if (state && !state.active) this.pendingClaim = null;
          } else if (error instanceof RemoteQuestError && error.code === 'NO_ACTIVE_QUEST') {
            this.pendingClaim = null;
          } else {
            throw error; // network/5xx → retry ตามตารางด้านล่าง
          }
        }
      }
    } catch {
      this.scheduleFlush(RETRY_DELAY_MS);
      return;
    } finally {
      this.inflight = false;
    }
    if (this.queue.length > 0) this.scheduleFlush();
    else if (this.pendingClaim) this.scheduleFlush(RETRY_DELAY_MS);
  }
}
