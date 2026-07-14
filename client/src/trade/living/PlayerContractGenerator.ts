import type { DynamicTradeOrder, EconomyWorldState } from './types';
import { PLAYER_CONTRACT_CONFIG } from './PlayerContractConfig';
import type { PlayerEconomyEvent, PlayerTradeContract } from './PlayerEconomyTypes';
import { ensurePlayerEconomy } from './PlayerEconomicProfileManager';

let contractCounter = 0;

export function resetContractCounter(): void {
  contractCounter = 0;
}

export function generatePlayerContracts(world: EconomyWorldState): PlayerEconomyEvent[] {
  const pe = ensurePlayerEconomy(world);
  const events: PlayerEconomyEvent[] = [];
  const cfg = PLAYER_CONTRACT_CONFIG;

  pe.availableContracts = pe.availableContracts.filter(
    (c) => c.status === 'available' && c.expiresAtTick > world.tick,
  );

  if (pe.availableContracts.length >= cfg.maxAvailableContracts) return events;

  for (const order of world.orders) {
    if (order.status !== 'open') continue;
    if (order.urgency * 100 < cfg.contractUrgencyThreshold) continue;
    if (order.requestedAmount < cfg.minimumOrderAmount) continue;
    if (order.expectedProfit < 5) continue;

    const already = pe.availableContracts.some((c) => c.sourceOrderId === order.id)
      || pe.activeContracts.some((c) => c.sourceOrderId === order.id);
    if (already) continue;

    if (pe.availableContracts.length >= cfg.maxAvailableContracts) break;

    const contract = buildContractFromOrder(world, order);
    if (!contract) continue;

    pe.availableContracts.push(contract);
    order.npcAssignableAfterTick = world.tick + cfg.npcAssignmentDelayTicks;

    events.push({
      type: 'PLAYER_CONTRACT_AVAILABLE',
      tick: world.tick,
      message: `สัญญาใหม่: ${contract.commodityId} ${contract.requestedAmount} หน่วย`,
      contractId: contract.id,
      commodityId: contract.commodityId,
    });
  }

  return events;
}

function buildContractFromOrder(
  world: EconomyWorldState,
  order: DynamicTradeOrder,
): PlayerTradeContract | null {
  const cfg = PLAYER_CONTRACT_CONFIG;
  const isEmergency = order.urgency * 100 >= cfg.emergencyUrgencyThreshold;
  const rewardMult = isEmergency ? cfg.emergencyRewardMultiplier : cfg.baseRewardMultiplier;
  const expiryTicks = isEmergency ? cfg.emergencyExpiryTicks : cfg.standardExpiryTicks;

  const baseReward = Math.round(order.expectedProfit * rewardMult);
  const urgencyBonus = Math.round(order.urgency * 200);
  const riskBonus = Math.round((order.riskCost ?? 0) * 2);
  const reputationBonus = isEmergency ? 50 : 0;
  const completionReward = baseReward + urgencyBonus + riskBonus + reputationBonus;
  const collateral = Math.max(0, Math.round(completionReward * cfg.collateralRate));

  contractCounter += 1;
  const contract: PlayerTradeContract = {
    id: `pcontract-${contractCounter}`,
    sourceOrderId: order.id,
    commodityId: order.commodityId,
    sourceIslandId: order.sourceIslandId,
    destinationIslandId: order.destinationIslandId,
    requestedAmount: order.requestedAmount,
    deliveredAmount: 0,
    baseReward,
    urgencyBonus,
    riskBonus,
    reputationBonus,
    completionReward,
    collateral,
    expiresAtTick: world.tick + expiryTicks,
    status: 'available',
    minimumDeliveryRatio: cfg.minimumDeliveryRatio,
    reservedForPlayer: false,
    createdTick: world.tick,
    npcAssignableAfterTick: world.tick + cfg.npcAssignmentDelayTicks,
    minimumTrust: isEmergency ? undefined : 35,
    minimumSupplierReputation: isEmergency ? undefined : 40,
    minimumContractReliability: isEmergency ? undefined : 50,
  };

  return contract;
}

export function getOrderPlayerReservedAmount(
  world: EconomyWorldState,
  orderId: string,
): number {
  const pe = ensurePlayerEconomy(world);
  let reserved = 0;
  for (const c of [...pe.activeContracts, ...pe.availableContracts]) {
    if (c.sourceOrderId === orderId && (c.status === 'accepted' || c.status === 'in-progress')) {
      reserved += c.requestedAmount - c.deliveredAmount;
    }
  }
  return reserved;
}

export function getNpcAssignableAmount(
  world: EconomyWorldState,
  order: DynamicTradeOrder,
): number {
  const reserved = getOrderPlayerReservedAmount(world, order.id);
  const delay = order.npcAssignableAfterTick ?? 0;
  if (world.tick < delay) {
    return Math.max(0, order.remainingAmount - reserved);
  }
  return Math.max(0, order.remainingAmount - reserved);
}
