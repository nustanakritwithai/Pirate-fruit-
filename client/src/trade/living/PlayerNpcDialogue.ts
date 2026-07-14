import type { PlayerEconomicTitle } from './PlayerEconomyTypes';

export const PLAYER_NPC_DIALOGUE: Record<PlayerEconomicTitle, string> = {
  unknown: 'สนใจซื้อขายอะไรไหม?',
  'local-trader': 'ยินดีต้อนรับ พ่อค้าท้องถิ่น',
  'trusted-merchant': 'ยินดีต้อนรับ พ่อค้าที่ไว้ใจได้',
  'island-supplier': 'สินค้าของคุณช่วยเกาะเราไว้หลายครั้ง',
  'trade-partner': 'คู่ค้าของเรา — มีอะไรให้ช่วยไหม?',
  'market-manipulator': 'รอบนี้อย่ากว้านซื้อจนตลาดพังอีกล่ะ',
  profiteer: 'อย่าเอาเปรียบตลาดมากเกินไปนะ',
  'economic-savior': 'ทุกคนจำได้ว่าคุณเคยช่วยเราตอนวิกฤต',
};

export function getPlayerNpcDialogue(title: PlayerEconomicTitle): string {
  return PLAYER_NPC_DIALOGUE[title] ?? PLAYER_NPC_DIALOGUE.unknown;
}
