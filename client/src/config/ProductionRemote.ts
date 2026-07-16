const RENDER_GAME_ORIGIN = 'https://pirate-fruit-u555.onrender.com';
const RENDER_API_ORIGIN = 'https://pirate-fruit-server.onrender.com';

export function productionRemoteEnabled(): boolean {
  return typeof location !== 'undefined' && location.origin === RENDER_GAME_ORIGIN;
}

export function productionRemoteApiUrl(): string | undefined {
  return productionRemoteEnabled() ? RENDER_API_ORIGIN : undefined;
}
