import type { VersionResponse } from '@pirate-fruit/shared';

export interface RuntimeFeatures {
  boatWorld: boolean;
  sharedWorldMonsters: boolean;
}

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

/**
 * Read the Server's live feature state before choosing authoritative clients.
 * A missing feature field means the Server predates the handshake and must not
 * suppress the corresponding local fallback.
 */
export async function fetchRuntimeFeatures(
  apiUrl: string | null,
  fetcher: FetchLike = fetch,
): Promise<RuntimeFeatures | null> {
  if (!apiUrl) return null;
  try {
    const response = await fetcher(`${apiUrl.replace(/\/+$/, '')}/version`, {
      credentials: 'include',
      headers: { accept: 'application/json' },
    });
    if (!response.ok) return null;
    const payload = await response.json() as Partial<VersionResponse>;
    const features = payload.features as Partial<VersionResponse['features']> | undefined;
    if (!features || typeof features.boatWorld !== 'boolean') return null;
    return {
      boatWorld: features.boatWorld,
      sharedWorldMonsters: features.sharedWorldMonsters === true,
    };
  } catch {
    return null;
  }
}

/**
 * Build flags request a feature, while an explicit Server response decides if
 * the authoritative replacement is actually ready. Network failures retain the
 * build choice; an older Server response without the feature safely uses local
 * monsters instead of producing an empty world.
 */
export function resolveSharedMonsterMode(
  buildRequested: boolean,
  runtime: RuntimeFeatures | null,
): boolean {
  if (!buildRequested) return false;
  return runtime?.sharedWorldMonsters ?? true;
}
