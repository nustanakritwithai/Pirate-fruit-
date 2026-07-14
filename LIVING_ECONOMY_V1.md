# Living Economy Core v1.0

Pirate Fruit — cellular automata economy for inter-island trade. This document locks the **v1.0** scope: a stable simulation stack from basic trade through evolutionary genome bias, without population, districts, technology trees, or political systems.

**Parent architecture:** [SIMULATION_CORE_V1.md](SIMULATION_CORE_V1.md) — *Everything emerges from Local Rules.*

## Stack overview

| Phase | Name | Role |
|-------|------|------|
| T1–T3 | Cross-island trade | Buy/sell, cargo, routes |
| T4A | Commodities & production chains | Recipes, inputs/outputs, spoilage |
| E1 | Adaptive Factory | Profit-driven factory agents per cell |
| E2 | Dynamic Trade Orders | Shortage/surplus-driven NPC orders |
| E3 | Trader Memory | Route learning, reputation, exploration |
| E3.5 | Player Influence | Reputation, contracts, market impact |
| E4A | Economy Genome | Evolutionary bias from real outcomes (not control) |

## Architecture

```
Per tick (simplified):
  produce → consume → E1 factories → prices/demand
  → E3.5 player → E2 trade orders → E3 traders → cargo/spoilage
  → E4A genome (pressure → fitness → drift → identity)
  → bounded log/news → save v7
```

**Genome principle:** pressure comes from factory/trader/player/market results; drift is fitness-gated with inertia; identity uses hysteresis. Genome only adds **small scoring bias** to E1/E3 and slight target-stock adjustment — it does **not** override E1, E2, E3, or E3.5.

## Save version

- **Current:** `7` (`ECONOMY_GENOME_CONFIG.saveVersion`)
- **Migration:** v6 → v7 creates neutral genomes from cell roles without resetting factories, markets, orders, traders, player state, or cargo.

## Bounded collections (v1.0 stability)

Configured in `LivingEconomyBounds.ts` and related configs:

| Collection | Limit | Config |
|------------|-------|--------|
| Economy log | 200 | `LIVING_ECONOMY_BOUNDS.maxEconomyLogEntries` |
| News | 100 | `LIVING_ECONOMY_BOUNDS.maxNewsEntries` |
| Debug samples | 300 | `LIVING_ECONOMY_BOUNDS.maxDebugSamples` |
| Archived orders | 120 | `LIVING_ECONOMY_BOUNDS.maxArchivedOrders` |
| Genome pressures | 300 | `ECONOMY_GENOME_CONFIG.maximumPressureLogSamples` |
| Evolution history | 100 | `ECONOMY_GENOME_CONFIG.maximumEvolutionHistoryEntries` |
| Player trade history | 100 | `PLAYER_REPUTATION_CONFIG.maxSavedPlayerTradeHistory` |

News with the same cell/commodity/template are **merged** (timestamp refreshed) instead of duplicated every tick.

`trimEconomyWorldState()` runs after each tick and before save.

## Debug tools

- **F8** — Economy debug panel (factories, orders, traders, player economy, genome)
- **Economy Panel** — market, contracts, reputation, traders, routes, **Genome** tab
- Genome debug: freeze drift/pressure, accel x10/x100, force pressures, drift/fitness/identity now

## Key balance configs

- `ECONOMY_CONFIG` — prices, spoilage, NPC cadence
- `ADAPTIVE_ECONOMY` — factory thresholds (E1)
- `DYNAMIC_TRADE` — order urgency, expiry (E2)
- `TRADER_MEMORY` — learning/decay (E3)
- `PLAYER_REPUTATION_CONFIG` / `PLAYER_CONTRACT_CONFIG` — E3.5
- `ECONOMY_GENOME_CONFIG` — drift intervals, pressure decay, fitness weights (E4A)

## Tests

- **Standard CI:** `npm test` (390+ unit/integration tests)
- **Extended soak:** `npm run test:extended` (20,000 ticks, opt-in via `LIVING_ECONOMY_EXTENDED=1`)

Extended test verifies: finite genome values, bounded log/news/pressure/history, no negative stock/reservations, identity not flipping excessively, E1–E3.5 still active, mid-run save/load.

## Explicitly out of scope (v1.0 lock)

Do **not** implement unless real playtesting demands it:

- E4B Population migration
- E4C Industrial districts
- E4D Technology / recipe unlock evolution
- Companies / credit / treasury
- Civilization AI
- Political economy

Next major vertical: **Living Monster Cellular AI** (separate from economy depth) — now shipped as [LIVING_MONSTER_V1.md](LIVING_MONSTER_V1.md). Both cores are locked under [SIMULATION_CORE_V1.md](SIMULATION_CORE_V1.md).

## Module map

```
client/src/trade/living/
  LivingTradeSimulator.ts      — tick orchestration
  LivingTradePersistence.ts    — save/load v7
  LivingEconomyBounds.ts       — bounded collections
  AdaptiveEconomy.ts / FactoryAgent.ts     — E1
  DynamicTradeEconomy.ts / TradeOrderGenerator.ts — E2
  TraderMemoryStore.ts / TraderDecision.ts — E3
  PlayerEconomy* / PlayerContract*         — E3.5
  EconomyGenome* / Genome*               — E4A
```
