import type {
  AudioBus,
  AudioCueDefinition,
  AudioPosition,
  MusicTrack,
} from './types';

export interface AudioBackend {
  unlock(): Promise<boolean>;
  setBusVolume(bus: AudioBus | 'master', value: number): void;
  playMusic(track: MusicTrack, fadeMs: number, onEnded: () => void): Promise<void>;
  stopMusic(fadeMs: number): void;
  setMusicDuck(value: number, fadeMs: number): void;
  setTension(value: number): void;
  playCue(cue: AudioCueDefinition, position?: AudioPosition, priority?: number): void;
  setListener(position: AudioPosition): void;
  suspend(): Promise<void>;
  resume(): Promise<boolean>;
  dispose(): void;
}

interface MusicDeck {
  element: HTMLAudioElement;
  gain: GainNode;
  trackId: MusicTrack['id'] | null;
  generation: number;
}

interface ActiveVoice {
  source: OscillatorNode;
  priority: number;
  cueId: AudioCueDefinition['id'];
}

type AudioContextConstructor = new () => AudioContext;

function contextConstructor(): AudioContextConstructor | null {
  const browser = globalThis as typeof globalThis & { webkitAudioContext?: AudioContextConstructor };
  return browser.AudioContext ?? browser.webkitAudioContext ?? null;
}

/** Browser implementation. Construction is inert: AudioContext, media nodes and requests
 * are created only by unlock(), which is called from a real player gesture. */
export class BrowserAudioBackend implements AudioBackend {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private buses = new Map<AudioBus, GainNode>();
  private musicDuck: GainNode | null = null;
  private decks: MusicDeck[] = [];
  private currentDeck = -1;
  private musicGeneration = 0;
  private voices = new Set<ActiveVoice>();
  private tension: { oscillator: OscillatorNode; gain: GainNode } | null = null;
  private listener: AudioPosition = { x: 0, y: 0, z: 0 };
  private readonly volumes = new Map<AudioBus | 'master', number>([
    ['master', 1], ['music', 0.7], ['ambience', 0.65], ['sfx', 0.8], ['ui', 0.75],
  ]);

  constructor(private readonly maxVoices: number) {}

  async unlock(): Promise<boolean> {
    try {
      if (!this.context) this.createGraph();
      if (!this.context) return false;
      if (this.context.state !== 'running') await this.context.resume();
      return this.context.state === 'running';
    } catch (error) {
      console.warn('[audio] unlock failed; gameplay continues without sound', error);
      return false;
    }
  }

  private createGraph(): void {
    const Constructor = contextConstructor();
    if (!Constructor || typeof Audio === 'undefined') return;
    const context = new Constructor();
    const master = context.createGain();
    master.connect(context.destination);
    this.context = context;
    this.master = master;

    for (const bus of ['music', 'ambience', 'sfx', 'ui'] as const) {
      const node = context.createGain();
      node.gain.value = this.volumes.get(bus) ?? 1;
      node.connect(master);
      this.buses.set(bus, node);
    }
    master.gain.value = this.volumes.get('master') ?? 1;
    this.musicDuck = context.createGain();
    this.musicDuck.connect(this.buses.get('music')!);

    this.decks = [0, 1].map(() => {
      const element = new Audio();
      element.preload = 'none';
      element.crossOrigin = 'anonymous';
      const source = context.createMediaElementSource(element);
      const gain = context.createGain();
      gain.gain.value = 0;
      source.connect(gain);
      gain.connect(this.musicDuck!);
      return { element, gain, trackId: null, generation: 0 };
    });
  }

  setBusVolume(bus: AudioBus | 'master', value: number): void {
    const safe = Math.min(1, Math.max(0, value));
    this.volumes.set(bus, safe);
    const context = this.context;
    const node = bus === 'master' ? this.master : this.buses.get(bus);
    if (context && node) node.gain.setTargetAtTime(safe, context.currentTime, 0.025);
  }

  async playMusic(track: MusicTrack, fadeMs: number, onEnded: () => void): Promise<void> {
    if (!this.context || this.context.state !== 'running' || this.decks.length !== 2) return;
    const current = this.decks[this.currentDeck];
    if (current?.trackId === track.id && !current.element.paused) return;
    const generation = ++this.musicGeneration;

    const nextIndex = this.currentDeck === 0 ? 1 : 0;
    const next = this.decks[nextIndex];
    const now = this.context.currentTime;
    const fadeSeconds = Math.max(0.05, fadeMs / 1000);
    next.element.pause();
    next.element.src = track.url;
    next.element.loop = track.loop;
    next.element.currentTime = 0;
    next.trackId = track.id;
    next.generation = generation;
    next.element.onended = () => {
      if (this.currentDeck === nextIndex && next.trackId === track.id) onEnded();
    };
    next.gain.gain.cancelScheduledValues(now);
    next.gain.gain.setValueAtTime(0, now);
    next.gain.gain.linearRampToValueAtTime(1, now + fadeSeconds);
    try {
      await next.element.play();
      if (generation !== this.musicGeneration) {
        if (next.generation === generation) {
          next.element.pause();
          next.element.onended = null;
          next.element.removeAttribute('src');
          next.element.load();
          next.trackId = null;
        }
        return;
      }
    } catch (error) {
      if (generation === this.musicGeneration) {
        next.trackId = null;
        next.element.removeAttribute('src');
      }
      console.warn('[audio] music playback failed', error);
      return;
    }

    const oldIndex = this.currentDeck;
    this.currentDeck = nextIndex;
    if (oldIndex >= 0) {
      const old = this.decks[oldIndex];
      old.gain.gain.cancelScheduledValues(now);
      old.gain.gain.setValueAtTime(old.gain.gain.value, now);
      old.gain.gain.linearRampToValueAtTime(0, now + fadeSeconds);
      globalThis.setTimeout(() => {
        if (this.currentDeck === oldIndex) return;
        old.element.pause();
        old.element.onended = null;
        old.element.removeAttribute('src');
        old.element.load();
        old.trackId = null;
      }, fadeMs + 120);
    }
  }

  stopMusic(fadeMs: number): void {
    this.musicGeneration += 1;
    if (!this.context || this.currentDeck < 0) return;
    const deckIndex = this.currentDeck;
    const deck = this.decks[deckIndex];
    const now = this.context.currentTime;
    deck.gain.gain.cancelScheduledValues(now);
    deck.gain.gain.setValueAtTime(deck.gain.gain.value, now);
    deck.gain.gain.linearRampToValueAtTime(0, now + Math.max(0.05, fadeMs / 1000));
    this.currentDeck = -1;
    globalThis.setTimeout(() => {
      if (this.currentDeck === deckIndex) return;
      deck.element.pause();
      deck.element.onended = null;
      deck.element.removeAttribute('src');
      deck.element.load();
      deck.trackId = null;
    }, fadeMs + 120);
  }

  setMusicDuck(value: number, fadeMs: number): void {
    if (!this.context || !this.musicDuck) return;
    this.musicDuck.gain.setTargetAtTime(
      Math.min(1, Math.max(0, value)),
      this.context.currentTime,
      Math.max(0.02, fadeMs / 5000),
    );
  }

  setTension(value: number): void {
    if (!this.context || !this.buses.get('ambience')) return;
    const safe = Math.min(1, Math.max(0, value));
    if (safe <= 0.001) {
      if (this.tension) {
        this.tension.gain.gain.setTargetAtTime(0, this.context.currentTime, 0.08);
        const oscillator = this.tension.oscillator;
        globalThis.setTimeout(() => { try { oscillator.stop(); } catch { /* already stopped */ } }, 500);
        this.tension = null;
      }
      return;
    }
    if (!this.tension) {
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = 'sawtooth';
      oscillator.frequency.value = 52;
      gain.gain.value = 0;
      oscillator.connect(gain);
      gain.connect(this.buses.get('ambience')!);
      oscillator.start();
      this.tension = { oscillator, gain };
    }
    this.tension.gain.gain.setTargetAtTime(0.035 * safe, this.context.currentTime, 0.08);
  }

  playCue(cue: AudioCueDefinition, position?: AudioPosition, priority = cue.priority): void {
    const context = this.context;
    const bus = this.buses.get(cue.bus);
    if (!context || context.state !== 'running' || !bus) return;
    if (cue.spatial && position) {
      const distance = Math.hypot(
        position.x - this.listener.x,
        position.y - this.listener.y,
        position.z - this.listener.z,
      );
      if (distance > (cue.interestRange ?? cue.maxDistance ?? 45)) return;
    }
    const sameCue = [...this.voices].filter((voice) => voice.cueId === cue.id);
    if (sameCue.length >= cue.maxInstances) {
      const candidate = sameCue.sort((a, b) => a.priority - b.priority)[0];
      if (candidate.priority > priority) return;
      try { candidate.source.stop(); } catch { /* voice already ended */ }
      this.voices.delete(candidate);
    }
    if (this.voices.size >= this.maxVoices) {
      const candidate = [...this.voices].sort((a, b) => a.priority - b.priority)[0];
      if (!candidate || candidate.priority > priority) return;
      try { candidate.source.stop(); } catch { /* voice already ended */ }
      this.voices.delete(candidate);
    }

    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    const now = context.currentTime;
    const end = now + cue.recipe.duration;
    oscillator.type = cue.recipe.waveform;
    oscillator.frequency.setValueAtTime(cue.recipe.frequency, now);
    if (cue.recipe.endFrequency !== undefined) {
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, cue.recipe.endFrequency), end);
    }
    if (cue.recipe.detune) oscillator.detune.value = cue.recipe.detune;
    const attack = cue.recipe.attack ?? 0.008;
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, cue.recipe.gain), now + attack);
    envelope.gain.exponentialRampToValueAtTime(0.0001, end);
    oscillator.connect(envelope);

    if (cue.spatial && position) {
      const panner = context.createPanner();
      panner.panningModel = 'equalpower';
      panner.distanceModel = 'inverse';
      panner.refDistance = 2;
      panner.maxDistance = cue.maxDistance ?? 42;
      panner.rolloffFactor = cue.rolloff ?? 1.35;
      panner.positionX.value = position.x;
      panner.positionY.value = position.y;
      panner.positionZ.value = position.z;
      envelope.connect(panner);
      panner.connect(bus);
    } else {
      envelope.connect(bus);
    }

    const voice = { source: oscillator, priority, cueId: cue.id };
    this.voices.add(voice);
    oscillator.onended = () => this.voices.delete(voice);
    oscillator.start(now);
    oscillator.stop(end + 0.02);
  }

  setListener(position: AudioPosition): void {
    this.listener = { ...position };
    if (!this.context) return;
    const listener = this.context.listener;
    listener.positionX.value = position.x;
    listener.positionY.value = position.y;
    listener.positionZ.value = position.z;
  }

  async suspend(): Promise<void> {
    if (this.context?.state === 'running') await this.context.suspend().catch(() => undefined);
  }

  async resume(): Promise<boolean> {
    if (!this.context) return false;
    if (this.context.state !== 'running') await this.context.resume().catch(() => undefined);
    return this.context.state === 'running';
  }

  dispose(): void {
    this.setTension(0);
    for (const voice of this.voices) {
      try { voice.source.stop(); } catch { /* already ended */ }
    }
    this.voices.clear();
    for (const deck of this.decks) {
      deck.element.pause();
      deck.element.removeAttribute('src');
      deck.element.load();
    }
    void this.context?.close().catch(() => undefined);
    this.context = null;
    this.decks = [];
  }
}
