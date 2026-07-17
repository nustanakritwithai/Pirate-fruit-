/**
 * S12 — ดึงสถานะ progression ทางการจาก Server (level เดินจาก EXP ที่ Server แจกเอง)
 * ใช้ reconcile ตอนบูต: ถ้า Server นำหน้า local (เช่นเล่นจากเครื่องอื่น) ให้เติม
 * EXP ส่วนต่างเข้า local; ถ้า local นำหน้า (แต้มที่รอ sync ค้างท่อ) ปล่อยให้
 * RemoteQuestSync/RemoteMonsterSync ไล่ส่งจนบรรจบเอง — ไม่มีการลดเลเวลผู้เล่น
 */

import {
  PROGRESSION_PROTOCOL_SCHEMA_VERSION,
  expRequiredForLevel,
  type ProgressionStateResponse,
} from '@pirate-fruit/shared';
import { getRemoteSession } from '../session/RemoteSession';
import type { ProgressionManager } from './ProgressionManager';

export type ProgressionFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface RemoteProgressionExecutor {
  state(): Promise<ProgressionStateResponse>;
}

/** EXP สะสมรวมตั้งแต่เลเวล 1 — ใช้เทียบว่าใครนำหน้า (level+exp เทียบตรง ๆ ไม่ได้) */
export function totalExpOf(level: number, exp: number): number {
  let total = Math.max(0, Math.floor(exp) || 0);
  const safeLevel = Math.max(1, Math.floor(level) || 1);
  for (let step = 1; step < safeLevel; step += 1) total += expRequiredForLevel(step);
  return total;
}

export function createRemoteProgressionExecutor(
  apiUrl: string,
  fetcher: ProgressionFetch = globalThis.fetch.bind(globalThis),
): RemoteProgressionExecutor {
  const baseUrl = apiUrl.replace(/\/+$/, '');
  return {
    async state() {
      const controller = new AbortController();
      const timeout = globalThis.setTimeout(() => controller.abort(), 8_000);
      try {
        const response = await fetcher(`${baseUrl}/api/progression/state`, {
          method: 'GET',
          credentials: 'include',
          headers: { accept: 'application/json' },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`progression state ${response.status}`);
        const payload = await response.json() as Partial<ProgressionStateResponse>;
        if (
          payload.ok !== true
          || payload.schemaVersion !== PROGRESSION_PROTOCOL_SCHEMA_VERSION
          || typeof payload.level !== 'number'
          || typeof payload.exp !== 'number'
        ) {
          throw new Error('progression state payload is invalid');
        }
        return payload as ProgressionStateResponse;
      } finally {
        globalThis.clearTimeout(timeout);
      }
    },
  };
}

/** เติม EXP ส่วนต่างเมื่อ Server นำหน้า local — คืน true เมื่อมีการปรับ */
export async function reconcileProgression(
  executor: RemoteProgressionExecutor,
  progression: ProgressionManager,
): Promise<boolean> {
  let state: ProgressionStateResponse;
  try {
    state = await executor.state();
  } catch {
    return false; // ออฟไลน์ตอนนี้ — ไม่ปรับอะไร
  }
  const local = progression.getState().player;
  const serverTotal = totalExpOf(state.level, state.exp);
  const localTotal = totalExpOf(local.level, local.exp);
  if (serverTotal <= localTotal) return false;
  progression.addPlayerExp(serverTotal - localTotal, 'server-reconcile');
  return true;
}

/** เปิดใช้เมื่อ VITE_ENABLE_PROGRESSION_SERVER + session online เท่านั้น */
export function initializeRemoteProgression(): RemoteProgressionExecutor | null {
  const flag = import.meta.env.VITE_ENABLE_PROGRESSION_SERVER;
  if (flag !== 'true' && flag !== '1') return null;
  if (getRemoteSession().mode !== 'online') return null;
  const raw = import.meta.env.VITE_API_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return createRemoteProgressionExecutor(url.toString());
  } catch {
    return null;
  }
}
