import type {
  EconomyLogEntry,
  EconomyWorldState,
  LivingCommodityId,
  MarketState,
  TradeNewsItem,
} from './types';
import type { EconomyEventPriority } from './EconomyEventClassifier';
import { LIVING_COMMODITY_META } from './ProductionRecipes';

const COMMODITY_LABELS: Record<LivingCommodityId, string> = Object.fromEntries(
  Object.entries(LIVING_COMMODITY_META).map(([id, meta]) => [id, meta.label]),
) as Record<LivingCommodityId, string>;

const STATE_LABELS: Record<MarketState, string> = {
  surplus: 'ล้นตลาด',
  balanced: 'สมดุล',
  shortage: 'ขาดแคลน',
  crisis: 'วิกฤต',
  collapsed: 'ล่มสลาย',
};

let newsCounter = 0;

export function generateNewsFromTick(
  world: EconomyWorldState,
  tickLog: EconomyLogEntry[],
): TradeNewsItem[] {
  const items: TradeNewsItem[] = [];
  const now = Date.now();

  for (const entry of tickLog.slice(0, 4)) {
    const priority: EconomyEventPriority | undefined =
      entry.message.includes('ผลิต') && entry.message.includes('หน่วย')
        ? 'silent'
        : undefined;
    items.push(makeNews(entry.message, entry.cellId, entry.commodityId, now, priority));
  }

  for (const cell of world.cells) {
    for (const [id, item] of Object.entries(cell.commodities) as [LivingCommodityId, NonNullable<typeof cell.commodities[LivingCommodityId]>][]) {
      if (!item) continue;
      if (item.marketState === 'crisis' && item.memory.shortageTicks >= 3) {
        items.push(makeNews(
          `${cell.nameTh}ขาด${COMMODITY_LABELS[id]}ต่อเนื่อง ${item.memory.shortageTicks} รอบ — ราคามีแนวโน้มเพิ่ม`,
          cell.id,
          id,
          now,
          'high',
        ));
      }
      if (item.marketState === 'surplus' && item.memory.surplusTicks >= 2) {
        items.push(makeNews(
          `${COMMODITY_LABELS[id]}ล้นตลาดที่${cell.nameTh} — พ่อค้ามองหาเส้นทางส่งออก`,
          cell.id,
          id,
          now,
          'low',
        ));
      }
      if (item.marketState === 'collapsed') {
        items.push(makeNews(
          `ตลาด${COMMODITY_LABELS[id]}ที่${cell.nameTh}${STATE_LABELS.collapsed} — ต้องการความช่วยเหลือ`,
          cell.id,
          id,
          now,
          'critical',
        ));
      }
    }
  }

  return items.slice(0, 4);
}

function makeNews(
  message: string,
  cellId: string | undefined,
  commodityId: LivingCommodityId | undefined,
  now: number,
  priority?: EconomyEventPriority,
): TradeNewsItem {
  return {
    id: `news-${++newsCounter}`,
    message,
    cellId: cellId as TradeNewsItem['cellId'],
    commodityId,
    createdAt: now,
    ttlMs: 90_000,
    priority,
  };
}

export function filterActiveNews(news: readonly TradeNewsItem[], now = Date.now()): TradeNewsItem[] {
  return news.filter((n) => now - n.createdAt < n.ttlMs);
}
