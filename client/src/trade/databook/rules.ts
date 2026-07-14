import type { TradeRule } from '../types';

export const TRADE_RULES: readonly TradeRule[] = [
  {
    id: 'boat-required',
    rule: 'Inter-island trade requires docking at a harbor with a boat',
    ruleTh: 'เทรดข้ามเกาะต้องจอดท่าเรือและมีเรือ',
  },
  {
    id: 'cargo-limit',
    rule: 'Commodities are stored in boat cargo; capacity depends on boat type',
    ruleTh: 'สินค้าเก็บใน cargo เรือ ความจุขึ้นกับประเภทเรือ',
  },
  {
    id: 'export-cheap',
    rule: 'Buying export goods on their home island is cheapest',
    ruleTh: 'ซื้อของส่งออกที่เกาะต้นทางถูกที่สุด',
  },
  {
    id: 'import-profit',
    rule: 'Selling import-demand goods on destination island yields best profit',
    ruleTh: 'ขายของที่เกาะปลายทางต้องการนำเข้าได้กำไรดี',
  },
  {
    id: 'sell-fee',
    rule: 'A small fee applies when selling to vendors',
    ruleTh: 'ขายให้ร้านมีค่าธรรมเนียมเล็กน้อย',
  },
  {
    id: 'no-p2p-yet',
    rule: 'Player-to-player trading is planned for multiplayer phase',
    ruleTh: 'เทรดระหว่างผู้เล่นวางแผนไว้ใน Phase Multiplayer',
  },
] as const;
