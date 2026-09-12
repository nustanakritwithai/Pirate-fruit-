import type { LoadoutCategory } from '../combat/CombatData';
import type { SkillRenderType } from '../combat/SkillCasting';

export type SkillExperiencePhase =
  | 'input'
  | 'anticipation'
  | 'charge'
  | 'release'
  | 'travel'
  | 'impact'
  | 'aftermath'
  | 'recovery';

export type SkillExperienceAuthority = 'predicted' | 'confirmed';

export type SkillExperienceChannel =
  | 'animation'
  | 'vfx'
  | 'audio'
  | 'camera'
  | 'haptic'
  | 'reaction'
  | 'environment'
  | 'telegraph';

export type SkillExperienceComponentTier = 'essential' | 'enhancement' | 'luxury';
export type SkillPowerTier = 1 | 2 | 3 | 4 | 5;

export type SkillMotionGrammar =
  | 'physical'
  | 'blade'
  | 'ballistic'
  | 'energy'
  | 'utility';

export interface SkillExperiencePhaseWindow {
  phase: SkillExperiencePhase;
  startMs: number;
  durationMs: number;
}

export interface SkillImpactEnvelope {
  /** เวลาก่อน collision ที่ presentation เริ่มเร่งความรู้สึก */
  preImpactMs: number;
  /** ช่วง peak หลัง collision สำหรับ flash/spark/camera/audio transient */
  peakImpactMs: number;
  /** ช่วง follow-through/reaction หลัง peak */
  postImpactMs: number;
  /** visual-only/local hit stop; ห้าม freeze server simulation */
  hitStopMs: number;
}

export interface SkillExperienceRecipe {
  skillId: string;
  renderType: SkillRenderType;
  category: LoadoutCategory;
  powerTier: SkillPowerTier;
  motionGrammar: SkillMotionGrammar;
  phases: SkillExperiencePhaseWindow[];
  impact: SkillImpactEnvelope;
}

export type SkillExperienceSignalKind =
  | 'phase-enter'
  | 'server-confirmed'
  | 'impact'
  | 'cancel'
  | 'complete';

export interface SkillExperienceSignal {
  sessionId: string;
  skillId: string;
  kind: SkillExperienceSignalKind;
  authority: SkillExperienceAuthority;
  phase: SkillExperiencePhase;
  atMs: number;
  channels: readonly SkillExperienceChannel[];
  componentTier: SkillExperienceComponentTier;
  powerTier: SkillPowerTier;
  reason?: string;
}

export interface SkillExperienceSessionSnapshot {
  id: string;
  skillId: string;
  authority: SkillExperienceAuthority;
  phase: SkillExperiencePhase;
  startedAtMs: number;
  lastUpdatedAtMs: number;
  cancelled: boolean;
  completed: boolean;
  confirmedAtMs?: number;
}
