import { describe, expect, it } from 'vitest';
import { MUSIC_TRACKS } from '../AudioAssets';
import { AUDIO_CUES } from '../AudioRegistry';

describe('procedural pirate-fantasy audio palette', () => {
  it('keeps every score data-driven, bounded, and free of media URLs', () => {
    for (const track of Object.values(MUSIC_TRACKS)) {
      expect(track.bpm).toBeGreaterThanOrEqual(72);
      expect(track.bpm).toBeLessThanOrEqual(112);
      expect(track.bars).toBeLessThanOrEqual(16);
      expect(track.scale.length).toBeGreaterThanOrEqual(5);
      expect(track.melody.length).toBeGreaterThan(0);
      expect(track.bass.length).toBeGreaterThan(0);
      expect(track.percussion.length).toBeGreaterThan(0);
    }
    expect(JSON.stringify(MUSIC_TRACKS)).not.toMatch(/https?:|data:audio|\.mp3\"|\.wav\"|\.ogg\"/i);
  });

  it('uses layered synthesis for signature pirate and fantasy cues', () => {
    for (const id of ['boat.cannon', 'combat.m1-swing', 'combat.skill-cast', 'reward.level-up'] as const) {
      const layers = AUDIO_CUES[id].recipe;
      expect(Array.isArray(layers)).toBe(true);
      if (!Array.isArray(layers)) throw new Error(`${id} must remain layered`);
      expect(layers.length).toBeGreaterThanOrEqual(2);
    }
    expect(JSON.stringify(AUDIO_CUES)).not.toMatch(/https?:|data:audio|\.mp3\"|\.wav\"|\.ogg\"/i);
  });

  it('uses filtered procedural noise only for transient effects and ambience', () => {
    const noiseLayers = Object.values(AUDIO_CUES).flatMap((cue) => (
      Array.isArray(cue.recipe) ? cue.recipe : [cue.recipe]
    )).filter((layer) => layer.noise);
    expect(noiseLayers.length).toBeGreaterThan(5);
    expect(Math.max(...noiseLayers.map((layer) => layer.duration))).toBeLessThanOrEqual(1.25);
  });

  it('avoids sustained low-frequency buzz sources on ambience and boat throttle', () => {
    for (const id of ['world.wind', 'world.waves', 'world.dock'] as const) {
      const layers = Array.isArray(AUDIO_CUES[id].recipe)
        ? AUDIO_CUES[id].recipe
        : [AUDIO_CUES[id].recipe];
      expect(layers.every((layer) => layer.noise === true)).toBe(true);
      expect(layers.every((layer) => layer.gain <= 0.03)).toBe(true);
    }

    const throttle = Array.isArray(AUDIO_CUES['boat.throttle'].recipe)
      ? AUDIO_CUES['boat.throttle'].recipe
      : [AUDIO_CUES['boat.throttle'].recipe];
    expect(throttle.some((layer) => layer.waveform === 'sawtooth' || layer.waveform === 'square')).toBe(false);
    expect(Math.max(...throttle.map((layer) => layer.duration))).toBeLessThanOrEqual(0.22);
  });
});
