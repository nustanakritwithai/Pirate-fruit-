// S10: ชนิดข้อมูลนิยามเควสต์ย้ายไป shared (Server ใช้ตัดสินรางวัลจาก databook เดียวกัน)
export type {
  QuestDefinition,
  QuestObjective,
  QuestObjectiveType,
  QuestReward,
} from '@pirate-fruit/shared';
import type { QuestDefinition } from '@pirate-fruit/shared';

export interface ActiveQuest {
  definition: QuestDefinition;
  progress: number[];
  completed: boolean;
}

export interface QuestAcceptResult {
  accepted: boolean;
  reason?:
    | 'not-found'
    | 'level-too-low'
    | 'already-completed'
    | 'already-active'
    | 'replace-confirmation';
  requiredLevel?: number;
}

export interface QuestClaimResult {
  claimed: boolean;
  reason?: 'no-active-quest' | 'not-complete' | 'pending-server';
}
