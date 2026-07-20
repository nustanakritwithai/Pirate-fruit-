import type { MusicTrack } from './types';

// Procedural score definitions: no media file, URL, preload or network transfer.
export const MUSIC_TRACKS: Readonly<Record<MusicTrack['id'], MusicTrack>> = {
  'sailing-a': {
    id: 'sailing-a',
    // D Dorian, rolling 6/8: adventurous without borrowing an existing pirate melody.
    rootFrequency: 73.42,
    scale: [0, 2, 3, 5, 7, 9, 10, 12],
    bpm: 104,
    stepsPerBeat: 2,
    beatsPerBar: 6,
    bass: [0, null, null, 4, null, null, 0, null, 5, 4, null, null],
    melody: [4, null, 5, 6, 4, 2, 3, null, 4, 2, 1, null],
    chords: [0, null, null, 5, null, null, 3, null, null, 4, null, null],
    percussion: ['kick', 'deck', null, 'kick', 'deck', 'bell', 'kick', 'deck', null, 'kick', 'deck', null],
    melodyWaveform: 'triangle',
    bars: 16,
    loop: false,
  },
  'sailing-b': {
    id: 'sailing-b',
    // A minor pentatonic with a brighter raised sixth for open-sea discovery.
    rootFrequency: 55,
    scale: [0, 3, 5, 7, 9, 12, 15, 17],
    bpm: 96,
    stepsPerBeat: 2,
    beatsPerBar: 6,
    bass: [0, null, null, 3, null, null, 4, null, null, 2, null, null],
    melody: [5, 4, null, 3, 4, null, 2, null, 3, 1, 2, null],
    chords: [0, null, null, 4, null, null, 3, null, null, 2, null, null],
    percussion: ['kick', null, 'deck', 'kick', null, 'bell', 'kick', null, 'deck', 'kick', 'deck', null],
    melodyWaveform: 'sine',
    bars: 16,
    loop: false,
  },
  island: {
    id: 'island',
    // C major pentatonic: warm village exploration with sparse fantasy bells.
    rootFrequency: 65.41,
    scale: [0, 2, 4, 7, 9, 12, 14, 16],
    bpm: 78,
    stepsPerBeat: 2,
    beatsPerBar: 4,
    bass: [0, null, null, null, 3, null, null, null],
    melody: [4, null, 2, null, 3, null, 1, null],
    chords: [0, null, null, null, 3, null, null, null],
    percussion: [null, null, 'bell', null, null, null, 'deck', null],
    melodyWaveform: 'triangle',
    bars: 8,
    loop: true,
  },
};
