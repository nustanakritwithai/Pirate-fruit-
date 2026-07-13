import type { StatRefundSource } from '../types';

/** วิธีรีเซ็ตสเตตัส (Stat Refund) จาก Blox Fruits Wiki */
export const STAT_REFUND_SOURCES: readonly StatRefundSource[] = [
  {
    id: 'code',
    name: 'Promo Codes',
    nameTh: 'โค้ดโปรโมชัน',
    cost: 'Free',
    description: 'บางโค้ดให้ Stat Refund',
  },
  {
    id: 'plokster',
    name: 'Plokster',
    nameTh: 'พ่อค้า Plokster',
    cost: '2,500 Fragments',
    description: 'ซื้อ Stat Refund จาก NPC Plokster',
  },
  {
    id: 'death-king',
    name: 'Death King',
    nameTh: 'ราชาแห่งความตาย',
    cost: '150 Bones',
    description: 'ซื้อช่วง Ghost Event',
  },
  {
    id: 'magic-elf',
    name: 'Magic Elf',
    nameTh: 'เอลฟ์เวทมนตร์',
    cost: '75 Candy',
    description: 'ซื้อช่วง Christmas Event',
  },
  {
    id: 'robux',
    name: 'Robux Shop',
    nameTh: 'ร้าน Robux',
    cost: '75 Robux',
    description: 'ซื้อ Stat Refund จากร้านค้า',
  },
  {
    id: 'trading',
    name: 'Trading',
    nameTh: 'เทรด',
    cost: 'Varies',
    description: 'เทรดกับผู้เล่นอื่น',
  },
] as const;
