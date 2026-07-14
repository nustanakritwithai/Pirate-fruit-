import type { IslandId } from '../../island/IslandTypes';
import {
  LIVING_COMMODITY_IDS,
  LIVING_TRADE_CONFIG,
  createInitialWorld,
  isLivingCommodity,
} from './LivingTradeConfig';
import {
  calculateMarketPrice,
  livingBuyPrice,
  livingSellPrice,
  marketImpact,
  marketSaturation,
} from './LivingTradeFormulas';
import { generateNewsFromTick } from './LivingTradeNews';
import type {
  CommodityState,
  LivingCommodityId,
  TradeIslandState,
  TradeNewsItem,
  TradeRouteState,
  TradeShip,
  TradeWorldState,
} from './types';

let shipCounter = 0;

export class LivingTradeSimulator {
  private world: TradeWorldState;

  constructor() {
    const { islands, routes } = createInitialWorld();
    this.world = { tick: 0, islands, routes, ships: [], news: [] };
    this.refreshAllPrices();
  }

  get state(): Readonly<TradeWorldState> {
    return this.world;
  }

  get news(): readonly TradeNewsItem[] {
    return this.world.news;
  }

  getIsland(islandId: IslandId): TradeIslandState | undefined {
    return this.world.islands.find((i) => i.id === islandId);
  }

  getCommodity(islandId: IslandId, commodityId: LivingCommodityId): CommodityState | undefined {
    return this.getIsland(islandId)?.commodities[commodityId];
  }

  isLivingCommodity(id: string): id is LivingCommodityId {
    return isLivingCommodity(id);
  }

  getBuyPrice(islandId: IslandId, commodityId: string, amount = 1): number | null {
    if (!isLivingCommodity(commodityId)) return null;
    const item = this.getCommodity(islandId, commodityId);
    if (!item) return null;
    return livingBuyPrice(item, marketImpact(amount));
  }

  getSellPrice(islandId: IslandId, commodityId: string, amount = 1): number | null {
    if (!isLivingCommodity(commodityId)) return null;
    const item = this.getCommodity(islandId, commodityId);
    if (!item) return null;
    return livingSellPrice(item, marketSaturation(amount, item.stock));
  }

  getStock(islandId: IslandId, commodityId: string): number | null {
    if (!isLivingCommodity(commodityId)) return null;
    return this.getCommodity(islandId, commodityId)?.stock ?? null;
  }

  /** ผู้เล่นซื้อ — ลดสต็อก ดันราคาขึ้น */
  applyPlayerBuy(islandId: IslandId, commodityId: LivingCommodityId, amount: number): void {
    const item = this.getCommodity(islandId, commodityId);
    if (!item) return;
    item.stock = Math.max(0, item.stock - amount);
    item.demand += amount * 0.15;
    this.updatePrice(item);
  }

  /** ผู้เล่นขาย — เพิ่มสต็อก กดราคาลง */
  applyPlayerSell(islandId: IslandId, commodityId: LivingCommodityId, amount: number): void {
    const item = this.getCommodity(islandId, commodityId);
    if (!item) return;
    item.stock += amount;
    item.demand = Math.max(item.demand * 0.95, item.consumption * 0.5);
    this.updatePrice(item);
  }

  /** รัน simulation tick */
  tick(): void {
    this.world.tick += 1;
    for (const island of this.world.islands) {
      this.produceAndConsume(island);
      this.updateDemand(island);
      this.updatePrices(island);
      this.updateWealth(island);
    }
    this.spreadRegionalDemand();
    this.createNpcTradeOrders();
    this.moveTradeShips();
    this.resolvePirateAttacks();
    const newNews = generateNewsFromTick(this.world);
    this.world.news = [...newNews, ...this.world.news].slice(0, 12);
  }

  /** หาเส้นทาง arbitrage ที่กำไรสูงสุดจากเกาะ */
  bestArbitrageFrom(islandId: IslandId): {
    commodityId: LivingCommodityId;
    profit: number;
    toIslandId: IslandId;
  } | null {
    let best: { commodityId: LivingCommodityId; profit: number; toIslandId: IslandId } | null = null;
    for (const commodityId of LIVING_COMMODITY_IDS) {
      const buy = this.getBuyPrice(islandId, commodityId, 1);
      if (buy == null) continue;
      for (const target of this.world.islands) {
        if (target.id === islandId) continue;
        const sell = this.getSellPrice(target.id, commodityId, 1);
        if (sell == null) continue;
        const profit = sell - buy;
        if (profit > 0 && (!best || profit > best.profit)) {
          best = { commodityId, profit, toIslandId: target.id };
        }
      }
    }
    return best;
  }

  private produceAndConsume(island: TradeIslandState): void {
    for (const id of LIVING_COMMODITY_IDS) {
      const item = island.commodities[id];
      const stabilityFactor = 0.5 + island.stability * 0.5;
      const effectiveProduction = item.production * stabilityFactor * (1 - island.pirateThreat * 0.3);
      item.stock += effectiveProduction;
      item.stock -= item.consumption;
      item.stock = Math.max(0, item.stock);
    }
    if (island.pirateThreat > 0.4) {
      island.stability = Math.max(0.3, island.stability - 0.01);
    } else {
      island.stability = Math.min(1, island.stability + 0.005);
    }
  }

  private updateDemand(island: TradeIslandState): void {
    for (const id of LIVING_COMMODITY_IDS) {
      const item = island.commodities[id];
      const scarcity = item.demand / Math.max(item.stock, 1);
      if (scarcity > 2) {
        item.demandMultiplier = Math.min(2, item.demandMultiplier + 0.05);
      } else {
        item.demandMultiplier = Math.max(0.8, item.demandMultiplier - 0.02);
      }
      item.demand = item.demand * 0.92 + item.consumption * 0.08;
    }
  }

  private updatePrices(island: TradeIslandState): void {
    for (const id of LIVING_COMMODITY_IDS) {
      this.updatePrice(island.commodities[id]);
    }
  }

  private updatePrice(item: CommodityState): void {
    item.previousPrice = item.currentPrice;
    item.currentPrice = calculateMarketPrice(item);
  }

  private refreshAllPrices(): void {
    for (const island of this.world.islands) this.updatePrices(island);
  }

  private updateWealth(island: TradeIslandState): void {
    let tradeValue = 0;
    for (const id of LIVING_COMMODITY_IDS) {
      const item = island.commodities[id];
      tradeValue += item.stock * item.currentPrice * 0.01;
    }
    island.wealth = island.wealth * 0.98 + tradeValue;
    if (island.portLevel < 3 && island.wealth > 2500) {
      island.portLevel += 0.01;
    }
  }

  private spreadRegionalDemand(): void {
    for (const island of this.world.islands) {
      for (const targetId of island.routeTargets) {
        const neighbor = this.getIsland(targetId);
        if (!neighbor) continue;
        for (const id of LIVING_COMMODITY_IDS) {
          const nItem = neighbor.commodities[id];
          if (nItem.demand > nItem.stock * 2) {
            island.commodities[id].demand += 2;
          }
        }
      }
    }
  }

  private createNpcTradeOrders(): void {
    for (const route of this.world.routes) {
      if (this.world.ships.filter((s) => s.originIslandId === route.sourceIslandId).length
        >= route.transportCapacity) {
        continue;
      }
      const origin = this.getIsland(route.sourceIslandId);
      const dest = this.getIsland(route.targetIslandId);
      if (!origin || !dest) continue;

      let best: { id: LivingCommodityId; surplus: number } | null = null;
      for (const id of LIVING_COMMODITY_IDS) {
        const o = origin.commodities[id];
        const d = dest.commodities[id];
        const surplus = o.stock - o.targetStock;
        const need = d.targetStock - d.stock;
        if (surplus > 15 && need > 10) {
          const score = surplus + need;
          if (!best || score > best.surplus) best = { id, surplus: score };
        }
      }
      if (!best) continue;

      const cargoAmount = Math.min(
        LIVING_TRADE_CONFIG.npcShipCargo,
        Math.floor(origin.commodities[best.id].stock * 0.15),
      );
      if (cargoAmount < 3) continue;

      origin.commodities[best.id].stock -= cargoAmount;
      this.updatePrice(origin.commodities[best.id]);

      this.world.ships.push({
        id: `npc-ship-${++shipCounter}`,
        originIslandId: route.sourceIslandId,
        destinationIslandId: route.targetIslandId,
        cargo: { [best.id]: cargoAmount },
        travelTimeRemaining: LIVING_TRADE_CONFIG.shipTravelTicks,
        dangerRisk: 1 - route.safety + route.pirateActivity * 0.5,
      });
      route.traffic = Math.min(1, route.traffic + 0.05);
    }
  }

  private moveTradeShips(): void {
    const arrived: TradeShip[] = [];
    const remaining: TradeShip[] = [];

    for (const ship of this.world.ships) {
      ship.travelTimeRemaining -= 1;
      if (ship.travelTimeRemaining <= 0) arrived.push(ship);
      else remaining.push(ship);
    }
    this.world.ships = remaining;

    for (const ship of arrived) {
      const dest = this.getIsland(ship.destinationIslandId);
      if (!dest) continue;
      for (const [id, amount] of Object.entries(ship.cargo)) {
        if (!amount || !isLivingCommodity(id)) continue;
        dest.commodities[id].stock += amount;
        this.updatePrice(dest.commodities[id]);
      }
    }
  }

  private resolvePirateAttacks(): void {
    const surviving: TradeShip[] = [];
    for (const ship of this.world.ships) {
      if (Math.random() > ship.dangerRisk * LIVING_TRADE_CONFIG.pirateLootChance) {
        surviving.push(ship);
        continue;
      }
      const origin = this.getIsland(ship.originIslandId);
      const dest = this.getIsland(ship.destinationIslandId);
      if (origin) origin.pirateThreat = Math.min(1, origin.pirateThreat + 0.03);
      if (dest) {
        for (const id of LIVING_COMMODITY_IDS) {
          dest.commodities[id].demandMultiplier = Math.min(2.2, dest.commodities[id].demandMultiplier + 0.08);
          this.updatePrice(dest.commodities[id]);
        }
      }
      const route = this.findRoute(ship.originIslandId, ship.destinationIslandId);
      if (route) {
        route.pirateActivity = Math.min(1, route.pirateActivity + 0.06);
        route.safety = Math.max(0.2, route.safety - 0.04);
      }
    }
    this.world.ships = surviving;
  }

  private findRoute(source: IslandId, target: IslandId): TradeRouteState | undefined {
    return this.world.routes.find((r) => r.sourceIslandId === source && r.targetIslandId === target);
  }
}
