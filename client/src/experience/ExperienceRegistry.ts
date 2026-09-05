import type { ExpBoostProduct, ExpMilestone, ExpSourceDefinition } from './types';
import {
  EXP_BOOST_PRODUCTS,
  EXP_MILESTONES,
  EXP_MULTIPLIERS,
  EXP_SOURCES,
  EXP_STACKING_RULES,
  EXPERIENCE_SYSTEM_CONFIG,
  QUEST_EXP_RULES,
} from './databook';

export {
  EXP_BOOST_PRODUCTS,
  EXP_MILESTONES,
  EXP_MULTIPLIERS,
  EXP_SOURCES,
  EXP_STACKING_RULES,
  EXPERIENCE_SYSTEM_CONFIG,
  QUEST_EXP_RULES,
};

export function getExpSource(id: string): ExpSourceDefinition | undefined {
  return EXP_SOURCES.find((s) => s.id === id);
}

export function getExpBoostProduct(id: string): ExpBoostProduct | undefined {
  return EXP_BOOST_PRODUCTS.find((p) => p.id === id);
}

export function getExpMilestone(id: string): ExpMilestone | undefined {
  return EXP_MILESTONES.find((m) => m.id === id);
}

export function listExpSourcesByKind(
  kind: ExpSourceDefinition['kind'],
): ExpSourceDefinition[] {
  return EXP_SOURCES.filter((s) => s.kind === kind);
}

export * from './ExpFormulas';
