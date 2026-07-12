import type { QuestDefinition } from './QuestData';

export const QUEST_DEFINITIONS: readonly QuestDefinition[] = [
  {
    id: 'starter-crabs',
    name: 'กวาดล้างปูทะเล',
    description: 'กำจัดปูทะเลดุ 5 ตัวรอบชายหาดฝึกฝน',
    minimumLevel: 1,
    repeatable: true,
    objectives: [{ type: 'kill', targetId: 'crab', requiredAmount: 5 }],
    rewards: { playerExp: 120, coins: 60, masteryBonus: 15 },
  },
  {
    id: 'starter-pirates',
    name: 'โจรสลัดเร่ร่อน',
    description: 'หยุดโจรสลัดเร่ร่อน 5 คนที่คุกคามหมู่บ้าน',
    minimumLevel: 3,
    repeatable: true,
    objectives: [{ type: 'kill', targetId: 'grunt', requiredAmount: 5 }],
    rewards: { playerExp: 240, coins: 120, masteryBonus: 25 },
  },
  {
    id: 'east-hill-captain',
    name: 'กัปตันแห่งเนินตะวันออก',
    description: 'โค่นกัปตันหนวดดำที่เนินฝั่งตะวันออก',
    minimumLevel: 7,
    repeatable: true,
    objectives: [{ type: 'boss', targetId: 'boss', requiredAmount: 1 }],
    rewards: { playerExp: 600, coins: 350, masteryBonus: 80 },
  },
];

export const QUESTS_BY_ID = new Map(QUEST_DEFINITIONS.map((quest) => [quest.id, quest]));
