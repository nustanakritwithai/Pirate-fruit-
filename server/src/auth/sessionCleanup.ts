import type { Pool } from 'pg';

/** รอบทำความสะอาด (มิลลิวินาที) */
export const GUEST_CLEANUP_INTERVAL_MS = 60 * 60 * 1_000;
/** เก็บ session ที่หมดอายุ/ถูก revoke ไว้ตรวจสอบย้อนหลังกี่วันก่อนลบ */
export const EXPIRED_SESSION_RETENTION_DAYS = 7;
/** guest ที่ไม่มีความคืบหน้าและไม่มี session เหลือ อยู่ได้นานสุดกี่วัน */
export const ORPHAN_GUEST_RETENTION_DAYS = 45;

export interface GuestCleanupResult {
  expiredSessions: number;
  orphanUsers: number;
}

export interface GuestCleanupLogger {
  info(fields: object, message: string): void;
  warn(fields: object, message: string): void;
}

/**
 * S8 ops — เก็บกวาดข้อมูล guest ที่ไม่มีทางกลับมาแล้ว:
 * 1) sessions ที่หมดอายุ/ถูก revoke เกินระยะเก็บ
 * 2) users ที่ไม่มี session เหลือ + ตัวละครไม่เคยเซฟ/ไม่เคย migrate + เก่ากว่า retention
 *    (characters/sessions ลบตาม cascade ของ FK)
 * ผู้เล่นที่มีความคืบหน้าจริง (save_revision > 0 หรือเคย migrate) ไม่ถูกลบเด็ดขาด
 */
export async function cleanupGuestData(
  pool: Pool,
  now: Date = new Date(),
): Promise<GuestCleanupResult> {
  const sessionCutoff = new Date(
    now.getTime() - EXPIRED_SESSION_RETENTION_DAYS * 24 * 60 * 60 * 1_000,
  );
  const guestCutoff = new Date(
    now.getTime() - ORPHAN_GUEST_RETENTION_DAYS * 24 * 60 * 60 * 1_000,
  );

  const sessions = await pool.query<{ id: string }>(
    `delete from sessions
      where (revoked_at is not null and revoked_at < $1)
         or expires_at < $1
      returning id`,
    [sessionCutoff],
  );

  // คัดผู้สมควรลบเป็นขั้น (อ่านง่าย + เข้ากับ pg-mem ในเทสต์):
  // เก่ากว่า retention − ยังมี session เหลือ − มีความคืบหน้าจริง = ลบได้
  const candidates = await pool.query<{ id: string }>(
    'select id from users where created_at < $1',
    [guestCutoff],
  );
  const withSessions = await pool.query<{ user_id: string }>(
    'select distinct user_id from sessions',
  );
  const withProgress = await pool.query<{ user_id: string }>(
    `select distinct user_id from characters
      where save_revision > 0 or local_save_migrated_at is not null`,
  );
  const keep = new Set([
    ...withSessions.rows.map((row) => row.user_id),
    ...withProgress.rows.map((row) => row.user_id),
  ]);
  const doomed = candidates.rows.map((row) => row.id).filter((id) => !keep.has(id));

  let orphanUsers = 0;
  for (const id of doomed) {
    const removed = await pool.query('delete from users where id = $1 returning id', [id]);
    orphanUsers += removed.rows.length;
  }

  return {
    expiredSessions: sessions.rows.length,
    orphanUsers,
  };
}

/** เริ่มรอบทำความสะอาดอัตโนมัติ — คืนฟังก์ชัน stop สำหรับ graceful shutdown */
export function startGuestCleanup(
  pool: Pool,
  logger: GuestCleanupLogger,
  intervalMs = GUEST_CLEANUP_INTERVAL_MS,
): () => void {
  let running = false;
  const run = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      const result = await cleanupGuestData(pool);
      if (result.expiredSessions > 0 || result.orphanUsers > 0) {
        logger.info(result, 'guest cleanup removed stale rows');
      }
    } catch (error) {
      logger.warn({ err: error }, 'guest cleanup failed; will retry next interval');
    } finally {
      running = false;
    }
  };
  void run();
  const timer = setInterval(() => void run(), intervalMs);
  return () => clearInterval(timer);
}
