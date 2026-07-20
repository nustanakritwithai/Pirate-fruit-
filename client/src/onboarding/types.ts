export type OnboardingSignal =
  | 'monster-killed'
  | 'quest-accepted'
  | 'quest-completed'
  | 'trade-completed';

export interface OnboardingTarget {
  islandId: string;
  x: number;
  z: number;
  label: string;
}

export interface OnboardingSnapshot {
  x: number;
  y: number;
  z: number;
  groundY: number;
  cameraYaw: number;
  dashCooldownFraction: number;
  islandId: string;
  activeQuest: boolean;
  boatActive: boolean;
  boatRiderState: 'off' | 'deck' | 'helm';
  boatX: number | null;
  boatZ: number | null;
}

export type OnboardingCompletion =
  | { type: 'manual' }
  | { type: 'move'; distance: number }
  | { type: 'look'; radians: number }
  | { type: 'airborne'; height: number }
  | { type: 'dash' }
  | { type: 'visible'; selector: string }
  | { type: 'quest-active' }
  | { type: 'signal'; signal: OnboardingSignal }
  | { type: 'boat-active' }
  | { type: 'boat-rider'; state: 'deck' | 'helm' }
  | { type: 'boat-move'; distance: number };

export interface OnboardingStep {
  id: string;
  title: string;
  body: string;
  hint: string;
  target?: OnboardingTarget;
  highlightSelector?: string;
  completion: OnboardingCompletion;
}

export interface GuideTopic {
  id: string;
  icon: string;
  title: string;
  summary: string;
  tips: readonly string[];
}

export interface OnboardingSave {
  version: 1;
  stepIndex: number;
  completed: boolean;
  skipped: boolean;
}
