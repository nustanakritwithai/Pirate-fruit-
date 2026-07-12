export type QuestAcceptedEvent = { questId: string; name: string };
export type QuestProgressEvent = {
  questId: string;
  objectiveIndex: number;
  current: number;
  required: number;
};
export type QuestCompletedEvent = {
  questId: string;
  name: string;
  playerExp: number;
  coins: number;
  masteryBonus: number;
};
