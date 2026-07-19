import type { MusicTrack } from './types';

// Procedural score definitions: no media file, URL, preload or network transfer.
export const MUSIC_TRACKS: Readonly<Record<MusicTrack['id'], MusicTrack>> = {
  'sailing-a': {
    id: 'sailing-a',
    frequencies: [110, 164.81],
    durationSeconds: 96,
    loop: false,
  },
  'sailing-b': {
    id: 'sailing-b',
    frequencies: [98, 146.83],
    durationSeconds: 112,
    loop: false,
  },
  island: {
    id: 'island',
    frequencies: [130.81, 196],
    durationSeconds: 120,
    loop: true,
  },
};
