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
  oscillators: OscillatorNode[];
  trackId: MusicTrack['id'];
  timer: ReturnType<typeof globalThis.setTimeout> | null;
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
  private musicLayer: ProceduralMusicLayer | null = null;
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
    gain.gain.linearRampToValueAtTime(0.032, now + fadeSeconds);
    gain.connect(this.musicDuck);
    const oscillators = track.frequencies.map((frequency, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = index === 0 ? 'sine' : 'triangle';
      oscillator.frequency.value = frequency;
      oscillator.detune.value = index === 0 ? 0 : -7;
      oscillator.connect(gain);
      oscillator.start(now);
      return oscillator;
    });
    const next: ProceduralMusicLayer = { gain, oscillators, trackId: track.id, timer: null };
    const old = this.musicLayer;
    this.musicLayer = next;
    if (!track.loop) {
      next.timer = globalThis.setTimeout(() => {
        if (this.musicLayer === next) onEnded();
      }, track.durationSeconds * 1000);
    }
    if (old) this.fadeOutMusicLayer(old, fadeMs);
  }

  stopMusic(fadeMs: number): void {
    const layer = this.musicLayer;
    if (!layer) return;
    this.musicLayer = null;
    this.fadeOutMusicLayer(layer, fadeMs);
  }

  private fadeOutMusicLayer(layer: ProceduralMusicLayer, fadeMs: number): void {
    if (!this.context) return;
    if (layer.timer !== null) globalThis.clearTimeout(layer.timer);
    const now = this.context.currentTime;
    layer.gain.gain.cancelScheduledValues(now);
    layer.gain.gain.setValueAtTime(Math.max(0.0001, layer.gain.gain.value), now);
    layer.gain.gain.linearRampToValueAtTime(0.0001, now + Math.max(0.05, fadeMs / 1000));
    globalThis.setTimeout(() => {
      for (const oscillator of layer.oscillators) {
        try { oscillator.stop(); } catch { /* already stopped */ }
      }
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
    if (this.musicLayer) {
      if (this.musicLayer.timer !== null) globalThis.clearTimeout(this.musicLayer.timer);
      for (const oscillator of this.musicLayer.oscillators) {
        try { oscillator.stop(); } catch { /* already stopped */ }
      }
      this.musicLayer = null;
    }
    this.setTension(0);
    for (const voice of this.voices) {
      try { voice.source.stop(); } catch { /* already ended */ }
    }
    this.voices.clear();
    void this.context?.close().catch(() => undefined);
    this.context = null;
  }
}
