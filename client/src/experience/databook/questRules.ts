import type { QuestExpRule } from '../types';

/** กฎ EXP จากเควส */
export const QUEST_EXP_RULES: readonly QuestExpRule[] = [
  {
    id: 'one-level-typical',
    rule: 'Quests usually give enough EXP to level up once',
    ruleTh: 'เควสมักให้ EXP พอเลเวลอัป 1 ครั้ง',
  },
  {
    id: 'enemy-count',
    rule: 'Most quests require defeating 5-9 enemies (usually 8) or one boss',
    ruleTh: 'เควสส่วนใหญ่ต้องฆ่า 5-9 ศัตรู (ปกติ 8) หรือบอส 1 ตัว',
  },
  {
    id: 'min-level',
    rule: 'Quests have a minimum player level requirement',
    ruleTh: 'เควสมีเลเวลขั้นต่ำที่รับได้',
  },
  {
    id: 'scales-with-level',
    rule: 'Higher-level quests award more experience',
    ruleTh: 'เควสเลเวลสูงให้ EXP มากขึ้น',
  },
] as const;
