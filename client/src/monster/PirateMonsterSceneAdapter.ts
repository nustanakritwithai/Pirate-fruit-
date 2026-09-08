/**
 * Scene-local control adapter for the Pirate scene.
 *
 * This owns only presentation/input state. Throw and skill callbacks carry the
 * monster instance id and aim to the existing central transport; no HP,
 * position, damage, AI, or offline authority is created here.
 */

export type PirateMonsterPanel =
  | { kind: 'character' }
  | { kind: 'monster'; instanceId: string };

export type PirateMonsterAvailability = 'unthrown' | 'pending' | 'active' | 'unavailable';

export interface PirateMonsterAim {
  forwardX: number;
  forwardZ: number;
  range: number;
  area?: number;
}

export interface PirateMonsterSkill {
  skillId: string;
  label?: string;
  cooldownRemaining?: number;
  disabledReason?: string;
}

export interface PirateMonsterRosterEntry {
  instanceId: string;
  monsterType: string;
  availability: PirateMonsterAvailability;
  skills: readonly PirateMonsterSkill[];
}

export interface PirateMonsterThrowRequest {
  instanceId: string;
  aim: PirateMonsterAim;
}

export interface PirateMonsterSkillRequest extends PirateMonsterThrowRequest {
  skillId: string;
}

export type PirateMonsterSceneAction = 'throwQueued' | 'panelOpened' | 'panelClosed' | 'ignored';

export interface PirateMonsterSceneAdapterOptions {
  onThrow?: (request: PirateMonsterThrowRequest) => boolean;
  onSkill?: (request: PirateMonsterSkillRequest) => boolean;
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 120;
}

function validAim(aim: PirateMonsterAim): boolean {
  return Number.isFinite(aim.forwardX) && Number.isFinite(aim.forwardZ)
    && Number.isFinite(aim.range) && aim.range >= 0 && aim.range <= 10_000
    && (aim.area === undefined || (Number.isFinite(aim.area) && aim.area >= 0 && aim.area <= 10_000));
}

/** One owner for Pirate scene input; safe to construct without Pocket scene/DOM. */
export class PirateMonsterSceneAdapter {
  private roster = new Map<string, PirateMonsterRosterEntry>();
  private currentPanel: PirateMonsterPanel = { kind: 'character' };
  private disposed = false;

  constructor(private readonly options: PirateMonsterSceneAdapterOptions = {}) {}

  get panel(): PirateMonsterPanel { return { ...this.currentPanel }; }

  setRoster(entries: readonly PirateMonsterRosterEntry[]): void {
    if (this.disposed) return;
    const next = new Map<string, PirateMonsterRosterEntry>();
    for (const entry of entries) {
      if (!validId(entry.instanceId) || !validId(entry.monsterType)) continue;
      next.set(entry.instanceId, { ...entry, skills: entry.skills.map((skill) => ({ ...skill })) });
    }
    this.roster = next;
    if (this.currentPanel.kind === 'monster' && this.roster.get(this.currentPanel.instanceId)?.availability !== 'active') {
      this.currentPanel = { kind: 'character' };
    }
  }

  getRoster(): PirateMonsterRosterEntry[] {
    return [...this.roster.values()].map((entry) => ({ ...entry, skills: entry.skills.map((skill) => ({ ...skill })) }));
  }

  handleMonsterButton(instanceId: string, aim: PirateMonsterAim): PirateMonsterSceneAction {
    if (this.disposed || !validId(instanceId) || !validAim(aim)) return 'ignored';
    const entry = this.roster.get(instanceId);
    if (!entry || entry.availability === 'unavailable') return 'ignored';
    if (entry.availability === 'unthrown') {
      if (!this.options.onThrow?.({ instanceId, aim: { ...aim } })) return 'ignored';
      this.roster.set(instanceId, { ...entry, availability: 'pending' });
      return 'throwQueued';
    }
    if (entry.availability === 'pending') return 'ignored';
    if (this.currentPanel.kind === 'monster' && this.currentPanel.instanceId === instanceId) {
      this.currentPanel = { kind: 'character' };
      return 'panelClosed';
    }
    this.currentPanel = { kind: 'monster', instanceId };
    return 'panelOpened';
  }

  confirmThrow(instanceId: string): boolean {
    const entry = this.roster.get(instanceId);
    if (this.disposed || !entry || entry.availability !== 'pending') return false;
    this.roster.set(instanceId, { ...entry, availability: 'active' });
    return true;
  }

  rejectThrow(instanceId: string): boolean {
    const entry = this.roster.get(instanceId);
    if (this.disposed || !entry || entry.availability !== 'pending') return false;
    this.roster.set(instanceId, { ...entry, availability: 'unthrown' });
    return true;
  }

  handleSkill(skillId: string, aim: PirateMonsterAim): boolean {
    if (this.disposed || this.currentPanel.kind !== 'monster' || !validId(skillId) || !validAim(aim)) return false;
    const instanceId = this.currentPanel.instanceId;
    const entry = this.roster.get(instanceId);
    const skill = entry?.skills.find((candidate) => candidate.skillId === skillId);
    if (!entry || entry.availability !== 'active' || !skill || skill.disabledReason || (skill.cooldownRemaining ?? 0) > 0) return false;
    return this.options.onSkill?.({ instanceId, skillId, aim: { ...aim } }) ?? false;
  }

  dispose(): void {
    this.disposed = true;
    this.roster.clear();
    this.currentPanel = { kind: 'character' };
  }
}

