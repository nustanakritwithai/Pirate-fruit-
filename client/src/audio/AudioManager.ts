import { AUDIO_CUES } from './AudioRegistry';
import { MUSIC_TRACKS } from './AudioAssets';
import { BrowserAudioBackend, type AudioBackend } from './AudioBackend';
import { MusicStateMachine } from './MusicStateMachine';
import type {
  AudioCueId,
  AudioPlayOptions,
  AudioRuntimeStatus,
  AudioSettings,
  MusicObservation,
  MusicTrack,
} from './types';

export const AUDIO_SETTINGS_STORAGE_KEY = 'pirate-fruit:audio:v1';

export const DEFAULT_AUDIO_SETTINGS: Readonly<AudioSettings> = {
  master: 0.85,
  music: 0.64,
  ambience: 0.6,
  sfx: 0.78,
  ui: 0.72,
  muted: false,
};

interface StoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface AudioManagerOptions {
  enabled: boolean;
  backend?: AudioBackend;
  storage?: StoragePort | null;
  now?: () => number;
  mobile?: boolean;
  crossfadeMs?: number;
}

function clampVolume(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : fallback;
}

export function loadAudioSettings(storage: StoragePort | null | undefined): AudioSettings {
  if (!storage) return { ...DEFAULT_AUDIO_SETTINGS };
  try {
    const raw = storage.getItem(AUDIO_SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_AUDIO_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<AudioSettings>;
    return {
      master: clampVolume(parsed.master, DEFAULT_AUDIO_SETTINGS.master),
      music: clampVolume(parsed.music, DEFAULT_AUDIO_SETTINGS.music),
      ambience: clampVolume(parsed.ambience, DEFAULT_AUDIO_SETTINGS.ambience),
      sfx: clampVolume(parsed.sfx, DEFAULT_AUDIO_SETTINGS.sfx),
      ui: clampVolume(parsed.ui, DEFAULT_AUDIO_SETTINGS.ui),
      muted: parsed.muted === true,
    };
  } catch {
    return { ...DEFAULT_AUDIO_SETTINGS };
  }
}

export function audioSystemEnabled(value = import.meta.env.VITE_ENABLE_AUDIO_SYSTEM): boolean {
  return value === 'true' || value === '1';
}

function isMobileRuntime(): boolean {
  if (typeof navigator === 'undefined') return false;
  return navigator.maxTouchPoints > 0 || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
}

export class AudioManager {
  readonly enabled: boolean;
  readonly music = new MusicStateMachine();
  settings: AudioSettings;

  private readonly backend: AudioBackend;
  private readonly storage: StoragePort | null;
  private readonly now: () => number;
  private readonly mobile: boolean;
  private readonly crossfadeMs: number;
  private statusValue: AudioRuntimeStatus;
  private statusListeners = new Set<(status: AudioRuntimeStatus) => void>();
  private lastCueAt = new Map<AudioCueId, number>();
  private eventIds = new Map<string, number>();
  private observation: MusicObservation = {
    dead: false, boss: false, combat: false, onBoat: false, onFoot: false, loading: true,
  };
  private sailingIndex: 0 | 1 = 0;
  private baseTrack: MusicTrack['id'] | null = null;
  private unlockCleanup: (() => void) | null = null;
  private unlockInFlight: Promise<boolean> | null = null;

  constructor(options: AudioManagerOptions) {
    this.enabled = options.enabled;
    this.mobile = options.mobile ?? isMobileRuntime();
    this.storage = options.storage ?? (
      typeof localStorage !== 'undefined' ? localStorage : null
    );
    this.now = options.now ?? (() => Date.now());
    this.crossfadeMs = Math.min(2500, Math.max(1500, options.crossfadeMs ?? 1800));
    this.settings = loadAudioSettings(this.storage);
    this.backend = options.backend ?? new BrowserAudioBackend(this.mobile ? 10 : 22);
    this.statusValue = this.enabled ? 'locked' : 'disabled';
  }

  get status(): AudioRuntimeStatus {
    return this.statusValue;
  }

  onStatus(listener: (status: AudioRuntimeStatus) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.statusValue);
    return () => this.statusListeners.delete(listener);
  }

  private setStatus(status: AudioRuntimeStatus): void {
    if (status === this.statusValue) return;
    this.statusValue = status;
    for (const listener of this.statusListeners) listener(status);
  }

  bindAutoplayUnlock(target: EventTarget): void {
    if (!this.enabled || this.unlockCleanup) return;
    // Keep the gesture recovery hook for the lifetime of the manager. Mobile browsers
    // may suspend an already-unlocked AudioContext after an app switch, screen lock,
    // phone call or memory pressure without a reliable visibility transition.
    const unlock = (event: Event): void => {
      if (typeof KeyboardEvent !== 'undefined' && event instanceof KeyboardEvent && event.repeat) return;
      void this.unlock();
    };
    const types = ['pointerdown', 'touchend', 'keydown'] as const;
    for (const type of types) target.addEventListener(type, unlock, { capture: true, passive: true });
    this.unlockCleanup = () => {
      for (const type of types) target.removeEventListener(type, unlock, { capture: true });
      this.unlockCleanup = null;
    };
  }

  bindUiSounds(target: EventTarget): () => void {
    if (!this.enabled) return () => undefined;
    const listener = (event: Event): void => {
      const element = event.target as Element | null;
      if (element?.closest('button,[role="button"],input[type="range"]')) this.play('ui.click');
    };
    target.addEventListener('click', listener);
    return () => target.removeEventListener('click', listener);
  }

  async unlock(): Promise<boolean> {
    if (!this.enabled) return false;
    if (this.statusValue === 'running' && this.backend.isRunning()) return true;
    if (this.unlockInFlight) return this.unlockInFlight;
    const attempt = this.performUnlock();
    this.unlockInFlight = attempt;
    try {
      return await attempt;
    } finally {
      if (this.unlockInFlight === attempt) this.unlockInFlight = null;
    }
  }

  private async performUnlock(): Promise<boolean> {
    try {
      const unlocked = await this.backend.unlock();
      if (!unlocked) {
        this.setStatus('failed');
        return false;
      }
      this.applyVolumes();
      this.setStatus('running');
      this.applyMusicState(true);
      return true;
    } catch (error) {
      console.warn('[audio] disabled after unlock error', error);
      this.setStatus('failed');
      return false;
    }
  }

  updateSettings(patch: Partial<AudioSettings>): void {
    this.settings = {
      master: clampVolume(patch.master, this.settings.master),
      music: clampVolume(patch.music, this.settings.music),
      ambience: clampVolume(patch.ambience, this.settings.ambience),
      sfx: clampVolume(patch.sfx, this.settings.sfx),
      ui: clampVolume(patch.ui, this.settings.ui),
      muted: patch.muted ?? this.settings.muted,
    };
    try { this.storage?.setItem(AUDIO_SETTINGS_STORAGE_KEY, JSON.stringify(this.settings)); } catch { /* local only */ }
    this.applyVolumes();
  }

  toggleMute(): void {
    this.updateSettings({ muted: !this.settings.muted });
  }

  private applyVolumes(): void {
    this.backend.setBusVolume('master', this.settings.muted ? 0 : this.settings.master);
    this.backend.setBusVolume('music', this.settings.music);
    this.backend.setBusVolume('ambience', this.settings.ambience);
    this.backend.setBusVolume('sfx', this.settings.sfx);
    this.backend.setBusVolume('ui', this.settings.ui);
  }

  setMusicObservation(observation: MusicObservation): void {
    if (!this.enabled) return;
    this.observation = observation;
    const transition = this.music.transition(observation);
    if (this.statusValue !== 'running') return;
    this.applyMusicState(transition.changed);
  }

  private applyMusicState(force: boolean): void {
    const state = this.music.state;
    if (state === 'death' || state === 'silence') {
      this.backend.setTension(0);
      this.backend.stopMusic(state === 'death' ? 650 : this.crossfadeMs);
      this.baseTrack = null;
      return;
    }

    const desired: MusicTrack['id'] = this.observation.onBoat
      ? (this.sailingIndex === 0 ? 'sailing-a' : 'sailing-b')
      : 'island';
    if (force || desired !== this.baseTrack) {
      this.baseTrack = desired;
      void this.backend.playMusic(MUSIC_TRACKS[desired], this.crossfadeMs, () => this.onTrackEnded(desired));
    }
    if (state === 'boss') {
      this.backend.setMusicDuck(0.48, 450);
      this.backend.setTension(1);
    } else if (state === 'combat') {
      this.backend.setMusicDuck(0.62, 450);
      this.backend.setTension(0.55);
    } else {
      this.backend.setMusicDuck(1, 700);
      this.backend.setTension(0);
    }
  }

  private onTrackEnded(trackId: MusicTrack['id']): void {
    if (trackId === 'island' || !this.observation.onBoat || this.music.state === 'death') return;
    this.sailingIndex = this.sailingIndex === 0 ? 1 : 0;
    const nextTrack = this.sailingIndex === 0 ? 'sailing-a' : 'sailing-b';
    this.baseTrack = nextTrack;
    void this.backend.playMusic(
      MUSIC_TRACKS[nextTrack],
      this.crossfadeMs,
      () => this.onTrackEnded(nextTrack),
    );
  }

  play(id: AudioCueId, options: AudioPlayOptions = {}): boolean {
    if (!this.enabled || this.statusValue !== 'running' || this.settings.muted) return false;
    const cue = AUDIO_CUES[id];
    const now = this.now();
    this.pruneDedupe(now);
    if (options.eventId) {
      const seenAt = this.eventIds.get(options.eventId);
      if (seenAt !== undefined && now - seenAt < 15_000) return false;
      this.eventIds.set(options.eventId, now);
    }
    const last = this.lastCueAt.get(id) ?? Number.NEGATIVE_INFINITY;
    if (now - last < cue.cooldownMs) return false;
    this.lastCueAt.set(id, now);
    const effectiveCue = this.mobile && cue.spatial && cue.mobileInterestRange
      ? { ...cue, interestRange: cue.mobileInterestRange, maxDistance: Math.min(cue.maxDistance ?? 42, cue.mobileInterestRange) }
      : cue;
    try {
      this.backend.playCue(effectiveCue, options.position, options.priority ?? cue.priority);
      return true;
    } catch (error) {
      console.warn(`[audio] cue ${id} failed`, error);
      return false;
    }
  }

  private pruneDedupe(now: number): void {
    if (this.eventIds.size < 256) return;
    for (const [id, time] of this.eventIds) {
      if (now - time > 15_000) this.eventIds.delete(id);
    }
    while (this.eventIds.size > 512) this.eventIds.delete(this.eventIds.keys().next().value as string);
  }

  setListener(position: { x: number; y: number; z: number }): void {
    if (this.statusValue === 'running') this.backend.setListener(position);
  }

  async handleVisibility(hidden: boolean): Promise<void> {
    if (!this.enabled || this.statusValue === 'disabled' || this.statusValue === 'failed') return;
    if (hidden) {
      await this.backend.suspend().catch(() => undefined);
      this.setStatus('suspended');
      return;
    }
    const resumed = await this.backend.resume().catch(() => false);
    this.setStatus(resumed ? 'running' : 'locked');
    if (resumed) this.applyMusicState(true);
  }

  dispose(): void {
    this.unlockCleanup?.();
    this.backend.dispose();
    this.statusListeners.clear();
  }
}

export function createAudioManager(): AudioManager {
  return new AudioManager({ enabled: audioSystemEnabled() });
}
