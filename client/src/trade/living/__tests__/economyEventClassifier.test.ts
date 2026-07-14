import { describe, expect, it } from 'vitest';
import {
  batchSilentEvents,
  classifyLogEntry,
  classifyNewsItem,
  formatToastLine,
  MAX_TOAST_CHARS,
  mergeToastEvents,
  truncateDisplay,
} from '../EconomyEventClassifier';
import type { EconomyLogEntry, TradeNewsItem } from '../types';

describe('EconomyEventClassifier', () => {
  it('marks production as silent with compact message', () => {
    const entry: EconomyLogEntry = {
      tick: 1,
      message: 'ตลาดเกาะใบไม้ผลิตปลาแห้ง 2 หน่วย',
      commodityId: 'dried-fish',
    };
    const event = classifyLogEntry(entry);
    expect(event.priority).toBe('silent');
    expect(event.toastEligible).toBe(false);
    expect(event.message).toContain('ปลาแห้ง');
    expect(event.message).toContain('+2');
  });

  it('shortens production stopped message', () => {
    const entry: EconomyLogEntry = {
      tick: 2,
      message: 'การผลิตชิ้นส่วนเรือหยุดชั่วคราว — ขาดไม้เนื้อแข็ง',
      cellId: 'shipyard-island',
      commodityId: 'sailcloth',
    };
    const event = classifyLogEntry(entry);
    expect(event.kind).toBe('production_stopped');
    expect(event.toastEligible).toBe(true);
    expect(event.message).toContain('อู่เรือขาด');
    expect(event.message.length).toBeLessThanOrEqual(MAX_TOAST_CHARS);
  });

  it('truncates display text to 30 chars', () => {
    const long = 'ก'.repeat(60);
    expect(truncateDisplay(long)).toHaveLength(MAX_TOAST_CHARS);
    expect(truncateDisplay(long).endsWith('…')).toBe(true);
  });

  it('classifies market collapse as critical toast', () => {
    const entry: EconomyLogEntry = {
      tick: 2,
      message: 'ตลาดปลาแห้งล่มสลาย',
      commodityId: 'dried-fish',
    };
    const event = classifyLogEntry(entry);
    expect(event.priority).toBe('critical');
    expect(event.toastEligible).toBe(true);
  });

  it('uses explicit news priority when provided', () => {
    const item: TradeNewsItem = {
      id: 'n1',
      message: 'เหล็กล้นตลาด',
      createdAt: Date.now(),
      ttlMs: 60_000,
      priority: 'low',
    };
    expect(classifyNewsItem(item).priority).toBe('low');
    expect(classifyNewsItem(item).toastEligible).toBe(false);
  });

  it('batches multiple silent production events', () => {
    const events = [
      classifyLogEntry({ tick: 1, message: 'ผลิตปลาแห้ง 2 หน่วย', commodityId: 'dried-fish' }),
      classifyLogEntry({ tick: 1, message: 'ผลิตไม้ 3 หน่วย', commodityId: 'hardwood' }),
    ];
    const batch = batchSilentEvents(events);
    expect(batch).not.toBeNull();
    expect(batch!.message).toContain('·');
  });

  it('merges duplicate production toasts within window', () => {
    const a = classifyLogEntry({ tick: 1, message: 'ผลิตปลาแห้ง 2 หน่วย', commodityId: 'dried-fish' });
    const b = classifyLogEntry({ tick: 2, message: 'ผลิตปลาแห้ง 2 หน่วย', commodityId: 'dried-fish' });
    const toastA = { ...a, toastEligible: true, priority: 'medium' as const };
    const toastB = { ...b, toastEligible: true, priority: 'medium' as const };
    const merged = mergeToastEvents([toastA], toastB);
    expect(merged).toHaveLength(1);
    expect(merged[0].quantity).toBe(4);
  });

  it('formats toast line with icon prefix', () => {
    const event = classifyLogEntry({
      tick: 3,
      message: 'การผลิตชิ้นส่วนเรือหยุดชั่วคราว — ขาดไม้เนื้อแข็ง',
      cellId: 'shipyard-island',
    });
    expect(formatToastLine(event)).toMatch(/^⚠️/);
  });
});
