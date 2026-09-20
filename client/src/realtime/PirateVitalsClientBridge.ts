import type { PlayerCombat } from '../combat/PlayerCombat';
import type { CharacterController } from '../player/CharacterController';
import type { SpawnManager } from '../world/SpawnManager';
import { PirateVitalsAuthority } from './PirateVitalsAuthority';

/** Applies a validated snapshot to presentation state; all local fallback writers stay disabled after claim. */
export function applyPirateVitalsSnapshot(
  authority: PirateVitalsAuthority,
  controller: CharacterController,
  combat: PlayerCombat,
  spawn: SpawnManager,
  value: unknown,
): boolean {
  if (!authority.apply(value)) return false;
  const snapshot = authority.snapshot!;
  controller.setServerVitalsAuthority(true);
  combat.setServerVitalsAuthority(true);
  spawn.setServerVitalsAuthority(true);
  combat.applyServerVitals(snapshot);
  if (snapshot.respawn && !snapshot.dead) {
    spawn.activateSpawnPoint(snapshot.respawn.spawnId);
    controller.teleport(snapshot.respawn.x, snapshot.respawn.y, snapshot.respawn.z);
    controller.heading = snapshot.respawn.heading;
  }
  return true;
}
