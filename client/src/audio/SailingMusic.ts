const SAILING_TRACKS = [
  '/assets/audio/sailing/moon-pirate-treasure-01.mp3',
  '/assets/audio/sailing/moon-pirate-treasure-02.mp3',
] as const;

/**
 * เพลงเดินเรือแบบ client-only: เริ่มเฉพาะเมื่อผู้เล่นคุมหางเสือ และค่อย ๆ เบาเมื่อหยุดเรือ.
 * ไม่เก็บ state ลง save จึงไม่กระทบ local/remote authority หรือการกู้ save เดิม.
 */
export class SailingMusic {
  private readonly audio: HTMLAudioElement;
  private isSailing = false;
  private started = false;
  private trackIndex = -1;
  private targetVolume = 0;

  constructor(private readonly random: () => number = Math.random) {
    this.audio = new Audio();
    this.audio.loop = false;
    this.audio.preload = 'metadata';
    this.audio.volume = 0;
    this.audio.addEventListener('ended', () => {
      if (!this.isSailing) return;
      this.chooseNextTrack();
      void this.play();
    });
    // Mobile browsers need a real gesture before sound may start. This is a one-shot retry.
    window.addEventListener('pointerdown', this.retryAfterGesture, { passive: true });
    window.addEventListener('keydown', this.retryAfterGesture);
  }

  setSailing(isSailing: boolean): void {
    this.isSailing = isSailing;
    this.targetVolume = isSailing ? 0.32 : 0;
    if (isSailing && !this.started) {
      this.chooseNextTrack();
      void this.play();
    }
  }

  update(dt: number): void {
    const change = Math.min(1, dt * 1.5);
    this.audio.volume += (this.targetVolume - this.audio.volume) * change;
    if (!this.isSailing && this.audio.volume < 0.01 && !this.audio.paused) {
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
    if (this.isSailing && !this.started) void this.play();
  };

  private chooseNextTrack(): void {
    const offset = Math.floor(this.random() * SAILING_TRACKS.length);
    this.trackIndex = (this.trackIndex + 1 + offset) % SAILING_TRACKS.length;
    this.audio.src = SAILING_TRACKS[this.trackIndex];
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
