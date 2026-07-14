import type { EconomyLogEntry, LivingCommodityId, TradeNewsItem } from './types';
import { LIVING_COMMODITY_META } from './ProductionRecipes';

export type EconomyEventPriority = 'silent' | 'low' | 'medium' | 'high' | 'critical';

export type EconomyEventKind =
  | 'production'
  | 'production_stopped'
  | 'shortage'
  | 'crisis'
  | 'price'
  | 'route'
  | 'quest'
  | 'ship'
  | 'spoil'
  | 'other';

export interface ClassifiedEconomyEvent {
  id: string;
  priority: EconomyEventPriority;
  kind: EconomyEventKind;
  /** คีย์รวม toast / alert ซ้ำ */
  mergeKey: string;
  /** ข้อความสั้นสำหรับ Toast (≤30 ตัวอักษร) */
  message: string;
  fullMessage: string;
  icon: string;
  commodityId?: LivingCommodityId;
  createdAt: number;
  /** จำนวนสำหรับรวม +2 +2 → +4 */
  quantity?: number;
  /** แสดงเป็น toast ชั่วคราว */
  toastEligible: boolean;
  /** นับใน ⚠️ alerts */
  isAlert: boolean;
}

export const MAX_TOAST_CHARS = 30;

export function truncateDisplay(text: string, max = MAX_TOAST_CHARS): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
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

function shortMaterialName(label: string): string {
  return label
    .replace(/เนื้อแข็ง/g, '')
    .replace(/แห้ง/g, '')
    .trim()
    .slice(0, 10);
}

/** ย่อข้อความหยุดผลิต เช่น "อู่เรือขาดไม้" */
function compactStopped(msg: string, cellId?: string): string {
  const missing = msg.match(/ขาด\s*(.+)$/)?.[1]?.trim() ?? '';
  const mat = shortMaterialName(missing);
  if (msg.includes('ชิ้นส่วนเรือ') || cellId === 'shipyard-island') {
    return truncateDisplay(`อู่เรือขาด${mat}`);
  }
  const site = msg.match(/การผลิต(.+?)หยุด/)?.[1]?.trim();
  if (site && mat) return truncateDisplay(`${site.slice(0, 6)}ขาด${mat}`);
  return truncateDisplay(`⚠️ ขาด${mat || 'วัตถุดิบ'}`);
}

function compactShortage(msg: string, commodityId?: LivingCommodityId): string {
  if (commodityId) {
    const label = LIVING_COMMODITY_META[commodityId].label;
    if (msg.includes('วิกฤต') || msg.includes('รุนแรง')) {
      return truncateDisplay(`${label.slice(0, 8)}วิกฤต`);
    }
    return truncateDisplay(`⚠️ ${label.slice(0, 10)}ขาดตลาด`);
  }
  return truncateDisplay(msg.replace(/^ตลาด/, '').trim());
}

function compactCrisis(msg: string, commodityId?: LivingCommodityId): string {
  if (commodityId) {
    const label = LIVING_COMMODITY_META[commodityId].label;
    return truncateDisplay(`🚨 ${label.slice(0, 10)}ล่มสลาย`);
  }
  return truncateDisplay(msg.replace(/^ตลาด/, '').trim());
}

function compactProduction(message: string, commodityId?: LivingCommodityId): { text: string; qty: number } | null {
  const match = message.match(/ผลิต(.+?)\s+(\d+)\s*หน่วย/);
  if (!match) return null;
  const name = commodityId ? LIVING_COMMODITY_META[commodityId].label : match[1].trim();
  const qty = Number(match[2]);
  const icon = commodityId ? commodityIcon(commodityId) : '📦';
  return { text: truncateDisplay(`${icon} ${name} +${qty}`), qty };
}

function compactPriceChange(msg: string, commodityId?: LivingCommodityId): string | null {
  const pct = msg.match(/(\d+)\s*%/);
  if (!pct) return null;
  const label = commodityId ? LIVING_COMMODITY_META[commodityId].label : 'สินค้า';
  const sign = msg.includes('ลด') || msg.includes('ลง') ? '' : '+';
  return truncateDisplay(`📈 ${label.slice(0, 8)} ${sign}${pct[1]}%`);
}

export function classifyLogEntry(entry: EconomyLogEntry, now = Date.now()): ClassifiedEconomyEvent {
  const msg = entry.message;
  const commodityId = entry.commodityId;
  const cellId = entry.cellId;

  if (msg.includes('ผลิต') && msg.includes('หน่วย')) {
    const compact = compactProduction(msg, commodityId);
    return {
      id: `log-${entry.tick}-${commodityId ?? 'prod'}`,
      priority: 'silent',
      kind: 'production',
      mergeKey: `prod:${commodityId ?? 'unknown'}`,
      message: compact?.text ?? truncateDisplay(msg),
      fullMessage: msg,
      icon: commodityId ? commodityIcon(commodityId) : '📦',
      commodityId,
      createdAt: now,
      quantity: compact?.qty,
      toastEligible: false,
      isAlert: false,
    };
  }

  if (msg.includes('เปลี่ยนผลิต')) {
    return {
      id: `log-${entry.tick}-switch`,
      priority: 'medium',
      kind: 'other',
      mergeKey: `switch:${commodityId ?? 'x'}`,
      message: truncateDisplay(msg),
      fullMessage: msg,
      icon: '🔧',
      commodityId,
      createdAt: now,
      toastEligible: true,
      isAlert: false,
    };
  }

  if (msg.includes('เปิดผลิต')) {
    return {
      id: `log-${entry.tick}-reopen`,
      priority: 'medium',
      kind: 'production_stopped',
      mergeKey: `reopen:${commodityId ?? cellId ?? 'f'}`,
      message: truncateDisplay(msg),
      fullMessage: msg,
      icon: '🏭',
      commodityId,
      createdAt: now,
      toastEligible: true,
      isAlert: false,
    };
  }

  if (msg.includes('ลดผลิต') || msg.includes('ขยายผลิต')) {
    return {
      id: `log-${entry.tick}-scale`,
      priority: 'silent',
      kind: 'other',
      mergeKey: `scale:${commodityId ?? 'x'}`,
      message: truncateDisplay(msg),
      fullMessage: msg,
      icon: '🏭',
      commodityId,
      createdAt: now,
      toastEligible: false,
      isAlert: false,
    };
  }

  if (msg.includes('หยุดผลิต') || msg.includes('หยุดชั่วคราว') || (msg.includes('หยุด') && msg.includes('ขาด'))) {
    const short = compactStopped(msg, cellId);
    return {
      id: `log-${entry.tick}-stop-${commodityId ?? cellId ?? 'x'}`,
      priority: 'high',
      kind: 'production_stopped',
      mergeKey: `stop:${cellId ?? commodityId ?? 'yard'}`,
      message: short,
      fullMessage: msg,
      icon: '⚠️',
      commodityId,
      createdAt: now,
      toastEligible: true,
      isAlert: true,
    };
  }

  if (msg.includes('ล่มสลาย')) {
    return {
      id: `log-${entry.tick}-crit`,
      priority: 'critical',
      kind: 'crisis',
      mergeKey: `crisis:${commodityId ?? 'market'}`,
      message: compactCrisis(msg, commodityId),
      fullMessage: msg,
      icon: '🚨',
      commodityId,
      createdAt: now,
      toastEligible: true,
      isAlert: true,
    };
  }

  if (msg.includes('วิกฤต')) {
    return {
      id: `log-${entry.tick}-crit2`,
      priority: 'critical',
      kind: 'crisis',
      mergeKey: `crisis:${commodityId ?? 'food'}`,
      message: compactShortage(msg, commodityId),
      fullMessage: msg,
      icon: '🚨',
      commodityId,
      createdAt: now,
      toastEligible: true,
      isAlert: true,
    };
  }

  if (msg.includes('ขาด')) {
    const isHigh = msg.includes('ต่อเนื่อง') || msg.includes('หยุด');
    return {
      id: `log-${entry.tick}-short`,
      priority: isHigh ? 'high' : 'medium',
      kind: 'shortage',
      mergeKey: `short:${commodityId ?? cellId ?? 'x'}`,
      message: compactShortage(msg, commodityId),
      fullMessage: msg,
      icon: '⚠️',
      commodityId,
      createdAt: now,
      toastEligible: true,
      isAlert: true,
    };
  }

  const priceMsg = compactPriceChange(msg, commodityId);
  if (priceMsg && msg.includes('%')) {
    const pct = Number(msg.match(/(\d+)\s*%/)?.[1] ?? 0);
    return {
      id: `log-${entry.tick}-price`,
      priority: pct >= 35 ? 'high' : 'medium',
      kind: 'price',
      mergeKey: `price:${commodityId ?? 'x'}`,
      message: priceMsg,
      fullMessage: msg,
      icon: '📈',
      commodityId,
      createdAt: now,
      toastEligible: pct >= 20,
      isAlert: pct >= 20,
    };
  }

  if (msg.includes('เส้นทางกำไรสูง')) {
    return {
      id: `log-${entry.tick}-trade-profit`,
      priority: 'medium',
      kind: 'route',
      mergeKey: `trade-profit:${commodityId ?? 'x'}`,
      message: truncateDisplay(msg.replace('เส้นทางกำไรสูง: ', '📦 กำไรสูง ')),
      fullMessage: msg,
      icon: '💰',
      commodityId,
      createdAt: now,
      toastEligible: true,
      isAlert: false,
    };
  }

  if (msg.includes('สร้างคำสั่งนำเข้า') || msg.includes('อัปเดตคำสั่งขนส่ง') || msg.includes('รับคำสั่งขนส่ง') || msg.includes('เรือโหลด')) {
    return {
      id: `log-${entry.tick}-trade-silent`,
      priority: 'silent',
      kind: 'route',
      mergeKey: `trade-silent:${commodityId ?? entry.tick}`,
      message: truncateDisplay(msg),
      fullMessage: msg,
      icon: '📋',
      commodityId,
      createdAt: now,
      toastEligible: false,
      isAlert: false,
    };
  }

  if (msg.includes('ส่งมอบ') && msg.includes('หน่วยถึง')) {
    const isUrgent = commodityId === 'rope' || commodityId === 'sailcloth' || commodityId === 'fresh-fish';
    return {
      id: `log-${entry.tick}-deliver`,
      priority: isUrgent ? 'medium' : 'low',
      kind: 'ship',
      mergeKey: `deliver:${commodityId ?? 'x'}`,
      message: truncateDisplay(`🚢 ส่ง${commodityId ? LIVING_COMMODITY_META[commodityId].label.slice(0, 6) : 'สินค้า'}ถึง`),
      fullMessage: msg,
      icon: '🚢',
      commodityId,
      createdAt: now,
      toastEligible: isUrgent,
      isAlert: false,
    };
  }

  if (msg.includes('เรือขนส่ง') && msg.includes('ถูกทำลาย')) {
    return {
      id: `log-${entry.tick}-ship-lost`,
      priority: 'high',
      kind: 'ship',
      mergeKey: `ship-lost:${commodityId ?? 'x'}`,
      message: truncateDisplay('🚨 เรือค้าถูกโจมตี'),
      fullMessage: msg,
      icon: '🚨',
      commodityId,
      createdAt: now,
      toastEligible: true,
      isAlert: true,
    };
  }

  if (msg.includes('ไม่มีพ่อค้ารับส่ง')) {
    return {
      id: `log-${entry.tick}-no-trader`,
      priority: 'critical',
      kind: 'shortage',
      mergeKey: `no-trader:${cellId ?? commodityId ?? 'x'}`,
      message: truncateDisplay(msg.replace('🚨 ', '')),
      fullMessage: msg,
      icon: '🚨',
      commodityId,
      createdAt: now,
      toastEligible: true,
      isAlert: true,
    };
  }

  if (msg.includes('เรือสินค้า')) {
    return {
      id: `log-${entry.tick}-ship`,
      priority: 'low',
      kind: 'ship',
      mergeKey: 'ship:depart',
      message: truncateDisplay('🚢 เรือสินค้าออก'),
      fullMessage: msg,
      icon: '🚢',
      createdAt: now,
      toastEligible: false,
      isAlert: false,
    };
  }

  if (msg.includes('เน่าเสีย') || (msg.includes('เสีย') && msg.includes('ขนส่ง'))) {
    return {
      id: `log-${entry.tick}-spoil`,
      priority: 'low',
      kind: 'spoil',
      mergeKey: `spoil:${commodityId ?? 'x'}`,
      message: truncateDisplay(msg),
      fullMessage: msg,
      icon: '💨',
      commodityId,
      createdAt: now,
      toastEligible: false,
      isAlert: false,
    };
  }

  return {
    id: `log-${entry.tick}-misc`,
    priority: 'silent',
    kind: 'other',
    mergeKey: `misc:${entry.tick}`,
    message: truncateDisplay(msg),
    fullMessage: msg,
    icon: '📋',
    commodityId,
    createdAt: now,
    toastEligible: false,
    isAlert: false,
  };
}

export function classifyNewsItem(item: TradeNewsItem, now = Date.now()): ClassifiedEconomyEvent {
  const priority = item.priority ?? inferNewsPriority(item.message);
  const icon = item.commodityId ? commodityIcon(item.commodityId) : '📰';
  const kind = inferNewsKind(item.message);
  let message = item.message;

  if (kind === 'crisis' || item.message.includes('ล่มสลาย')) {
    message = compactCrisis(item.message, item.commodityId);
  } else if (kind === 'shortage' || item.message.includes('ขาด')) {
    message = compactShortage(item.message, item.commodityId);
  } else if (item.message.includes('ล้นตลาด')) {
    message = truncateDisplay(`📦 ${item.commodityId ? LIVING_COMMODITY_META[item.commodityId].label.slice(0, 8) : ''}ล้น`);
  } else {
    message = truncateDisplay(
      item.message.replace(/^ตลาด/, '').replace(/ที่เกาะ\S+/g, '').trim(),
    );
  }

  const toastEligible =
    priority !== 'silent'
    && priority !== 'low'
    && (kind === 'shortage' || kind === 'crisis' || kind === 'production_stopped' || kind === 'price');

  return {
    id: item.id,
    priority,
    kind,
    mergeKey: `${kind}:${item.commodityId ?? item.cellId ?? item.id}`,
    message,
    fullMessage: item.message,
    icon,
    commodityId: item.commodityId,
    createdAt: item.createdAt || now,
    toastEligible,
    isAlert: toastEligible || priority === 'high' || priority === 'critical',
  };
}

function inferNewsKind(message: string): EconomyEventKind {
  if (message.includes('ล่มสลาย')) return 'crisis';
  if (message.includes('หยุด')) return 'production_stopped';
  if (message.includes('ขาด')) return 'shortage';
  if (message.includes('ราคา') || message.includes('%')) return 'price';
  return 'other';
}

function inferNewsPriority(message: string): EconomyEventPriority {
  if (message.includes('ล่มสลาย') || (message.includes('วิกฤต') && message.includes('ขาด'))) {
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
    kind: 'production',
    mergeKey: 'batch:prod',
    message: truncateDisplay(lines, 80),
    fullMessage: silent.map((e) => e.fullMessage).join('\n'),
    icon: '📋',
    createdAt: silent[0].createdAt,
    toastEligible: false,
    isAlert: false,
  };
}

const MERGE_WINDOW_MS = 5000;

/** รวม toast ชนิดเดียวกันภายใน 5 วินาที (เช่น ปลาแห้ง +2 +2 → +4) */
export function mergeToastEvents(
  queue: ClassifiedEconomyEvent[],
  incoming: ClassifiedEconomyEvent,
  now = Date.now(),
): ClassifiedEconomyEvent[] {
  if (!incoming.toastEligible) return queue;

  const last = queue[queue.length - 1];
  if (
    last
    && last.mergeKey === incoming.mergeKey
    && now - last.createdAt < MERGE_WINDOW_MS
    && incoming.kind === 'production'
    && last.kind === 'production'
    && incoming.quantity != null
  ) {
    const total = (last.quantity ?? 0) + incoming.quantity;
    const name = incoming.commodityId
      ? LIVING_COMMODITY_META[incoming.commodityId].label
      : incoming.message;
    const icon = incoming.icon;
    const merged: ClassifiedEconomyEvent = {
      ...last,
      quantity: total,
      message: truncateDisplay(`${icon} ${name.split(' ')[0]} +${total}`),
      createdAt: now,
    };
    return [...queue.slice(0, -1), merged];
  }

  if (
    last
    && last.mergeKey === incoming.mergeKey
    && now - last.createdAt < MERGE_WINDOW_MS
    && incoming.kind !== 'production'
  ) {
    return queue;
  }

  return [...queue, incoming];
}

export function formatToastLine(event: ClassifiedEconomyEvent): string {
  const msg = event.message.trim();
  if (msg.startsWith(event.icon)) return msg;
  return `${event.icon} ${msg}`;
}
