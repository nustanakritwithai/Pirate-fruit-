import { describe, expect, it } from 'vitest';
import {
  AUDIO_SETTINGS_STORAGE_KEY,
  AudioManager,
  audioSystemEnabled,
} from '../AudioManager';
import type { AudioBackend } from '../AudioBackend';
import type { AudioBus, AudioCueDefinition, AudioPosition, MusicObservation, MusicTrack } from '../types';

class FakeBackend implements AudioBackend {
  unlockCalls = 0;
  running = false;
  music: MusicTrack['id'][] = [];
  cues: string[] = [];
  stopped = 0;
  suspended = 0;
  resumed = 0;
  volumes = new Map<string, number>();
  isRunning(): boolean { return this.running; }
  async unlock(): Promise<boolean> { this.unlockCalls++; this.running = true; return true; }
  setBusVolume(bus: AudioBus | 'master', value: number): void { this.volumes.set(bus, value); }
  async playMusic(track: MusicTrack, _fadeMs: number, _onEnded: () => void): Promise<void> { this.music.push(track.id); }
  stopMusic(): void { this.stopped++; }
  setMusicDuck(): void {}
  setTension(): void {}
  playCue(cue: AudioCueDefinition, _position?: AudioPosition): void { this.cues.push(cue.id); }
  setListener(): void {}
  async suspend(): Promise<void> { this.suspended++; this.running = false; }
  async resume(): Promise<boolean> { this.resumed++; this.running = true; return true; }
  dispose(): void {}
}

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

const island = (patch: Partial<MusicObservation> = {}): MusicObservation => ({
  dead: false, boss: false, combat: false, onBoat: false, onFoot: true, loading: false, ...patch,
});
describe('AudioManager', () => {
  it('unlocks only after a user gesture', async () => {
    const backend = new FakeBackend();
    const manager = new AudioManager({ enabled: true, backend, storage: null });
    const target = new EventTarget();
    manager.bindAutoplayUnlock(target);
    expect(backend.unlockCalls).toBe(0);
    target.dispatchEvent(new Event('pointerdown'));
    await Promise.resolve();
    await Promise.resolve();
    expect(backend.unlockCalls).toBe(1);
    expect(manager.status).toBe('running');
  });

  it('recovers on the next gesture when an unlocked browser context is suspended externally', async () => {
    const backend = new FakeBackend();
    const manager = new AudioManager({ enabled: true, backend, storage: null });
    const target = new EventTarget();
    manager.bindAutoplayUnlock(target);
    target.dispatchEvent(new Event('pointerdown'));
    await Promise.resolve();
    await Promise.resolve();
    expect(backend.unlockCalls).toBe(1);

    backend.running = false;
    target.dispatchEvent(new Event('pointerdown'));
    await Promise.resolve();
    await Promise.resolve();

    expect(backend.unlockCalls).toBe(2);
    expect(manager.status).toBe('running');
  });

  it('keeps gesture recovery active after an initial unlock failure', async () => {
    const backend = new FakeBackend();
    backend.unlock = async () => {
      backend.unlockCalls++;
      backend.running = backend.unlockCalls > 1;
      return backend.running;
    };
    const manager = new AudioManager({ enabled: true, backend, storage: null });
    const target = new EventTarget();
    manager.bindAutoplayUnlock(target);

    target.dispatchEvent(new Event('pointerdown'));
    await Promise.resolve();
    await Promise.resolve();
    expect(manager.status).toBe('failed');

    target.dispatchEvent(new Event('pointerdown'));
    await Promise.resolve();
    await Promise.resolve();
    expect(backend.unlockCalls).toBe(2);
    expect(manager.status).toBe('running');
  });

  it('crossfades island to sailing and back without restarting repeated states', async () => {
    const backend = new FakeBackend();
    const manager = new AudioManager({ enabled: true, backend, storage: null });
    manager.setMusicObservation(island());
    await manager.unlock();
    manager.setMusicObservation(island());
    manager.setMusicObservation(island({ onBoat: true, onFoot: false }));
    manager.setMusicObservation(island({ onBoat: true, onFoot: false }));
    manager.setMusicObservation(island());
    expect(backend.music).toEqual(['island', 'sailing-a', 'island']);
  });

  it('deduplicates replayed authoritative event ids', async () => {
    const backend = new FakeBackend();
    const manager = new AudioManager({ enabled: true, backend, storage: null, now: () => 1000 });
    await manager.unlock();
    expect(manager.play('boat.cannon', { eventId: 'ws:42' })).toBe(true);
    expect(manager.play('boat.cannon', { eventId: 'ws:42' })).toBe(false);
    expect(backend.cues).toEqual(['boat.cannon']);
  });

  it('persists volume and mute outside gameplay saves', () => {
    const storage = new MemoryStorage();
    const first = new AudioManager({ enabled: true, backend: new FakeBackend(), storage });
    first.updateSettings({ music: 0.25, muted: true });
    expect([...storage.values.keys()]).toEqual([AUDIO_SETTINGS_STORAGE_KEY]);
    const second = new AudioManager({ enabled: true, backend: new FakeBackend(), storage });
    expect(second.settings.music).toBe(0.25);
    expect(second.settings.muted).toBe(true);
  });

  it('suspends and safely resumes when tab visibility changes', async () => {
    const backend = new FakeBackend();
    const manager = new AudioManager({ enabled: true, backend, storage: null });
    await manager.unlock();
    await manager.handleVisibility(true);
    expect(manager.status).toBe('suspended');
    await manager.handleVisibility(false);
    expect(manager.status).toBe('running');
    expect([backend.suspended, backend.resumed]).toEqual([1, 1]);
  });

  it('fades death and returns to the correct area music after respawn', async () => {
    const backend = new FakeBackend();
    const manager = new AudioManager({ enabled: true, backend, storage: null });
    manager.setMusicObservation(island());
    await manager.unlock();
    manager.setMusicObservation(island({ dead: true }));
    manager.setMusicObservation(island());
    expect(backend.stopped).toBeGreaterThan(0);
    expect(backend.music).toEqual(['island', 'island']);
  });

  it('keeps the false flag completely inert', async () => {
    const backend = new FakeBackend();
    const manager = new AudioManager({ enabled: false, backend, storage: null });
    manager.setMusicObservation(island({ onBoat: true, onFoot: false }));
    expect(await manager.unlock()).toBe(false);
    expect(manager.play('ui.click')).toBe(false);
    expect(backend.unlockCalls).toBe(0);
    expect(backend.music).toEqual([]);
    expect(audioSystemEnabled(undefined)).toBe(false);
    expect(audioSystemEnabled('false')).toBe(false);
  });
});
