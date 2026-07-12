import type { ActiveQuest, QuestDefinition } from './QuestData';

export function createActiveQuest(definition: QuestDefinition, savedProgress: number[] = []): ActiveQuest {
  const progress = definition.objectives.map((objective, index) =>
    Math.min(objective.requiredAmount, Math.max(0, Math.floor(savedProgress[index] ?? 0))),
  );
  return { definition, progress, completed: isQuestComplete(definition, progress) };
}

export function isQuestComplete(definition: QuestDefinition, progress: number[]): boolean {
  return definition.objectives.every(
    (objective, index) => (progress[index] ?? 0) >= objective.requiredAmount,
  );
}
