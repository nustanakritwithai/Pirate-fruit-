import type { EconomyLogEntry, LivingCommodityId, TradeNewsItem } from './types';
import { LIVING_COMMODITY_META } from './ProductionRecipes';

export type EconomyEventPriority = 'silent' | 'low' | 'medium' | 'high' | 'critical';

export interface ClassifiedEconomyEvent {
  id: string;
  priority: EconomyEventPriority;
  /** ข้อความสั้นสำหรับ Toast / chip */
  message: string;
  fullMessage: string;
  icon: string;
  commodityId?: LivingCommodityId;
  createdAt: number;
}

const MAX_DISPLAY_CHARS = 45;

export function truncateDisplay(text: string, max = MAX_DISPLAY_CHARS): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

/** แปลง log การผลิตเป็นข้อความสั้น เช่น "🐟 ปลาแห้ง +2" */
function compactProduction(message: string, commodityId?: LivingCommodityId): string | null {
  const match = message.match(/ผลิต(.+?)\s+(\d+)\s*หน่วย/);
  if (!match) return null;
  const name = commodityId ? LIVING_COMMODITY_META[commodityId].label : match[1].trim();
  const icon = commodityId ? commodityIcon(commodityId) : '📦';
  return `${icon} ${name} +${match[2]}`;
}

function commodityIcon(id: LivingCommodityId): string {
  const icons: Partial<Record<LivingCommodityId, string>> = {
    'fresh-fish': '🐟',
    'dried-fish': '🐠',
    hardwood: '🪵',
    'iron-ore': '⛏️',
    'iron-ingot': '🔩',
    tools: '🔧',
    'sun-silk': '🧣',
    rope: '🪢',
    'luxury-cloth': '👘',
    'healing-herb': '🌿',
    'herbal-medicine': '💊',
    sailcloth: '⚓',
    'repair-kit': '🛠️',
    'trade-crate': '📦',
  };
  return icons[id] ?? '📦';
}

export function classifyLogEntry(entry: EconomyLogEntry, now = Date.now()): ClassifiedEconomyEvent {
  const msg = entry.message;

  if (msg.includes('ผลิต') && msg.includes('หน่วย')) {
    const compact = compactProduction(msg, entry.commodityId);
    return {
      id: `log-${entry.tick}-${entry.commodityId ?? 'prod'}`,
      priority: 'silent',
      message: compact ?? truncateDisplay(msg),
      fullMessage: msg,
      icon: entry.commodityId ? commodityIcon(entry.commodityId) : '📦',
      commodityId: entry.commodityId,
      createdAt: now,
    };
  }

  if (msg.includes('ล่มสลาย') || msg.includes('วิกฤต')) {
    return {
      id: `log-${entry.tick}-crit`,
      priority: 'critical',
      message: truncateDisplay(msg.replace(/^ตลาด/, '').trim()),
      fullMessage: msg,
      icon: '🚨',
      commodityId: entry.commodityId,
      createdAt: now,
    };
  }

  if (msg.includes('ขาด') && msg.includes('หยุด')) {
    return {
      id: `log-${entry.tick}-short`,
      priority: 'high',
      message: truncateDisplay(msg),
      fullMessage: msg,
      icon: '⚠️',
      commodityId: entry.commodityId,
      createdAt: now,
    };
  }

  if (msg.includes('ขาด') || msg.includes('วิกฤต')) {
    return {
      id: `log-${entry.tick}-need`,
      priority: 'medium',
      message: truncateDisplay(msg),
      fullMessage: msg,
      icon: '📉',
      commodityId: entry.commodityId,
      createdAt: now,
    };
  }

  if (msg.includes('เรือสินค้า')) {
    return {
      id: `log-${entry.tick}-ship`,
      priority: 'low',
      message: truncateDisplay('🚢 เรือสินค้าออกเดินทาง'),
      fullMessage: msg,
      icon: '🚢',
      createdAt: now,
    };
  }

  if (msg.includes('เน่าเสีย') || msg.includes('เสีย') && msg.includes('ขนส่ง')) {
    return {
      id: `log-${entry.tick}-spoil`,
      priority: 'low',
      message: truncateDisplay(msg),
      fullMessage: msg,
      icon: '💨',
      commodityId: entry.commodityId,
      createdAt: now,
    };
  }

  return {
    id: `log-${entry.tick}-misc`,
    priority: 'silent',
    message: truncateDisplay(msg),
    fullMessage: msg,
    icon: '📋',
    commodityId: entry.commodityId,
    createdAt: now,
  };
}

export function classifyNewsItem(item: TradeNewsItem, now = Date.now()): ClassifiedEconomyEvent {
  const priority = item.priority ?? inferNewsPriority(item.message);
  const icon = item.commodityId ? commodityIcon(item.commodityId) : '📰';
  let message = item.message
    .replace(/^ตลาด/, '')
    .replace(/ที่เกาะ\S+/g, '')
    .trim();

  if (item.commodityId && message.includes('ขาด')) {
    message = `${icon} ${LIVING_COMMODITY_META[item.commodityId].label} ขาด`;
  }

  return {
    id: item.id,
    priority,
    message: truncateDisplay(message),
    fullMessage: item.message,
    icon,
    commodityId: item.commodityId,
    createdAt: item.createdAt || now,
  };
}

function inferNewsPriority(message: string): EconomyEventPriority {
  if (message.includes('ล่มสลาย') || message.includes('วิกฤต') && message.includes('ขาด')) {
    return 'critical';
  }
  if (message.includes('ขาด') && message.includes('ต่อเนื่อง')) return 'high';
  if (message.includes('ล้นตลาด')) return 'low';
  if (message.includes('ขาด')) return 'medium';
  return 'low';
}

/** รวมเหตุการณ์ silent ที่เกิดพร้อมกันเป็นบรรทัดเดียวสำหรับ log */
export function batchSilentEvents(events: ClassifiedEconomyEvent[]): ClassifiedEconomyEvent | null {
  const silent = events.filter((e) => e.priority === 'silent' && e.message.includes('+'));
  if (silent.length < 2) return null;
  const lines = silent.map((e) => e.message).join(' · ');
  return {
    id: `batch-${silent[0].createdAt}`,
    priority: 'silent',
    message: truncateDisplay(lines, 80),
    fullMessage: silent.map((e) => e.fullMessage).join('\n'),
    icon: '📋',
    createdAt: silent[0].createdAt,
  };
}
