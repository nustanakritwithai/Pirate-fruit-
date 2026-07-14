import { describe, expect, it } from 'vitest';
import {
  batchSilentEvents,
  classifyLogEntry,
  classifyNewsItem,
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
    expect(event.message).toContain('ปลาแห้ง');
    expect(event.message).toContain('+2');
  });

  it('truncates display text to 45 chars', () => {
    const long = 'ก'.repeat(60);
    expect(truncateDisplay(long)).toHaveLength(45);
    expect(truncateDisplay(long).endsWith('…')).toBe(true);
  });

  it('classifies market collapse as critical', () => {
    const entry: EconomyLogEntry = {
      tick: 2,
      message: 'ตลาดปลาแห้งล่มสลาย',
      commodityId: 'dried-fish',
    };
    expect(classifyLogEntry(entry).priority).toBe('critical');
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
});
