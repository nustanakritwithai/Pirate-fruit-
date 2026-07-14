import type { IslandId } from '../../island/IslandTypes';
import type { EconomyWorldState, LivingCommodityId } from './types';
import { CELL_TO_GAME_ISLAND } from './LivingTradeConfig';
import { PLAYER_CONTRACT_CONFIG } from './PlayerContractConfig';
import { PLAYER_REPUTATION_CONFIG } from './PlayerReputationConfig';
import { ensurePlayerEconomy } from './PlayerEconomicProfileManager';
import {
  clampRep,
  getOrCreateIslandReputation,
  resolveEconomicTitle,
} from './PlayerReputationManager';
import type {
  PlayerEconomyEvent,
  PlayerTradeContract,
} from './PlayerEconomyTypes';
import { DEFAULT_PLAYER_ID } from './PlayerEconomyTypes';
import { trimContractHistory } from './PlayerEconomyHistory';

export interface ContractWallet {
  coins: number;
  spendCoins(amount: number, reason: string): boolean;
  addCoins(amount: number, reason: string): void;
}

export interface AcceptContractResult {
  ok: boolean;
  message: string;
  events: PlayerEconomyEvent[];
}

export function acceptContract(
  world: EconomyWorldState,
  contractId: string,
  wallet: ContractWallet,
  playerId = DEFAULT_PLAYER_ID,
  playerAmount?: number,
): AcceptContractResult {
  const pe = ensurePlayerEconomy(world);
  const profile = pe.profile;
  const events: PlayerEconomyEvent[] = [];
  const cfg = PLAYER_CONTRACT_CONFIG;

  if (profile.activeContractIds.length >= cfg.maxActiveContractsPerPlayer) {
    return { ok: false, message: 'รับสัญญาได้สูงสุด 2 ฉบับ', events };
  }

  const idx = pe.availableContracts.findIndex((c) => c.id === contractId);
  if (idx < 0) {
    return { ok: false, message: 'ไม่พบสัญญา', events };
  }

  const contract = pe.availableContracts[idx];
  if (contract.status !== 'available' || contract.expiresAtTick <= world.tick) {
    return { ok: false, message: 'สัญญาหมดอายุแล้ว', events };
  }

  const destIsland = CELL_TO_GAME_ISLAND[contract.destinationIslandId];
  const rep = getOrCreateIslandReputation(profile, destIsland);

  if (contract.minimumTrust != null && rep.trust < contract.minimumTrust) {
    return { ok: false, message: `ต้องการ trust ≥ ${contract.minimumTrust}`, events };
  }
  if (contract.minimumSupplierReputation != null
    && rep.supplierReputation < contract.minimumSupplierReputation) {
    return { ok: false, message: 'ชื่อเสียงผู้จัดหาไม่เพียงพอ', events };
  }
  if (contract.minimumContractReliability != null
    && rep.contractReliability < contract.minimumContractReliability) {
    return { ok: false, message: 'ความน่าเชื่อถือสัญญาไม่เพียงพอ', events };
  }

  if (contract.collateral > 0 && wallet.coins < contract.collateral) {
    return { ok: false, message: `ต้องการ collateral ${contract.collateral} Beli`, events };
  }

  const order = world.orders.find((o) => o.id === contract.sourceOrderId);
  if (!order || order.status === 'completed' || order.status === 'expired') {
    return { ok: false, message: 'คำสั่งขนส่งต้นทางไม่พร้อม', events };
  }

  const share = playerAmount ?? contract.requestedAmount;
  const maxShare = Math.min(share, order.remainingAmount);
  if (maxShare < cfg.minimumOrderAmount) {
    return { ok: false, message: 'จำนวนสินค้าไม่เพียงพอใน order', events };
  }

  if (contract.collateral > 0 && !wallet.spendCoins(contract.collateral, `contract:collateral:${contract.id}`)) {
    return { ok: false, message: 'หัก collateral ไม่สำเร็จ', events };
  }

  contract.requestedAmount = maxShare;
  contract.playerId = playerId;
  contract.status = 'accepted';
  contract.acceptedTick = world.tick;
  contract.reservedForPlayer = true;
  contract.expiresAtTick = world.tick + cfg.standardExpiryTicks;

  order.playerReservedAmount = (order.playerReservedAmount ?? 0) + maxShare;
  order.playerContractId = contract.id;

  pe.availableContracts.splice(idx, 1);
  pe.activeContracts.push(contract);
  profile.activeContractIds.push(contract.id);

  events.push({
    type: 'PLAYER_CONTRACT_ACCEPTED',
    tick: world.tick,
    message: `รับสัญญา ${contract.commodityId} ${maxShare} หน่วย`,
    contractId: contract.id,
    commodityId: contract.commodityId,
  });

  return { ok: true, message: 'รับสัญญาสำเร็จ', events };
}

export function abandonContract(
  world: EconomyWorldState,
  contractId: string,
  wallet: ContractWallet,
  playerId = DEFAULT_PLAYER_ID,
): AcceptContractResult {
  const pe = ensurePlayerEconomy(world);
  const profile = pe.profile;
  const events: PlayerEconomyEvent[] = [];

  const idx = pe.activeContracts.findIndex((c) => c.id === contractId && c.playerId === playerId);
  if (idx < 0) {
    return { ok: false, message: 'ไม่พบสัญญาที่รับอยู่', events };
  }

  const contract = pe.activeContracts[idx];
  releaseOrderReservation(world, contract);
  contract.status = 'abandoned';
  profile.abandonedContracts += 1;
  profile.activeContractIds = profile.activeContractIds.filter((id) => id !== contractId);

  if (contract.collateral > 0) {
    wallet.addCoins(Math.round(contract.collateral * 0.5), `contract:abandon-refund:${contract.id}`);
  }

  pe.activeContracts.splice(idx, 1);
  pe.contractHistory.unshift(contract);
  trimContractHistory(pe);

  events.push({
    type: 'PLAYER_CONTRACT_ABANDONED',
    tick: world.tick,
    message: 'ยกเลิกสัญญา',
    contractId: contract.id,
  });

  return { ok: true, message: 'ยกเลิกสัญญาแล้ว', events };
}

export function onPlayerSellForContracts(
  world: EconomyWorldState,
  islandId: IslandId,
  commodityId: LivingCommodityId,
  amount: number,
  playerId = DEFAULT_PLAYER_ID,
  wallet?: ContractWallet,
): PlayerEconomyEvent[] {
  const pe = ensurePlayerEconomy(world);
  const events: PlayerEconomyEvent[] = [];

  for (const contract of pe.activeContracts) {
    if (contract.playerId !== playerId) continue;
    if (contract.commodityId !== commodityId) continue;
    const destIsland = CELL_TO_GAME_ISLAND[contract.destinationIslandId];
    if (destIsland !== islandId) continue;
    if (contract.status !== 'accepted' && contract.status !== 'in-progress') continue;

    const remaining = contract.requestedAmount - contract.deliveredAmount;
    const delivered = Math.min(amount, remaining);
    if (delivered <= 0) continue;

    contract.deliveredAmount += delivered;
    contract.status = 'in-progress';

    events.push({
      type: 'PLAYER_CONTRACT_PROGRESS',
      tick: world.tick,
      message: `ส่งมอบ ${delivered}/${contract.requestedAmount}`,
      contractId: contract.id,
      commodityId,
    });

    const ratio = contract.deliveredAmount / contract.requestedAmount;
    if (ratio >= contract.minimumDeliveryRatio) {
      const completeEvents = completeContract(world, contract, playerId, wallet);
      events.push(...completeEvents);
    }
  }

  return events;
}

function completeContract(
  world: EconomyWorldState,
  contract: PlayerTradeContract,
  _playerId: string,
  wallet?: ContractWallet,
): PlayerEconomyEvent[] {
  const pe = ensurePlayerEconomy(world);
  const profile = pe.profile;
  const events: PlayerEconomyEvent[] = [];
  const cfg = PLAYER_REPUTATION_CONFIG;

  const ratio = contract.deliveredAmount / contract.requestedAmount;
  const isPerfect = ratio >= 1;
  let reward = contract.completionReward;
  if (isPerfect) {
    reward = Math.round(reward * (1 + cfg.perfectDeliveryBonus));
  } else if (ratio < 1) {
    reward = Math.round(reward * ratio * (1 - cfg.partialDeliveryPenalty));
  }

  if (wallet) {
    wallet.addCoins(reward, `contract:complete:${contract.id}`);
    if (contract.collateral > 0) {
      wallet.addCoins(contract.collateral, `contract:collateral-return:${contract.id}`);
    }
  }

  profile.lifetimeProfit += reward;
  profile.completedContracts += 1;
  profile.completedContractIds.push(contract.id);
  profile.activeContractIds = profile.activeContractIds.filter((id) => id !== contract.id);

  const destIsland = CELL_TO_GAME_ISLAND[contract.destinationIslandId];
  const rep = getOrCreateIslandReputation(profile, destIsland);
  rep.trust = clampRep(rep.trust + cfg.contractCompleteTrustGain);
  rep.contractReliability = clampRep(rep.contractReliability + cfg.contractCompleteReliabilityGain);
  rep.completedContracts += 1;
  rep.title = resolveEconomicTitle(rep, profile);

  contract.status = 'completed';
  releaseOrderReservation(world, contract);

  const order = world.orders.find((o) => o.id === contract.sourceOrderId);
  if (order && order.status === 'open') {
    order.urgency = Math.min(1, order.urgency);
  }

  pe.activeContracts = pe.activeContracts.filter((c) => c.id !== contract.id);
  pe.contractHistory.unshift(contract);
  trimContractHistory(pe);

  events.push({
    type: 'PLAYER_CONTRACT_COMPLETED',
    tick: world.tick,
    message: `ส่งสัญญาสำเร็จ +${reward} Beli`,
    contractId: contract.id,
    commodityId: contract.commodityId,
  });

  return events;
}

function failContract(
  world: EconomyWorldState,
  contract: PlayerTradeContract,
  _wallet?: ContractWallet,
): PlayerEconomyEvent[] {
  const pe = ensurePlayerEconomy(world);
  const profile = pe.profile;
  const events: PlayerEconomyEvent[] = [];
  const cfg = PLAYER_REPUTATION_CONFIG;

  profile.failedContracts += 1;
  profile.activeContractIds = profile.activeContractIds.filter((id) => id !== contract.id);

  const destIsland = CELL_TO_GAME_ISLAND[contract.destinationIslandId];
  const rep = getOrCreateIslandReputation(profile, destIsland);
  rep.trust = clampRep(rep.trust - cfg.contractFailTrustLoss);
  rep.contractReliability = clampRep(rep.contractReliability - cfg.contractFailReliabilityLoss);
  rep.failedContracts += 1;
  rep.title = resolveEconomicTitle(rep, profile);

  contract.status = 'failed';
  releaseOrderReservation(world, contract);

  const order = world.orders.find((o) => o.id === contract.sourceOrderId);
  if (order) {
    order.urgency = Math.min(1, order.urgency + 0.15);
    order.playerReservedAmount = Math.max(0, (order.playerReservedAmount ?? 0) - contract.requestedAmount);
  }

  pe.activeContracts = pe.activeContracts.filter((c) => c.id !== contract.id);
  pe.contractHistory.unshift(contract);
  trimContractHistory(pe);

  events.push({
    type: 'PLAYER_CONTRACT_FAILED',
    tick: world.tick,
    message: 'สัญญาล้มเหลว',
    contractId: contract.id,
  });

  return events;
}

function releaseOrderReservation(world: EconomyWorldState, contract: PlayerTradeContract): void {
  const order = world.orders.find((o) => o.id === contract.sourceOrderId);
  if (!order) return;
  const undelivered = contract.requestedAmount - contract.deliveredAmount;
  order.playerReservedAmount = Math.max(0, (order.playerReservedAmount ?? 0) - undelivered);
  if (order.playerContractId === contract.id) {
    order.playerContractId = undefined;
  }
}

export function tickPlayerContracts(
  world: EconomyWorldState,
  wallet?: ContractWallet,
): PlayerEconomyEvent[] {
  const pe = ensurePlayerEconomy(world);
  const events: PlayerEconomyEvent[] = [];

  for (const contract of [...pe.activeContracts]) {
    if (contract.expiresAtTick <= world.tick) {
      const ratio = contract.deliveredAmount / contract.requestedAmount;
      if (ratio >= contract.minimumDeliveryRatio) {
        events.push(...completeContract(world, contract, contract.playerId ?? DEFAULT_PLAYER_ID, wallet));
      } else {
        events.push(...failContract(world, contract, wallet));
      }
    }
  }

  for (const contract of [...pe.availableContracts]) {
    if (contract.expiresAtTick <= world.tick) {
      contract.status = 'expired';
      pe.availableContracts = pe.availableContracts.filter((c) => c.id !== contract.id);
      const order = world.orders.find((o) => o.id === contract.sourceOrderId);
      if (order) order.npcAssignableAfterTick = world.tick;
      events.push({
        type: 'PLAYER_CONTRACT_EXPIRED',
        tick: world.tick,
        message: 'สัญญาหมดอายุ',
        contractId: contract.id,
      });
    }
  }

  return events;
}

export function completeContractWithWallet(
  world: EconomyWorldState,
  contractId: string,
  wallet: ContractWallet,
  playerId = DEFAULT_PLAYER_ID,
): PlayerEconomyEvent[] {
  const pe = ensurePlayerEconomy(world);
  const contract = pe.activeContracts.find((c) => c.id === contractId && c.playerId === playerId);
  if (!contract) return [];
  contract.deliveredAmount = contract.requestedAmount;
  return completeContract(world, contract, playerId, wallet);
}

export function failContractDebug(
  world: EconomyWorldState,
  contractId: string,
): PlayerEconomyEvent[] {
  const pe = ensurePlayerEconomy(world);
  const contract = pe.activeContracts.find((c) => c.id === contractId);
  if (!contract) return [];
  return failContract(world, contract);
}
