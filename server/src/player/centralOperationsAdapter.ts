import { createHash } from 'node:crypto';
import { z } from 'zod';
import { QUEST_PROTOCOL_SCHEMA_VERSION } from '@pirate-fruit/shared';
import { CentralQuestAdapter } from '../quest/centralQuestAdapter.js';
import { applyCanonicalShopOperation } from '../shop/centralShopAdapter.js';
import { applyCanonicalStateOperation } from './centralStateAdapter.js';
import { applyCanonicalBoatOperation } from './centralBoatAdapter.js';
import { serializePlayerState, type CanonicalPlayerState } from './playerState.js';
import { applyCanonicalVitalsOperation, type PveVitalsContext } from './vitalsRules.js';

type Receipt = { key: string; hash: string; outcome: unknown };
type OperationState = CanonicalPlayerState & { operationReceipts?: Receipt[]; questClaimReceipts?: Receipt[] };
const identifier = z.string().min(1).max(128);
const key = z.string().regex(/^[A-Za-z0-9:_-]{8,128}$/);
const schema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('questState') }).strict(),
  z.object({ type: z.literal('questProgress') }).strict(),
  z.object({ type: z.literal('questAbandon') }).strict(),
  z.object({ type: z.literal('questAccept'), questId: identifier, replaceActive: z.boolean() }).strict(),
  z.object({ type: z.literal('questClaim'), questId: identifier, idempotencyKey: key }).strict(),
  z.object({ type: z.literal('shopPurchase'), action: z.enum(['draw', 'potion']), potionId: z.enum(['potion-hp', 'potion-mp']).optional(), idempotencyKey: key }).strict(),
  z.object({ type: z.literal('boatPurchase'), boatId: identifier, idempotencyKey: key }).strict(),
  z.object({ type: z.literal('boatUpgrade'), boatId: identifier, kind: z.enum(['hull', 'cannon', 'sail']), idempotencyKey: key }).strict(),
  z.object({ type: z.literal('vitalsPotion'), potionId: z.enum(['potion-hp', 'potion-mp']), idempotencyKey: key }).strict(),
  z.object({ type: z.literal('vitalsBuff'), skillId: identifier, idempotencyKey: key }).strict(),
  z.object({ type: z.literal('vitalsSkill'), skillId: identifier, idempotencyKey: key }).strict(),
  z.object({ type: z.literal('vitalsRespawn'), idempotencyKey: key }).strict(),
]);
const quests = new CentralQuestAdapter();

/** ใช้บริการเดิมเตรียม state; C# ต้อง commit CAS ก่อนส่งผลให้ผู้เล่น */
export function applyCentralOperation(current: OperationState, input: unknown, commandId?: string,
  position?: { islandId: string; x: number; y: number; z: number; heading: number } | null,
  vitalsContext?: PveVitalsContext) {
  const type = (input as { type?: unknown } | null)?.type;
  if (typeof type !== 'string' || (!type.startsWith('quest') && !type.startsWith('vitals') && !['shopPurchase', 'boatPurchase', 'boatUpgrade'].includes(type))) {
    return applyCanonicalStateOperation(current, input, position);
  }
  if (!commandId || !/^[A-Za-z0-9_-]{16,128}$/.test(commandId)) throw new Error('COMMAND_ID_INVALID');
  const operation = schema.parse(input);
  const hash = createHash('sha256').update(JSON.stringify(operation)).digest('hex');
  const prior = current.operationReceipts?.find(receipt => receipt.key === commandId);
  if (prior) {
    if (prior.hash !== hash) throw new Error('IDEMPOTENCY_KEY_REUSED');
    return { state: structuredClone(current), persisted: serializePlayerState(current), outcome: structuredClone(prior.outcome) };
  }
  let state: OperationState = structuredClone(current);
  let outcome: unknown;
  if (operation.type === 'vitalsPotion' || operation.type === 'vitalsBuff' || operation.type === 'vitalsSkill' || operation.type === 'vitalsRespawn') {
    if (!vitalsContext) throw new Error('VITALS_CONTEXT_REQUIRED');
    const vitalsOperation = operation.type === 'vitalsPotion'
      ? { type: 'potion' as const, potionId: operation.potionId, idempotencyKey: operation.idempotencyKey }
      : operation.type === 'vitalsBuff'
        ? { type: 'buff' as const, skillId: operation.skillId, idempotencyKey: operation.idempotencyKey }
        : operation.type === 'vitalsSkill'
          ? { type: 'skill' as const, skillId: operation.skillId, idempotencyKey: operation.idempotencyKey }
          : { type: 'respawn' as const, idempotencyKey: operation.idempotencyKey };
    const result = applyCanonicalVitalsOperation(state, vitalsOperation, vitalsContext);
    state = result.state; outcome = result.outcome;
  } else if (operation.type === 'boatPurchase' || operation.type === 'boatUpgrade') {
    const result = applyCanonicalBoatOperation(state, operation);
    state = result.state; outcome = result.outcome;
  } else if (operation.type === 'shopPurchase') {
    const { type: _type, ...request } = operation;
    const result = applyCanonicalShopOperation(state, request);
    state = result.state; outcome = result.outcome;
  } else if (operation.type === 'questState' || operation.type === 'questProgress') {
    const snapshot = quests.state(state);
    // progress จาก client เป็นเพียงการขออ่าน ผลฆ่าจริงเพิ่มใน reward transaction เท่านั้น
    outcome = operation.type === 'questState' ? snapshot : { ok: true, schemaVersion: QUEST_PROTOCOL_SCHEMA_VERSION,
      questId: snapshot.active?.questId ?? null, progress: snapshot.active?.progress ?? [], completed: snapshot.active?.status === 'completed' };
  } else if (operation.type === 'questAccept') {
    const result = quests.accept(state, operation.questId, operation.replaceActive);
    state = result.state; outcome = { ...result.result, schemaVersion: QUEST_PROTOCOL_SCHEMA_VERSION };
  } else if (operation.type === 'questAbandon') {
    const result = quests.abandon(state); state = result.state; outcome = result.result;
  } else {
    const receipt = state.questClaimReceipts?.find(value => value.key === operation.idempotencyKey);
    if (receipt && receipt.hash !== hash) throw new Error('IDEMPOTENCY_KEY_REUSED');
    if (receipt) outcome = structuredClone(receipt.outcome);
    else {
      const result = quests.claim(state, operation.questId);
      state = result.state; outcome = result.result;
      state.questClaimReceipts = [...(state.questClaimReceipts ?? []), { key: operation.idempotencyKey, hash, outcome }].slice(-256);
    }
  }
  state.operationReceipts = [...(state.operationReceipts ?? []), { key: commandId, hash, outcome }].slice(-256);
  return { state, persisted: serializePlayerState(state), outcome };
}
