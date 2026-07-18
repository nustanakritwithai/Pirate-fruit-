const SAILING_TRACKS = [
  '/assets/audio/sailing/moon-pirate-treasure-01.mp3',
  '/assets/audio/sailing/moon-pirate-treasure-02.mp3',
] as const;
const ISLAND_TRACKS = ['/assets/audio/island-devil-fruit-fury.mp3'] as const;

export type WorldMusicContext = 'island' | 'sailing' | 'none';

/**
 * เพลงโลกแบบ client-only: เพลงบรรยากาศบนเกาะและเพลงเดินเรือใช้คนละชุด แล้ว fade เมื่อเปลี่ยนพื้นที่.
 * ไม่เก็บ state ลง save จึงไม่กระทบ local/remote authority หรือการกู้ save เดิม.
 */
export class SailingMusic {
  private readonly audio: HTMLAudioElement;
  private context: WorldMusicContext = 'none';
  private started = false;
  private trackIndex = -1;
  private targetVolume = 0;

  constructor(private readonly random: () => number = Math.random) {
    this.audio = new Audio();
    this.audio.loop = false;
    this.audio.preload = 'metadata';
    this.audio.volume = 0;
    this.audio.addEventListener('ended', () => {
      if (this.context === 'none') return;
      this.chooseNextTrack();
      void this.play();
    });
    // Mobile browsers need a real gesture before sound may start. This is a one-shot retry.
    window.addEventListener('pointerdown', this.retryAfterGesture, { passive: true });
    window.addEventListener('keydown', this.retryAfterGesture);
  }

  setContext(context: WorldMusicContext): void {
    if (context === this.context) return;
    const shouldChangeTrack = context !== 'none' && context !== this.context;
    this.context = context;
    this.targetVolume = context === 'none' ? 0 : 0.32;
    if (shouldChangeTrack) {
      this.audio.pause();
      this.audio.currentTime = 0;
      this.started = false;
      this.chooseNextTrack();
      void this.play();
    }
  }

  update(dt: number): void {
    const change = Math.min(1, dt * 1.5);
    this.audio.volume += (this.targetVolume - this.audio.volume) * change;
    if (this.context === 'none' && this.audio.volume < 0.01 && !this.audio.paused) {
      this.audio.pause();
      this.audio.currentTime = 0;
      this.started = false;
    }
  }

  dispose(): void {
    this.audio.pause();
    this.audio.src = '';
    window.removeEventListener('pointerdown', this.retryAfterGesture);
    window.removeEventListener('keydown', this.retryAfterGesture);
  }

  private readonly retryAfterGesture = (): void => {
    if (this.context !== 'none' && !this.started) void this.play();
  };

  private chooseNextTrack(): void {
    const tracks = this.context === 'island' ? ISLAND_TRACKS : SAILING_TRACKS;
    const offset = Math.floor(this.random() * tracks.length);
    this.trackIndex = (this.trackIndex + 1 + offset) % tracks.length;
    this.audio.src = tracks[this.trackIndex];
  }

  private async play(): Promise<void> {
    try {
      await this.audio.play();
      this.started = true;
    } catch {
      // รอ gesture ถัดไปแทนการแสดง error เพราะ autoplay ถูก browser บล็อกได้ตามปกติ
      this.started = false;
    }
  }
}
