# Living Monster Cellular AI Core v1.0 (Phase M1)

Pirate Fruit — Conway-style cellular automata for monster thought and emergent pack behavior. This document locks **M1** scope: thought states, neighbor propagation, and behavior adaptation — without memory, genome, or ecosystem layers.

## Roadmap

| Phase | Name | Status |
|-------|------|--------|
| **M1** | Living Monster Cellular AI (Conway Core) | **v1.0** |
| M2 | Living Monster Memory | Planned |
| M3 | Monster Genome | Planned |
| M4 | Living Ecosystem | Planned |

## Principles (M1 lock)

- Each monster is a **cell** in a cellular world — not a standalone FSM/BT/Utility AI controller.
- **Thought state** is decided only by cellular rules + neighbor snapshots.
- **Movement/combat** at 60 FPS reads the latest thought state via the Behavior Adapter.
- Pack hunt, scatter, and regroup emerge from **state propagation** — no leader script, no global AI controller, no broadcast commands.

## Architecture

```
Monster Cellular World
├── Monster Registry
├── Spatial Grid (hash)
├── Neighbor Resolver
├── Cellular Tick (two-phase Conway update)
├── State Transition Rules
├── Behavior Adapter
└── Debug Panel + thought markers
```

### Tick flow (every 250 ms)

```
sync positions/hp from monsters
→ rebuild spatial grid
→ Phase A: read currentState, build neighbor snapshots
→ Phase B: compute nextState (no mid-tick mutations)
→ Phase C: apply nextState for all cells simultaneously
→ metrics (state counts, transitions, avg neighbors, tick ms)
```

### Movement (60 FPS)

`MonsterManager` calls `getIntent(monster)` each frame. The adapter maps thought state → locomotion, speed, face player, attack, flee/regroup vectors.

## Thought states

`idle` · `alert` · `hunt` · `attack` · `flee` · `regroup` · `rest` · `dead`

### Key transitions

| From | To | Triggers (summary) |
|------|-----|-------------------|
| idle | alert | player nearby + alert/hunt neighbors in range |
| alert | hunt | hunt neighbors + low flee neighbors |
| hunt | attack | player in attack range + attack neighbors |
| hunt | flee | high dead/flee neighbors or low HP |
| flee | regroup | no player nearby + regroup neighbors |
| regroup | alert | pack density restored / player returns |

## Debug tools

- **F9** — Cellular debug panel (monster count, state counts, transitions, avg neighbors, tick time). **F8** remains Economy debug.
- **?cellular=1** — auto-open cellular panel on load.
- **Thought markers** — colored sphere above each monster head (toggle in panel):
  - Gray idle · Yellow alert · Orange hunt · Red attack · Blue flee · Green regroup · Brown rest · Black dead

## Key config

`client/src/monster/cellular/MonsterCellularConfig.ts` — tick interval (250 ms), spatial cell size, perception radius, transition thresholds, marker height.

## Tests

- **Standard CI:** `npm test` includes `monsterCellular.test.ts` (42 tests): registry, spatial grid, transitions, two-phase update, propagation, order independence, behavior adapter, world sync, no NaN.
- Run cellular only: `npm test -- src/monster/__tests__/monsterCellular.test.ts`

## Module map

```
client/src/monster/cellular/
  MonsterCellularTypes.ts      — MonsterCell, NeighborSnapshot, intents
  MonsterCellularConfig.ts     — thresholds & colors
  SpatialGrid.ts               — neighbor queries (no O(n²))
  MonsterRegistry.ts           — cell registry
  NeighborResolver.ts          — per-tick snapshots
  StateTransitionRules.ts      — Conway-style rules
  CellularTick.ts              — two-phase update
  MonsterBehaviorAdapter.ts    — thought → movement/combat
  MonsterCellularWorld.ts      — orchestrator
  MonsterThoughtMarker.ts      — debug colors
  MonsterCellularDebugPanel.ts — F9 panel
client/src/monster/MonsterManager.ts — 60 FPS intent application
client/src/main.ts             — 250 ms cellular accumulator
```

## Explicitly out of scope (M1 lock)

Do **not** implement in M1:

- M2 player/event memory
- M3 species genome / personality drift
- M4 predator-prey ecosystem coupling with Living Economy
- Leader scripts, squad commands, or global flock controllers
- Behavior trees or utility AI as primary decision layer

Next step after playtesting M1: **M2 Living Monster Memory**.
