export type AudioBus = 'music' | 'ambience' | 'sfx' | 'ui';

export type AudioCueId =
  | 'ui.click' | 'ui.confirm' | 'ui.reject' | 'ui.notification' | 'ui.quest-update'
  | 'player.step' | 'player.jump' | 'player.land' | 'player.dash' | 'player.swim'
  | 'player.drowning' | 'player.death' | 'player.respawn'
  | 'combat.m1-swing' | 'combat.skill-cast' | 'combat.projectile' | 'combat.hit'
  | 'combat.block' | 'combat.guard-break' | 'combat.stun'
  | 'monster.aggro' | 'monster.attack' | 'monster.hit' | 'monster.death' | 'monster.respawn'
  | 'boat.board' | 'boat.disembark' | 'boat.throttle' | 'boat.anchor' | 'boat.cannon'
  | 'boat.hit' | 'boat.sinking'
  | 'reward.coins' | 'reward.item-pickup' | 'reward.exp' | 'reward.level-up'
  | 'reward.quest-complete' | 'world.wind' | 'world.waves' | 'world.dock';

export interface AudioPosition {
  x: number;
  y: number;
  z: number;
}

export interface AudioSettings {
  master: number;
  music: number;
  ambience: number;
  sfx: number;
  ui: number;
  muted: boolean;
}

export interface AudioPlayOptions {
  eventId?: string;
  position?: AudioPosition;
  priority?: number;
}

export interface ProceduralRecipe {
  waveform: OscillatorType;
  frequency: number;
  endFrequency?: number;
  duration: number;
  gain: number;
  attack?: number;
  detune?: number;
  delay?: number;
  noise?: boolean;
  filterFrequency?: number;
  filterType?: BiquadFilterType;
}

export interface AudioCueDefinition {
  id: AudioCueId;
  bus: Exclude<AudioBus, 'music'>;
  priority: number;
  cooldownMs: number;
  maxInstances: number;
  spatial: boolean;
  maxDistance?: number;
  rolloff?: number;
  interestRange?: number;
  mobileInterestRange?: number;
  recipe: ProceduralRecipe | readonly ProceduralRecipe[];
}

export type MusicState = 'death' | 'boss' | 'combat' | 'sailing' | 'island' | 'silence';

export interface MusicObservation {
  dead: boolean;
  boss: boolean;
  combat: boolean;
  onBoat: boolean;
  onFoot: boolean;
  loading: boolean;
}

export interface MusicTrack {
  id: 'sailing-a' | 'sailing-b' | 'island';
  /** Original procedural composition. Notes are scale degrees; null means a rest. */
  rootFrequency: number;
  scale: readonly number[];
  bpm: number;
  stepsPerBeat: number;
  beatsPerBar: number;
  bass: readonly (number | null)[];
  melody: readonly (number | null)[];
  chords: readonly (number | null)[];
  percussion: readonly ('kick' | 'deck' | 'bell' | null)[];
  melodyWaveform: OscillatorType;
  bars: number;
  loop: boolean;
}

export type AudioRuntimeStatus = 'disabled' | 'locked' | 'running' | 'suspended' | 'failed';
