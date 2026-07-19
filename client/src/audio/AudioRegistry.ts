import type { AudioCueDefinition, AudioCueId, ProceduralRecipe } from './types';

const recipe = (
  frequency: number,
  duration: number,
  gain = 0.16,
  waveform: OscillatorType = 'sine',
  endFrequency?: number,
): ProceduralRecipe => ({ frequency, duration, gain, waveform, endFrequency, attack: 0.008 });

type CueSeed = Omit<AudioCueDefinition, 'id' | 'maxInstances' | 'cooldownMs'>
  & Partial<Pick<AudioCueDefinition, 'maxInstances' | 'cooldownMs'>>;

const ui = (r: ProceduralRecipe, priority = 55): CueSeed => ({
  bus: 'ui', priority, spatial: false, recipe: r, cooldownMs: 35, maxInstances: 3,
});
const sfx = (r: ProceduralRecipe, priority = 50, spatial = false): CueSeed => ({
  bus: 'sfx', priority, spatial, recipe: r, cooldownMs: 55, maxInstances: 4,
  ...(spatial ? { maxDistance: 42, rolloff: 1.35, interestRange: 52, mobileInterestRange: 30 } : {}),
});
const ambience = (r: ProceduralRecipe): CueSeed => ({
  bus: 'ambience', priority: 15, spatial: true, recipe: r, cooldownMs: 850, maxInstances: 2,
  maxDistance: 55, rolloff: 1.1, interestRange: 65, mobileInterestRange: 34,
});

const seeds: Record<AudioCueId, CueSeed> = {
  'ui.click': ui(recipe(520, 0.045, 0.08, 'sine', 620)),
  'ui.confirm': ui(recipe(620, 0.11, 0.12, 'triangle', 880), 65),
  'ui.reject': ui(recipe(210, 0.14, 0.13, 'square', 140), 68),
  'ui.notification': ui(recipe(760, 0.18, 0.1, 'sine', 1060), 58),
  'ui.quest-update': ui(recipe(680, 0.22, 0.11, 'triangle', 980), 62),
  'player.step': sfx(recipe(105, 0.055, 0.055, 'triangle', 72), 18),
  'player.jump': sfx(recipe(260, 0.13, 0.11, 'sine', 520), 38),
  'player.land': sfx(recipe(135, 0.1, 0.12, 'triangle', 70), 42),
  'player.dash': sfx(recipe(360, 0.16, 0.14, 'sawtooth', 120), 55),
  'player.swim': sfx(recipe(145, 0.2, 0.07, 'sine', 95), 25),
  'player.drowning': sfx(recipe(170, 0.3, 0.12, 'square', 70), 80),
  'player.death': sfx(recipe(280, 0.75, 0.18, 'sawtooth', 48), 100),
  'player.respawn': sfx(recipe(220, 0.75, 0.16, 'sine', 920), 95),
  'combat.m1-swing': sfx(recipe(460, 0.11, 0.12, 'sawtooth', 120), 48),
  'combat.skill-cast': sfx(recipe(300, 0.28, 0.14, 'triangle', 880), 65),
  'combat.projectile': sfx(recipe(680, 0.2, 0.12, 'sine', 230), 57, true),
  'combat.hit': sfx(recipe(125, 0.12, 0.17, 'square', 68), 72, true),
  'combat.block': sfx(recipe(820, 0.09, 0.13, 'square', 420), 74),
  'combat.guard-break': sfx(recipe(360, 0.35, 0.2, 'sawtooth', 58), 92),
  'combat.stun': sfx(recipe(940, 0.24, 0.1, 'sine', 520), 75),
  'monster.aggro': sfx(recipe(150, 0.32, 0.13, 'sawtooth', 95), 58, true),
  'monster.attack': sfx(recipe(260, 0.16, 0.14, 'square', 110), 62, true),
  'monster.hit': sfx(recipe(180, 0.1, 0.14, 'triangle', 80), 58, true),
  'monster.death': sfx(recipe(220, 0.45, 0.17, 'sawtooth', 44), 82, true),
  'monster.respawn': sfx(recipe(180, 0.5, 0.12, 'sine', 650), 45, true),
  'boat.board': sfx(recipe(190, 0.18, 0.11, 'triangle', 310), 45),
  'boat.disembark': sfx(recipe(270, 0.15, 0.1, 'triangle', 150), 42),
  'boat.throttle': {
    ...sfx(recipe(88, 0.42, 0.055, 'sawtooth', 118), 20, true),
    cooldownMs: 280,
    maxInstances: 2,
  },
  'boat.anchor': sfx(recipe(115, 0.42, 0.16, 'square', 54), 60, true),
  'boat.cannon': sfx(recipe(92, 0.5, 0.22, 'square', 38), 94, true),
  'boat.hit': sfx(recipe(105, 0.28, 0.19, 'sawtooth', 52), 84, true),
  'boat.sinking': sfx(recipe(130, 0.9, 0.17, 'sawtooth', 32), 98, true),
  'reward.coins': sfx(recipe(980, 0.11, 0.11, 'sine', 1320), 55),
  'reward.item-pickup': sfx(recipe(540, 0.2, 0.12, 'triangle', 970), 58),
  'reward.exp': sfx(recipe(440, 0.13, 0.08, 'sine', 690), 42),
  'reward.level-up': sfx(recipe(360, 0.7, 0.18, 'triangle', 1260), 90),
  'reward.quest-complete': sfx(recipe(520, 0.65, 0.17, 'triangle', 1180), 88),
  'world.wind': ambience(recipe(92, 1.2, 0.035, 'sine', 120)),
  'world.waves': ambience(recipe(74, 1.1, 0.045, 'sine', 48)),
  'world.dock': ambience(recipe(130, 0.7, 0.04, 'triangle', 90)),
};

export const AUDIO_CUES: Readonly<Record<AudioCueId, AudioCueDefinition>> = Object.fromEntries(
  Object.entries(seeds).map(([id, seed]) => [id, {
    id,
    cooldownMs: 0,
    maxInstances: 4,
    ...seed,
  }]),
) as unknown as Readonly<Record<AudioCueId, AudioCueDefinition>>;
