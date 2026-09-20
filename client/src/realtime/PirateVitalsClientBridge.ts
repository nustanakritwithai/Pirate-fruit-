import type { PlayerCombat } from '../combat/PlayerCombat';
import type { CharacterController } from '../player/CharacterController';
import type { SpawnManager } from '../world/SpawnManager';
import { PirateVitalsAuthority } from './PirateVitalsAuthority';

const lastAppliedRespawnRevision = new WeakMap<PirateVitalsAuthority, number>();
const serverDeathState = new WeakMap<PirateVitalsAuthority, {
  defeatPresented: boolean;
  respawnRequested: boolean;
  respawnInFlight: boolean;
  lastRespawnAttemptAt: number;
}>();

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
  const accepted = authority.apply(value);
  const current = authority.snapshot;
  // A repeated dead snapshot is still useful to retry a failed respawn RPC;
  // stale alive/other revisions remain rejected by the authority receiver.
  if (!accepted && (!current || !current.dead || !isSameRevision(value, current.revision))) return false;
  const snapshot = current!;
  controller.setServerVitalsAuthority(true);
  combat.setServerVitalsAuthority(true);
  spawn.setServerVitalsAuthority(true);
  if (accepted) combat.applyServerVitals(snapshot);
  const death = serverDeathState.get(authority) ?? {
    defeatPresented: false,
    respawnRequested: false,
    respawnInFlight: false,
    lastRespawnAttemptAt: 0,
  };
  if (snapshot.dead) {
    if (!death.defeatPresented) {
      death.defeatPresented = true;
      hooks.onServerDefeat?.();
    }
    const now = Date.now();
    const retryWindowOpen = death.lastRespawnAttemptAt === 0 || now - death.lastRespawnAttemptAt >= 2_000;
    if (hooks.requestRespawn && !death.respawnInFlight && retryWindowOpen) {
      death.respawnRequested = true;
      death.respawnInFlight = true;
      death.lastRespawnAttemptAt = now;
      void hooks.requestRespawn().then((ok) => {
        death.respawnInFlight = false;
        if (!ok) death.respawnRequested = false;
      }).catch(() => {
        death.respawnInFlight = false;
        death.respawnRequested = false;
      });
    }
  } else {
    death.defeatPresented = false;
    death.respawnRequested = false;
    death.respawnInFlight = false;
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

function isSameRevision(value: unknown, revision: number): boolean {
  return Boolean(value && typeof value === 'object'
    && typeof (value as Record<string, unknown>).revision === 'number'
    && (value as Record<string, unknown>).revision === revision);
}
