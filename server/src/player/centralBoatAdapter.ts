import {
  AUTHORITATIVE_BOAT_DEFINITIONS,
  BOAT_PROGRESSION_DEFINITIONS,
  type BoatUpgradeKind,
} from '@pirate-fruit/shared';
import { serializePlayerState, type CanonicalBoat, type CanonicalPlayerState } from './playerState.js';

export type CentralBoatOperation =
  | { type: 'boatPurchase'; boatId: string }
  | { type: 'boatUpgrade'; boatId: string; kind: BoatUpgradeKind };

export type CentralBoatOutcome =
  | { ok: true; type: 'boatPurchase'; boatId: string; coins: number; owned: true }
  | { ok: true; type: 'boatUpgrade'; boatId: string; kind: BoatUpgradeKind; level: number; coins: number };

function clone(state: CanonicalPlayerState): CanonicalPlayerState {
  return structuredClone(state);
}

function operation(input: unknown): CentralBoatOperation {
  if (!input || typeof input !== 'object') throw new Error('BOAT_OPERATION_INVALID');
  const value = input as Record<string, unknown>;
  if (value.type === 'boatPurchase' && typeof value.boatId === 'string') {
    return { type: 'boatPurchase', boatId: value.boatId };
  }
  if (value.type === 'boatUpgrade' && typeof value.boatId === 'string'
    && (value.kind === 'hull' || value.kind === 'cannon' || value.kind === 'sail')) {
    return { type: 'boatUpgrade', boatId: value.boatId, kind: value.kind };
  }
  throw new Error('BOAT_OPERATION_INVALID');
}

function refreshCargo(state: CanonicalPlayerState): void {
  const active = state.boats.find((boat) => boat.active);
  state.cargo.maxSlots = active?.cargoCapacity ?? 8;
  state.cargo.maxWeight = active ? active.cargoCapacity * 15 : 120;
}

function makeBoat(boatId: string): CanonicalBoat {
  const progression = BOAT_PROGRESSION_DEFINITIONS[boatId];
  const physics = AUTHORITATIVE_BOAT_DEFINITIONS[boatId];
  if (!progression || !physics) throw new Error('BOAT_NOT_FOUND');
  return {
    definitionId: boatId as CanonicalBoat['definitionId'],
    name: progression.name,
    maxHp: physics.maxHp,
    cargoCapacity: progression.cargoCapacity,
    upgrades: { hull: 0, cannon: 0, sail: 0 },
    active: false,
  };
}

/** ใช้ราคาและเพดานจาก shared catalog เท่านั้น ไม่รับราคาหรือระดับจาก client */
export function applyCanonicalBoatOperation(
  current: CanonicalPlayerState,
  input: unknown,
): { state: CanonicalPlayerState; persisted: ReturnType<typeof serializePlayerState>; outcome: CentralBoatOutcome } {
  const request = operation(input);
  const state = clone(current);
  const definition = BOAT_PROGRESSION_DEFINITIONS[request.boatId];
  if (!definition || !AUTHORITATIVE_BOAT_DEFINITIONS[request.boatId]) throw new Error('BOAT_NOT_FOUND');
  const coins = state.progression.coins;
  if (!Number.isSafeInteger(coins) || coins < 0) throw new Error('CANONICAL_COINS_INVALID');

  if (request.type === 'boatPurchase') {
    if (state.boats.some((boat) => boat.definitionId === request.boatId)) throw new Error('BOAT_ALREADY_OWNED');
    if (coins < definition.price) throw new Error('INSUFFICIENT_COINS');
    state.boats = state.boats.map((boat) => ({ ...boat, active: false }));
    state.boats.push({ ...makeBoat(request.boatId), active: true });
    state.progression.coins = coins - definition.price;
    refreshCargo(state);
    const outcome: CentralBoatOutcome = { ok: true, type: 'boatPurchase', boatId: request.boatId, coins: state.progression.coins, owned: true };
    return { state, persisted: serializePlayerState(state), outcome };
  }

  const boat = state.boats.find((candidate) => candidate.definitionId === request.boatId);
  if (!boat) throw new Error('BOAT_NOT_OWNED');
  const level = boat.upgrades[request.kind];
  const price = definition.upgradeCosts[request.kind][level];
  if (price === undefined) throw new Error('BOAT_UPGRADE_MAX');
  if (coins < price) throw new Error('INSUFFICIENT_COINS');
  boat.upgrades[request.kind] = level + 1;
  if (request.kind === 'hull') boat.maxHp = Math.round(AUTHORITATIVE_BOAT_DEFINITIONS[request.boatId]!.maxHp * (1 + boat.upgrades.hull * 0.16));
  state.progression.coins = coins - price;
  const outcome: CentralBoatOutcome = { ok: true, type: 'boatUpgrade', boatId: request.boatId, kind: request.kind, level: boat.upgrades[request.kind], coins: state.progression.coins };
  return { state, persisted: serializePlayerState(state), outcome };
}
