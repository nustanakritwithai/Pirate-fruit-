import type { LivingCommodityId, TradeNewsItem, TradeWorldState } from './types';

const COMMODITY_LABELS: Record<LivingCommodityId, string> = {
  'fresh-fish': 'อาหาร',
  hardwood: 'ไม้',
  'iron-ore': 'เหล็ก',
  'sun-silk': 'ผ้า',
};

const ISLAND_LABELS: Record<string, string> = {
  'starter-island': 'เกาะป่า',
  'mist-jungle': 'เกาะเหมือง',
  'sunscar-desert': 'เกาะท่าเรือ',
};

let newsCounter = 0;

export function generateNewsFromTick(world: TradeWorldState): TradeNewsItem[] {
  const items: TradeNewsItem[] = [];
  const now = Date.now();

  for (const island of world.islands) {
    for (const [id, item] of Object.entries(island.commodities) as [LivingCommodityId, typeof island.commodities[LivingCommodityId]][]) {
      const ratio = item.currentPrice / item.basePrice;
      if (ratio >= 2) {
        items.push(makeNews(
          `${ISLAND_LABELS[island.id] ?? island.id} ขาด${COMMODITY_LABELS[id]} — ราคาสูงขึ้น ~${Math.round((ratio - 1) * 100)}%`,
          island.id,
          id,
          now,
        ));
      } else if (ratio <= 0.55 && item.stock > item.targetStock * 1.5) {
        items.push(makeNews(
          `${ISLAND_LABELS[island.id] ?? island.id} ล้น${COMMODITY_LABELS[id]} — ราคาต่ำกว่าปกติ`,
          island.id,
          id,
          now,
        ));
      }
    }
    if (island.pirateThreat > 0.45) {
      items.push(makeNews(
        `เส้นทางใกล้${ISLAND_LABELS[island.id] ?? island.id} มีโจรสลัดชุกชุม`,
        island.id,
        undefined,
        now,
      ));
    }
  }

  for (const route of world.routes) {
    if (route.pirateActivity > 0.55) {
      items.push(makeNews(
        `เรือสินค้าเสี่ยงถูกปล้นระหว่าง ${ISLAND_LABELS[route.sourceIslandId]} → ${ISLAND_LABELS[route.targetIslandId]}`,
        route.targetIslandId,
        undefined,
        now,
      ));
    }
  }

  return items.slice(0, 3);
}

function makeNews(
  message: string,
  islandId: string,
  commodityId: LivingCommodityId | undefined,
  now: number,
): TradeNewsItem {
  return {
    id: `news-${++newsCounter}`,
    message,
    islandId: islandId as TradeNewsItem['islandId'],
    commodityId,
    createdAt: now,
    ttlMs: 60_000,
  };
}

export function filterActiveNews(news: readonly TradeNewsItem[], now = Date.now()): TradeNewsItem[] {
  return news.filter((n) => now - n.createdAt < n.ttlMs);
}
