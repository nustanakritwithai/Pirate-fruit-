import type { PlayerCombat } from '../combat/PlayerCombat';
import type { CharacterController } from '../player/CharacterController';
import type { SpawnManager } from '../world/SpawnManager';
import { PirateVitalsAuthority } from './PirateVitalsAuthority';

const lastAppliedRespawnRevision = new WeakMap<PirateVitalsAuthority, number>();
const serverDeathState = new WeakMap<PirateVitalsAuthority, { respawnRequested: boolean }>();

/** Applies a validated snapshot to presentation state; all local fallback writers stay disabled after claim. */
export function applyPirateVitalsSnapshot(
  authority: PirateVitalsAuthority,
  controller: CharacterController,
  combat: PlayerCombat,
  spawn: SpawnManager,
  value: unknown,
  hooks: {
    onServerDefeat?: () => void;
    requestRespawn?: () => Promise<boolean>;
  } = {},
): boolean {
  if (!authority.apply(value)) return false;
  const snapshot = authority.snapshot!;
  controller.setServerVitalsAuthority(true);
  combat.setServerVitalsAuthority(true);
  spawn.setServerVitalsAuthority(true);
  combat.applyServerVitals(snapshot);
  const death = serverDeathState.get(authority) ?? { respawnRequested: false };
  if (snapshot.dead) {
    if (!death.respawnRequested) {
      death.respawnRequested = true;
      hooks.onServerDefeat?.();
      if (hooks.requestRespawn) void hooks.requestRespawn().catch(() => undefined);
    }
  } else {
    death.respawnRequested = false;
  }
  serverDeathState.set(authority, death);
  if (snapshot.respawn && !snapshot.dead
    && snapshot.respawn.atRevision > (lastAppliedRespawnRevision.get(authority) ?? -1)) {
    lastAppliedRespawnRevision.set(authority, snapshot.respawn.atRevision);
    spawn.activateSpawnPoint(snapshot.respawn.spawnId);
    controller.teleport(snapshot.respawn.x, snapshot.respawn.y, snapshot.respawn.z);
    controller.heading = snapshot.respawn.heading;
  }
  return true;
}
