# Combat Experience v1.0 (CE1)

Pirate Fruit — make players **feel** Living Monster Cellular AI in combat. CE1 extends M1 without a new AI controller.

**Parent:** [SIMULATION_CORE_V1.md](SIMULATION_CORE_V1.md) — *Everything emerges from Local Rules.*

## Goal

> Change from "monsters have AI" to "the player feels they are fighting a thinking pack."

No new core AI. Formation, pressure, roles, and signals layer on top of cellular thought states.

## CE1 features

| ID | Name | Implementation |
|----|------|----------------|
| CE1-1 | Formation Combat | `computeFormationTarget()` — ring slots from cell hash, not fixed formation script |
| CE1-2 | Pressure Combat | `shouldAttackUnderPressure()` — staggered attacks from attack influence |
| CE1-3 | Role Emergence | `resolveEmergentRole()` — frontliner / flanker / watcher / retreater from situation |
| CE1-4 | Boss Influence | `influenceBoss: 3`, `bossInfluence` in snapshots, flee resistance + hunt boost |
| CE1-5 | Adaptive Difficulty | Emergent from dead/flee/regroup cellular rules + CE1 formation |
| CE1-6 | Combat Signals | Thought colors when player in range (`combatSignalsEnabled`); F9 full debug |
| CE1-7 | Emergent Moments | Natural idle→alert→hunt→flee→regroup chains (no quest scripts) |
| CE1-8 | Combat Metrics | F9 panel: attack/flee influence, cohesion, pressure, decision time |
| CE1-9 | Playtest Scenarios | `combatExperience.test.ts` — 14 automated emergence scenarios |

## Data flow

```
Cellular Tick (250ms)
  → thought state + neighbor snapshot
  → applyCombatExperience()
      → formation target (CE1-1)
      → pressure gate (CE1-2)
      → emergent role (CE1-3)
MonsterManager (60 FPS)
  → move toward formation target (not all rush player)
  → attack only when pressure allows
  → combat signal markers when player nearby
```

## Integration rule (locked)

Gameplay must **not** call `setThoughtState()` or command packs. CE1 only reads cellular output and shapes **movement presentation**.

## Key modules

```
client/src/monster/cellular/
  CombatExperienceConfig.ts
  CombatExperienceAdapter.ts
  MonsterCellularWorld.ts      — getCombatIntent(), combat signals
client/src/monster/MonsterManager.ts — formation movement, signals
```

## Tests

```bash
npm test -- src/monster/__tests__/combatExperience.test.ts
npm test -- src/monster/__tests__/monsterCellular
```

## Definition of done

- [x] Pack can surround player via formation slots
- [x] Pack scatters under dead/flee pressure
- [x] Pack regroups when safe
- [x] Boss influences via weight, not leader script
- [x] No global AI controller
- [x] Difficulty from behavior, not HP inflation
- [x] Combat signals readable (colors in aggro range)
- [x] 10+ automated playtest scenarios
- [ ] Manual 5-minute playtest sign-off (human)

## Out of scope (CE1)

- M2 Memory, M3 Genome, M4 Ecosystem
- Utility AI / BT / GOAP as combat brain
- Direct quest → monster state commands
