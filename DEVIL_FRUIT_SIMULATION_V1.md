# Devil Fruit Simulation Core v1.0 (Phase DF1)

Pirate Fruit — devil fruits change **world rules** through the World Influence Layer, not direct AI/economy overrides.

**Parent:** [SIMULATION_CORE_V1.md](../SIMULATION_CORE_V1.md) — *Everything emerges from Local Rules.*

## Goal

> Devil fruits change the rules of the world — not just deal damage.

```
Player Skill
    ↓
Devil Fruit Effect (area cell)
    ↓
World Influence Layer
    ↓
Monster Cellular Core · Living Economy Core · Environment
```

## Architecture

```
DevilFruitInfluenceWorld
├── Effect Registry
├── Area Effect Spatial Grid
├── Effect Stack Rules (refresh duration, cap strength)
├── Area Influence Resolver (sample at x,z)
├── DevilFruitSkillBridge (skill → effect type)
├── DevilFruitEconomyBridge (environment genome pressure)
└── F10 Debug Panel + heatmap
```

Monsters read **area influence** in neighbor snapshots — they never know which skill created it.

## Effect types

`fire` · `ice` · `lightning` · `wind` · `darkness` · `light` · `poison` · `earthquake` · `smoke` · `sand`

Each has `radius`, `strength`, `duration`, `falloff`.

| Effect | Monster influence | Economy pressure |
|--------|-------------------|------------------|
| Fire | +alert, +flee | hardwood production-bias ↓ |
| Ice | movement ↓, formation breaks | — |
| Lightning | stun 1 cellular tick | — |
| Smoke | vision ↓, neighbors ↓ | industrialization ↓ |
| Poison | flee bias | — |
| Earthquake | cohesion ↓, scatter | production-bias ↓ |

## Integration rules (locked)

- Skills call `emitSkillInfluence()` — **no** `setMonsterState()` / **no** direct stock edits
- Economy uses `source: 'environment'` genome pressures only
- Cellular rules use `fireInfluence`, `smokeDensity`, etc. from snapshots

## Debug

- **F10** — active areas, metrics, influence heatmap (`?df1=1` auto-open)
- **F9** — monster cellular · **F8** — economy

## Tests

```bash
npm test -- src/devilfruit/__tests__/devilFruitInfluence.test.ts
```

42 DF1 tests + full suite.

## Module map

```
client/src/devilfruit/influence/
  DevilFruitInfluenceWorld.ts
  DevilFruitInfluenceTypes.ts
  DevilFruitInfluenceConfig.ts
  AreaEffectRegistry.ts
  AreaEffectSpatialGrid.ts
  EffectStackRules.ts
  AreaInfluenceResolver.ts
  DevilFruitEconomyBridge.ts
  DevilFruitSkillBridge.ts
  DevilFruitInfluenceDebugPanel.ts
client/src/monster/cellular/NeighborResolver.ts  — area fields in snapshot
client/src/combat/PlayerCombat.ts              — bindSkillInfluenceHook
client/src/main.ts                             — tick + hook wiring
```

## Definition of done

- [x] Area cells with stack/lifetime/falloff
- [x] Monster snapshots include area influence
- [x] Fire/smoke/poison/ice/earthquake/lightning behavior via local rules
- [x] Economy reacts via environment pressure
- [x] Skill bridge infers element from fruit skills
- [x] F10 debug panel
- [x] 40+ tests, production build

## Out of scope (DF1)

- Fruit awakening trees, PvP balance pass
- Direct environment mesh burning (presentation only later)
- Script per-fruit handlers
