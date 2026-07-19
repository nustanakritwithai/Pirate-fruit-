import type { MusicTrack } from './types';

// Static URL expressions make Vite emit content-hashed assets. The browser does not fetch
// any of these URLs until BrowserAudioBackend assigns one after an explicit user gesture.
export const MUSIC_TRACKS: Readonly<Record<MusicTrack['id'], MusicTrack>> = {
  'sailing-a': {
    id: 'sailing-a',
    url: new URL('../assets/audio/music/sailing-moon-treasure-a.mp3', import.meta.url).href,
    loop: false,
  },
  'sailing-b': {
    id: 'sailing-b',
    url: new URL('../assets/audio/music/sailing-moon-treasure-b.mp3', import.meta.url).href,
    loop: false,
  },
  island: {
    id: 'island',
    url: new URL('../assets/audio/music/island-devil-fruit-fury.mp3', import.meta.url).href,
    loop: true,
  },
};
