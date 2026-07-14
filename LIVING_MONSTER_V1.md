# Living Monster Cellular AI Core v1.0 (Phase M1)

Pirate Fruit — **Weighted Conway-style** cellular automata for monster thought and emergent pack behavior. This document locks **M1 / Monster Core v1.0** scope: thought states, neighbor influence, propagation, and behavior adaptation — without memory, genome, or ecosystem layers.

## Simulation cores in Pirate Fruit

Both major simulation stacks share the same design principle: **no central controller**, only **local rules**.

```
Living Economy                    Living Monster
Factory → Trade → Trader          Monster → Neighbor Snapshot
    → Player → Genome → Factory       → Cellular Rules → Thought
                                          → Behavior → Monster
```

| Core | Status |
|------|--------|
| Living Economy Core v1.0 | ✅ Locked |
| Living Monster Cellular Core v1.0 | ✅ Locked (M1) |

## Roadmap

| Phase | Name | Status |
|-------|------|--------|
| **M1** | Living Monster Cellular AI (Weighted Conway Core) | **v1.0** |
| M2 | Living Monster Memory | After playtest tuning |
| M3 | Monster Genome | Planned |
| M4 | Living Ecosystem | Planned |

## Principles (v1.0 lock)

- Each monster is a **cell** — not a standalone FSM/BT/Utility AI controller.
- **Thought state** is decided only by cellular rules + weighted neighbor snapshots.
- **Movement/combat** at 60 FPS reads the latest thought state via the Behavior Adapter.
- Pack hunt, scatter, and regroup emerge from **state propagation** — no leader script, no global AI controller, no broadcast commands.
- **Influence weight** lets larger/boss cells contribute more to neighbor sums (e.g. boss = 2, grunt/crab = 1) without a leader script.

## Architecture

```
Monster Cellular World
├── Monster Registry
├── Spatial Grid (hash)
├── Neighbor Resolver (counts + influence sums)
├── Cellular Tick (two-phase Conway update)
├── State Transition Rules (weighted thresholds)
├── Behavior Adapter
└── Debug Panel + thought markers
```

### Tick flow (every 250 ms)

```
sync positions/hp from monsters
→ rebuild spatial grid (includes dead cells for flee signals)
→ Phase A: read currentState, build neighbor snapshots
→ Phase B: compute nextState (no mid-tick mutations)
→ Phase C: apply nextState for all living cells simultaneously
→ metrics (state counts, transitions, avg neighbors, tick ms)
```

### Movement (60 FPS)

`MonsterManager` calls `getIntent(monster)` each frame. The adapter maps thought state → locomotion, speed, face player, attack, flee/regroup vectors.

## Monster cell

Each cell carries `influenceWeight` (default 1, boss 2). Neighbor snapshots expose both **counts** (debug) and **influence sums** (rules):

```
Alert Influence = 5.3   (not just Alert Count = 3)
Hunt Influence  = 2.8
```

Rules compare against **influence**, so a boss can wake a pack faster while remaining pure cellular automata.

## Thought states

`idle` · `alert` · `hunt` · `attack` · `flee` · `regroup` · `rest` · `dead`

### Key transitions

| From | To | Triggers (summary) |
|------|-----|-------------------|
| idle | alert | player nearby + alert/hunt influence band |
| alert | hunt | hunt influence + low flee influence |
| hunt | attack | player in attack range + attack influence |
| hunt | flee | high dead/flee influence or low HP |
| flee | regroup | player far + (regroup or flee influence) |
| regroup | alert | pack density influence / player returns |

## Emergence playtest checklist

Manual in-game checks before M2:

| Test | Scenario | Expected |
|------|----------|----------|
| 1 | Player walks into pack | idle → alert → hunt → attack wave |
| 2 | Kill 2 monsters | dead → flee → flee → regroup |
| 3 | Player retreats | attack → alert → idle calms |
| 4 | Two separate packs | each pack responds locally, no cross-pack broadcast |
| 5 | 100 monsters | spatial grid fast, tick time stays low |

Automated counterparts: `monsterCellularEmergence.test.ts` (E1–E6).

## Debug tools

- **F9** — Cellular debug panel (monster count, state counts, transitions, avg neighbors, tick time). **F8** remains Economy debug.
- **?cellular=1** — auto-open cellular panel on load.
- **Thought markers** — colored sphere above each monster head (toggle in panel):
  - Gray idle · Yellow alert · Orange hunt · Red attack · Blue flee · Green regroup · Brown rest · Black dead

## Key config

`client/src/monster/cellular/MonsterCellularConfig.ts` — tick interval (250 ms), spatial cell size, perception radius, **influence weights**, transition thresholds, marker height.

## Tests

- **Standard CI:** `npm test` — `monsterCellular.test.ts` (44 tests) + `monsterCellularEmergence.test.ts` (6 tests)
- Cellular only: `npm test -- src/monster/__tests__/monsterCellular`

## Module map

```
client/src/monster/cellular/
  MonsterCellularTypes.ts      — MonsterCell, NeighborSnapshot, intents
  MonsterCellularConfig.ts     — thresholds, influence weights, colors
  CellularInfluence.ts         — resolveInfluenceWeight(species, kind)
  SpatialGrid.ts               — neighbor queries (no O(n²))
  MonsterRegistry.ts           — cell registry
  NeighborResolver.ts          — counts + influence snapshots
  StateTransitionRules.ts      — weighted Conway rules
  CellularTick.ts              — two-phase update (dead in grid for signals)
  MonsterBehaviorAdapter.ts    — thought → movement/combat
  MonsterCellularWorld.ts      — orchestrator
  MonsterThoughtMarker.ts      — debug colors
  MonsterCellularDebugPanel.ts — F9 panel
client/src/monster/MonsterManager.ts — 60 FPS intent application
client/src/main.ts             — 250 ms cellular accumulator
```

## Explicitly out of scope (v1.0 lock)

Do **not** implement until playtesting justifies the next phase:

- M2 player/event memory
- M3 species genome / personality drift
- M4 predator-prey ecosystem coupling with Living Economy
- Leader scripts, squad commands, or global flock controllers
- Behavior trees or utility AI as primary decision layer

**Next step:** playtest emergence, tune thresholds in `MonsterCellularConfig.ts`, then **M2 Living Monster Memory**.
