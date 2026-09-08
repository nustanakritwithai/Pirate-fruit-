import type { MasterySourceDefinition } from '../types';

export const MASTERY_SOURCES: readonly MasterySourceDefinition[] = [
  {
    id: 'enemies',
    name: 'Enemies',
    nameTh: 'ศัตรู',
    kind: 'enemy',
    description: 'Primary mastery source — grinding enemies is most effective',
    notes: 'Server hopping bosses is slower than enemy grinding',
  },
  {
    id: 'bosses',
    name: 'Bosses',
    nameTh: 'บอส',
    kind: 'boss',
    description: 'Large mastery reward on defeat',
    notes: 'Cake Queen drops the most mastery (~2.2M without 2x)',
  },
  {
    id: 'raid-bosses',
    name: 'Raid Bosses',
    nameTh: 'Raid Boss',
    kind: 'raid-boss',
    description: 'Some raid bosses drop large mastery amounts',
    notes: 'Not all raid bosses drop mastery',
  },
] as const;
