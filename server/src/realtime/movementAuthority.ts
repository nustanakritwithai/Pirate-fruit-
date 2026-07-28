import { WORLD_SAFE_ZONES } from '@pirate-fruit/shared';
import type { Pool } from 'pg';

export interface MovementPosition {
  islandId: string;
  x: number;
  y: number;
  z: number;
  heading: number;
}

export interface MovementAnchorProvider {
  anchor(characterId: string): Promise<MovementPosition>;
}

export type MovementDecision =
  | { accepted: true; position: MovementPosition }
  | {
      accepted: false;
      position: MovementPosition;
      reason: 'initial-anchor' | 'speed' | 'island';
    };

interface MovementState {
  position: MovementPosition;
  budget: number;
  lastMoveAt: number;
  disconnectedAt: number | null;
}

/** Fast enough for every legitimate dash/skill burst, but not arbitrary teleporting. */
export const PLAYER_MAX_MOVEMENT_SPEED = 32;
export const PLAYER_MOVEMENT_BURST_DISTANCE = 8;
const PLAYER_MAX_VERTICAL_SPEED = 32;
const PLAYER_VERTICAL_BURST_DISTANCE = 6;
const MOVEMENT_STATE_RETENTION_MS = 15 * 60_000;

function clone(position: MovementPosition): MovementPosition {
  return { ...position };
}

/**
 * Canonical on-foot position. The client supplies a desired position; this class
 * advances toward it only within a Server-owned speed budget and never accepts a
 * client-selected island transition.
 */
export class MovementAuthority {
  private readonly states = new Map<string, MovementState>();

  has(characterId: string): boolean {
    return this.states.has(characterId);
  }

  connect(characterId: string): boolean {
    const state = this.states.get(characterId);
    if (!state) return false;
    state.disconnectedAt = null;
    return true;
  }

  seed(characterId: string, position: MovementPosition, now: number): void {
    if (this.states.has(characterId)) return;
    this.states.set(characterId, {
      position: clone(position),
      budget: PLAYER_MOVEMENT_BURST_DISTANCE,
      lastMoveAt: now,
      disconnectedAt: null,
    });
  }

  setAuthoritative(characterId: string, position: MovementPosition, now: number): void {
    this.states.set(characterId, {
      position: clone(position),
      budget: PLAYER_MOVEMENT_BURST_DISTANCE,
      lastMoveAt: now,
      disconnectedAt: null,
    });
  }

  move(characterId: string, requested: MovementPosition, now: number): MovementDecision {
    const state = this.states.get(characterId);
    if (!state) {
      this.seed(characterId, requested, now);
      return { accepted: true, position: clone(requested) };
    }
    state.disconnectedAt = null;
    const elapsedMs = Math.max(0, Math.min(5_000, now - state.lastMoveAt));
    state.lastMoveAt = now;
    state.budget = Math.min(
      PLAYER_MOVEMENT_BURST_DISTANCE,
      state.budget + elapsedMs * PLAYER_MAX_MOVEMENT_SPEED / 1_000,
    );

    if (requested.islandId !== state.position.islandId) {
      return { accepted: false, position: clone(state.position), reason: 'island' };
    }

    const dx = requested.x - state.position.x;
    const dz = requested.z - state.position.z;
    const horizontalDistance = Math.hypot(dx, dz);
    const verticalBudget = PLAYER_VERTICAL_BURST_DISTANCE
      + elapsedMs * PLAYER_MAX_VERTICAL_SPEED / 1_000;
    const verticalDistance = Math.abs(requested.y - state.position.y);
    if (horizontalDistance <= state.budget + 1e-6 && verticalDistance <= verticalBudget) {
      state.budget = Math.max(0, state.budget - horizontalDistance);
      state.position = clone(requested);
      return { accepted: true, position: clone(state.position) };
    }

    const horizontalStep = Math.min(horizontalDistance, state.budget);
    const ratio = horizontalDistance > 0 ? horizontalStep / horizontalDistance : 0;
    const yDelta = Math.max(
      -verticalBudget,
      Math.min(verticalBudget, requested.y - state.position.y),
    );
    state.position = {
      islandId: state.position.islandId,
      x: state.position.x + dx * ratio,
      y: state.position.y + yDelta,
      z: state.position.z + dz * ratio,
      heading: requested.heading,
    };
    state.budget = Math.max(0, state.budget - horizontalStep);
    return { accepted: false, position: clone(state.position), reason: 'speed' };
  }

  positionOf(characterId: string): MovementPosition | null {
    const state = this.states.get(characterId);
    return state ? clone(state.position) : null;
  }

  disconnect(characterId: string, now: number): void {
    const state = this.states.get(characterId);
    if (state) state.disconnectedAt = now;
  }

  prune(now: number): void {
    for (const [characterId, state] of this.states) {
      if (
        state.disconnectedAt !== null
        && now - state.disconnectedAt >= MOVEMENT_STATE_RETENTION_MS
      ) {
        this.states.delete(characterId);
      }
    }
  }
}

interface AnchorRow {
  current_island_id: string;
  position_json: unknown;
  heading: number | null;
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function fallbackAnchor(islandId: string): MovementPosition {
  const spawn = WORLD_SAFE_ZONES.find(
    (zone) => zone.islandId === islandId && zone.kind === 'spawn',
  ) ?? WORLD_SAFE_ZONES[0]!;
  return {
    islandId: spawn.islandId,
    x: spawn.x,
    y: 0,
    z: spawn.z,
    heading: 0,
  };
}

/** Seeds movement from Server-owned checkpoint storage, never from the first move packet. */
export class PostgresMovementAnchorProvider implements MovementAnchorProvider {
  constructor(private readonly pool: Pool) {}

  async anchor(characterId: string): Promise<MovementPosition> {
    const result = await this.pool.query<AnchorRow>(
      `select c.current_island_id, p.position_json, p.heading
         from characters c
         left join player_checkpoints p on p.character_id = c.id
        where c.id = $1
        limit 1`,
      [characterId],
    );
    const row = result.rows[0];
    const fallback = fallbackAnchor(row?.current_island_id ?? 'starter-island');
    if (!row || !row.position_json || typeof row.position_json !== 'object') return fallback;
    const input = row.position_json as Record<string, unknown>;
    const x = finite(input.x);
    const y = finite(input.y);
    const z = finite(input.z);
    if (x === null || y === null || z === null) return fallback;
    return {
      islandId: row.current_island_id,
      x,
      y,
      z,
      heading: finite(row.heading) ?? 0,
    };
  }
}
