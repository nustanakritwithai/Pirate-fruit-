/** Global simulation control — pause, speed, per-system freeze, step tick */
export class SimulationController {
  private _paused = false;
  private _speed = 1;
  private _freezeEconomy = false;
  private _freezeMonster = false;
  private _freezeDevilFruit = false;
  private _debugColors = false;
  private _stepPending = false;
  private _worldTick = 0;

  get paused(): boolean {
    return this._paused;
  }

  get speed(): number {
    return this._speed;
  }

  get freezeEconomy(): boolean {
    return this._freezeEconomy;
  }

  get freezeMonster(): boolean {
    return this._freezeMonster;
  }

  get freezeDevilFruit(): boolean {
    return this._freezeDevilFruit;
  }

  get debugColors(): boolean {
    return this._debugColors;
  }

  get worldTick(): number {
    return this._worldTick;
  }

  setPaused(paused: boolean): void {
    this._paused = paused;
  }

  togglePause(): void {
    this._paused = !this._paused;
  }

  setSpeed(speed: number): void {
    this._speed = Math.max(0.1, Math.min(100, speed));
  }

  setFreezeEconomy(freeze: boolean): void {
    this._freezeEconomy = freeze;
  }

  setFreezeMonster(freeze: boolean): void {
    this._freezeMonster = freeze;
  }

  setFreezeDevilFruit(freeze: boolean): void {
    this._freezeDevilFruit = freeze;
  }

  setDebugColors(enabled: boolean): void {
    this._debugColors = enabled;
  }

  /** Request one simulation step while paused */
  requestStep(): void {
    this._stepPending = true;
  }

  /** Scale dt by speed; returns 0 when paused unless step pending */
  scaleDelta(dt: number): number {
    if (this._paused) {
      if (this._stepPending) {
        this._stepPending = false;
        return dt;
      }
      return 0;
    }
    return dt * this._speed;
  }

  /** Whether a subsystem tick should run this frame */
  shouldTick(system: 'economy' | 'monster' | 'devilfruit'): boolean {
    if (this._paused && !this._stepPending) return false;
    if (system === 'economy' && this._freezeEconomy) return false;
    if (system === 'monster' && this._freezeMonster) return false;
    if (system === 'devilfruit' && this._freezeDevilFruit) return false;
    return true;
  }

  consumeStep(): boolean {
    if (!this._stepPending) return false;
    this._stepPending = false;
    return true;
  }

  bumpWorldTick(): void {
    this._worldTick += 1;
  }

  reset(): void {
    this._paused = false;
    this._speed = 1;
    this._freezeEconomy = false;
    this._freezeMonster = false;
    this._freezeDevilFruit = false;
    this._debugColors = false;
    this._stepPending = false;
    this._worldTick = 0;
  }
}
