export interface GameStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  /** Repository-backed storage can force pending remote documents before an authority intent. */
  flush?(): Promise<void>;
}

class BrowserGameStorage implements GameStorage {
  private resolve(): Storage | null {
    try {
      return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage;
    } catch {
      return null;
    }
  }

  getItem(key: string): string | null {
    try {
      return this.resolve()?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  setItem(key: string, value: string): void {
    try {
      this.resolve()?.setItem(key, value);
    } catch {
      // Storage can be unavailable or full. Gameplay continues in memory.
    }
  }

  removeItem(key: string): void {
    try {
      this.resolve()?.removeItem(key);
    } catch {
      // Storage can be unavailable. Nothing else to remove.
    }
  }
}

const browserStorage = new BrowserGameStorage();
let configuredStorage: GameStorage | null = null;

export function gameStorage(): GameStorage {
  return configuredStorage ?? browserStorage;
}

export function configureGameStorage(storage: GameStorage): void {
  configuredStorage = storage;
}

export function browserGameStorage(): GameStorage {
  return browserStorage;
}

export function resetGameStorageForTests(): void {
  configuredStorage = null;
}
