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

interface ProceduralMusicLayer {
  gain: GainNode;
  sources: Set<AudioScheduledSourceNode>;
  trackId: MusicTrack['id'];
  timer: ReturnType<typeof globalThis.setTimeout> | null;
  nextStepAt: number;
  step: number;
  stopped: boolean;
  ended: boolean;
}

interface ActiveVoice {
  sources: AudioScheduledSourceNode[];
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
  private musicLayer: ProceduralMusicLayer | null = null;
  private voices = new Set<ActiveVoice>();
  private tension: { oscillator: OscillatorNode; gain: GainNode } | null = null;
  private noiseBuffer: AudioBuffer | null = null;
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
    if (!Constructor) return;
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
    this.noiseBuffer = this.createNoiseBuffer(context);
  }

  private createNoiseBuffer(context: AudioContext): AudioBuffer {
    const length = Math.max(1, Math.floor(context.sampleRate * 1.25));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const channel = buffer.getChannelData(0);
    // Deterministic xorshift avoids shipping a sample and keeps test/build output stable.
    let seed = 0x50495241;
    for (let i = 0; i < channel.length; i++) {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      channel[i] = ((seed >>> 0) / 0x7fffffff) - 1;
    }
    return buffer;
  }

  setBusVolume(bus: AudioBus | 'master', value: number): void {
    const safe = Math.min(1, Math.max(0, value));
    this.volumes.set(bus, safe);
    const context = this.context;
    const node = bus === 'master' ? this.master : this.buses.get(bus);
    if (context && node) node.gain.setTargetAtTime(safe, context.currentTime, 0.025);
  }

  async playMusic(track: MusicTrack, fadeMs: number, onEnded: () => void): Promise<void> {
    if (!this.context || this.context.state !== 'running' || !this.musicDuck) return;
    if (this.musicLayer?.trackId === track.id) return;
    const context = this.context;
    const now = context.currentTime;
    const fadeSeconds = Math.max(0.05, fadeMs / 1000);
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.72, now + fadeSeconds);
    gain.connect(this.musicDuck);
    const next: ProceduralMusicLayer = {
      gain,
      sources: new Set(),
      trackId: track.id,
      timer: null,
      nextStepAt: now + 0.06,
      step: 0,
      stopped: false,
      ended: false,
    };
    const old = this.musicLayer;
    this.musicLayer = next;
    this.scheduleMusic(next, track, onEnded);
    if (old) this.fadeOutMusicLayer(old, fadeMs);
  }

  private scheduleMusic(layer: ProceduralMusicLayer, track: MusicTrack, onEnded: () => void): void {
    const context = this.context;
    if (!context || layer.stopped) return;
    const stepSeconds = 60 / track.bpm / track.stepsPerBeat;
    const stepsPerBar = track.stepsPerBeat * track.beatsPerBar;
    const totalSteps = stepsPerBar * track.bars;
    const horizon = context.currentTime + 0.32;
    while (layer.nextStepAt <= horizon && !layer.ended) {
      if (layer.step >= totalSteps) {
        if (track.loop) layer.step = 0;
        else {
          layer.ended = true;
          const remainingMs = Math.max(0, (layer.nextStepAt - context.currentTime) * 1000);
          layer.timer = globalThis.setTimeout(() => {
            if (this.musicLayer === layer && !layer.stopped) onEnded();
          }, remainingMs);
          return;
        }
      }
      this.scheduleMusicStep(layer, track, layer.step, layer.nextStepAt, stepSeconds, stepsPerBar);
      layer.step++;
      layer.nextStepAt += stepSeconds;
    }
    layer.timer = globalThis.setTimeout(() => this.scheduleMusic(layer, track, onEnded), 120);
  }

  private scheduleMusicStep(
    layer: ProceduralMusicLayer,
    track: MusicTrack,
    absoluteStep: number,
    at: number,
    stepSeconds: number,
    stepsPerBar: number,
  ): void {
    const index = absoluteStep % track.melody.length;
    const noteFrequency = (degree: number, octave = 0): number => {
      const semitone = track.scale[((degree % track.scale.length) + track.scale.length) % track.scale.length];
      const wrappedOctave = Math.floor(degree / track.scale.length) + octave;
      return track.rootFrequency * 2 ** ((semitone + wrappedOctave * 12) / 12);
    };
    const bass = track.bass[absoluteStep % track.bass.length];
    if (bass !== null) this.scheduleTone(layer, noteFrequency(bass), at, stepSeconds * 1.75, 0.024, 'triangle');
    const melody = track.melody[index];
    if (melody !== null) {
      this.scheduleTone(layer, noteFrequency(melody, 2), at, stepSeconds * 0.82, 0.017, track.melodyWaveform);
    }
    const chord = track.chords[absoluteStep % track.chords.length];
    if (chord !== null && absoluteStep % Math.max(1, Math.floor(stepsPerBar / 2)) === 0) {
      this.scheduleTone(layer, noteFrequency(chord, 1), at, stepSeconds * 3.2, 0.009, 'sine', -5);
      this.scheduleTone(layer, noteFrequency(chord + 2, 1), at, stepSeconds * 3.2, 0.007, 'sine', 5);
    }
    const percussion = track.percussion[absoluteStep % track.percussion.length];
    if (percussion === 'kick') this.scheduleTone(layer, 92, at, 0.12, 0.022, 'sine', 0, 43);
    if (percussion === 'deck') this.scheduleTone(layer, 185, at, 0.045, 0.008, 'square', 0, 120);
    if (percussion === 'bell') this.scheduleTone(layer, 1320, at, 0.16, 0.007, 'sine', 7, 880);
  }

  private scheduleTone(
    layer: ProceduralMusicLayer,
    frequency: number,
    at: number,
    duration: number,
    peak: number,
    waveform: OscillatorType,
    detune = 0,
    endFrequency?: number,
  ): void {
    const context = this.context;
    if (!context || layer.stopped) return;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = waveform;
    oscillator.detune.value = detune;
    oscillator.frequency.setValueAtTime(Math.max(1, frequency), at);
    if (endFrequency !== undefined) oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), at + duration);
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + Math.min(0.025, duration * 0.2));
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    oscillator.connect(envelope);
    envelope.connect(layer.gain);
    layer.sources.add(oscillator);
    oscillator.onended = () => {
      layer.sources.delete(oscillator);
      envelope.disconnect();
    };
    oscillator.start(at);
    oscillator.stop(at + duration + 0.02);
  }

  stopMusic(fadeMs: number): void {
    const layer = this.musicLayer;
    if (!layer) return;
    this.musicLayer = null;
    this.fadeOutMusicLayer(layer, fadeMs);
  }

  private fadeOutMusicLayer(layer: ProceduralMusicLayer, fadeMs: number): void {
    if (!this.context) return;
    layer.stopped = true;
    if (layer.timer !== null) globalThis.clearTimeout(layer.timer);
    const now = this.context.currentTime;
    layer.gain.gain.cancelScheduledValues(now);
    layer.gain.gain.setValueAtTime(Math.max(0.0001, layer.gain.gain.value), now);
    layer.gain.gain.linearRampToValueAtTime(0.0001, now + Math.max(0.05, fadeMs / 1000));
    globalThis.setTimeout(() => {
      for (const source of layer.sources) {
        try { source.stop(); } catch { /* already stopped */ }
      }
      layer.sources.clear();
      layer.gain.disconnect();
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
      for (const source of candidate.sources) try { source.stop(); } catch { /* already ended */ }
      this.voices.delete(candidate);
    }
    if (this.voices.size >= this.maxVoices) {
      const candidate = [...this.voices].sort((a, b) => a.priority - b.priority)[0];
      if (!candidate || candidate.priority > priority) return;
      for (const source of candidate.sources) try { source.stop(); } catch { /* already ended */ }
      this.voices.delete(candidate);
    }

    const now = context.currentTime;
    const recipes = Array.isArray(cue.recipe) ? cue.recipe : [cue.recipe];
    const sources: AudioScheduledSourceNode[] = [];
    let output: AudioNode = bus;
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
      panner.connect(bus);
      output = panner;
    }
    const voice = { sources, priority, cueId: cue.id };
    this.voices.add(voice);
    let remaining = recipes.length;
    for (const layer of recipes) {
      const start = now + (layer.delay ?? 0);
      const end = start + layer.duration;
      const envelope = context.createGain();
      const attack = Math.min(layer.duration * 0.4, layer.attack ?? 0.008);
      envelope.gain.setValueAtTime(0.0001, start);
      envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, layer.gain), start + attack);
      envelope.gain.exponentialRampToValueAtTime(0.0001, end);
      let source: AudioScheduledSourceNode;
      let sourceOutput: AudioNode;
      if (layer.noise && this.noiseBuffer) {
        const noiseSource = context.createBufferSource();
        noiseSource.buffer = this.noiseBuffer;
        const filter = context.createBiquadFilter();
        filter.type = layer.filterType ?? 'lowpass';
        filter.frequency.value = layer.filterFrequency ?? 900;
        noiseSource.connect(filter);
        source = noiseSource;
        sourceOutput = filter;
      } else {
        const oscillator = context.createOscillator();
        oscillator.type = layer.waveform;
        oscillator.frequency.setValueAtTime(Math.max(1, layer.frequency), start);
        if (layer.endFrequency !== undefined) {
          oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, layer.endFrequency), end);
        }
        if (layer.detune) oscillator.detune.value = layer.detune;
        source = oscillator;
        sourceOutput = oscillator;
      }
      sourceOutput.connect(envelope);
      envelope.connect(output);
      sources.push(source);
      source.onended = () => {
        remaining--;
        envelope.disconnect();
        if (remaining <= 0) this.voices.delete(voice);
      };
      source.start(start);
      source.stop(end + 0.02);
    }
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
    if (this.musicLayer) {
      if (this.musicLayer.timer !== null) globalThis.clearTimeout(this.musicLayer.timer);
      this.musicLayer.stopped = true;
      for (const source of this.musicLayer.sources) {
        try { source.stop(); } catch { /* already stopped */ }
      }
      this.musicLayer = null;
    }
    this.setTension(0);
    for (const voice of this.voices) {
      for (const source of voice.sources) try { source.stop(); } catch { /* already ended */ }
    }
    this.voices.clear();
    void this.context?.close().catch(() => undefined);
    this.context = null;
    this.noiseBuffer = null;
  }
}
