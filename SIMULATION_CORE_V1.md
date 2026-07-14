# Pirate Fruit — Simulation Core v1.0

> **Design principle:** *Everything emerges from Local Rules.*

This document locks the **architecture milestone** for Pirate Fruit. From this point forward, gameplay systems **influence** the simulation — they do **not command** it.

---

## Milestone

```
======================================
Pirate Fruit
Simulation Core v1.0

✔ Living Economy Core v1.0
✔ Living Monster Cellular Core v1.0

Design Principle
"Everything emerges from Local Rules."
======================================
```

| Child document | Scope |
|----------------|--------|
| [LIVING_ECONOMY_V1.md](LIVING_ECONOMY_V1.md) | Economy cellular stack (E1–E4A) |
| [LIVING_MONSTER_V1.md](LIVING_MONSTER_V1.md) | Monster weighted Conway core (M1) |
| [COMBAT_EXPERIENCE_V1.md](COMBAT_EXPERIENCE_V1.md) | Combat Experience layer (CE1) |

---

## What changed

Pirate Fruit is no longer a generic MMORPG loop with scripted AI. It is a world with **two simulation cores** that share one philosophy:

```
        ┌─────────────────────────┐
        │    Living Economy       │
        │   Cellular Automata     │
        └──────────┬──────────────┘
                   │
            โลกเปลี่ยนเอง
                   │
        ┌──────────▼──────────────┐
        │ Living Monster Cellular │
        │  Conway's Game of Life  │
        └─────────────────────────┘
```

Both cores obey:

- **No central AI controller**
- **No one-off event scripts** as the primary design tool
- **No leader** ordering every agent
- **Local rules + feedback loops** produce global behavior

---

## Layered architecture (locked)

```
┌─────────────────────────────────────────────────────────┐
│                  Presentation Layer                      │
│   Animation · Effects · UI · Audio                       │
└──────────────────────────┬──────────────────────────────┘
                           │ reads state, plays feedback
┌──────────────────────────▼──────────────────────────────┐
│                   Gameplay Layer                         │
│   Combat · Devil Fruit · Boat · Quest · NPC · Dungeon · Boss │
└──────────────────────────┬──────────────────────────────┘
                           │ influences environment & inputs
                           │ (never direct commands into core)
┌──────────────────────────▼──────────────────────────────┐
│                  Simulation Layer                        │
│   ✔ Living Economy Core v1.0                           │
│   ✔ Living Monster Cellular Core v1.0                    │
└─────────────────────────────────────────────────────────┘
```

### Rule: Gameplay affects the world; it does not own the world

| ❌ Do not | ✅ Do |
|-----------|-------|
| Quest → `setMonsterState('flee')` | Quest → raise threat / change environment → cellular rules → monsters flee |
| Boss → `commandAllMinionsAttack()` | Boss → high **Alert Influence** → neighbors see influence → alert → hunt → attack |
| Script → force factory output | Script → add wood **demand** → economy core → factories produce → traders route → prices shift |

Gameplay sends **signals** (demand, danger, reputation, terrain, player presence). Simulation cores **react** through local rules.

---

## Decision checklist for every new system

Before implementing, ask:

> **"Can this be solved with Local Rules?"**

| Answer | Action |
|--------|--------|
| **Yes** | Use local rules inside Economy or Monster cellular stacks (or a future cellular layer). |
| **No** | Use a **small, bounded script** only for that special case — never as the world core. |

Examples:

- **Boss rallying minions** → increase boss `influenceWeight` / alert pressure in neighbor snapshots — not a minion broadcast API.
- **Festival price spike** → inject demand pressure into economy cells — not hand-set every shop price.
- **Dungeon alarm** → environment flag that raises player proximity / threat in monster snapshots — not per-monster flee commands.

---

## AI philosophy (locked for Simulation Layer)

Do **not** adopt as the **primary** world brain:

- Utility AI
- Large behavior trees
- GOAP
- Blackboard AI controllers

These create a **second philosophy** that fights cellular automata. If needed at all, reserve them for **isolated special cases** (e.g. a cinematic boss phase, a single quest NPC) — never as the simulation core.

The world's monsters and economy agents think through **cells, neighbors, and local transition rules**.

---

## Integration boundaries

### Economy core entry points

Gameplay may:

- Change commodity demand/supply signals
- Affect player reputation and contracts
- Add/remove cargo, routes, or market events

Gameplay must **not**:

- Directly set factory production amounts each tick
- Override trader route scores without going through memory/pressure systems
- Bypass genome as a controller (genome is **bias only**)

### Monster core entry points

Gameplay may:

- Change environment (player position, threat level, zone modifiers)
- Deal damage / death (feeds dead influence in snapshots)
- Tune species `influenceWeight` via data (boss > grunt)

Gameplay must **not**:

- Set `thoughtState` on monsters from quest scripts
- Broadcast pack orders across camps
- Replace cellular tick with per-monster FSM as primary AI

---

## Roadmap after v1.0 lock

Simulation depth continues in **layers**, not by breaking the core:

| Track | Next phases |
|-------|-------------|
| Economy | E4B+ only if playtesting demands; otherwise gameplay verticals |
| Monster | M2 Memory → M3 Genome → M4 Ecosystem (all still local rules) |
| Gameplay | Combat, Devil Fruit, Boat, Quest, NPC, Dungeon, Boss — on top of this foundation |

Tune M1 monster thresholds via playtest before M2. Tune economy via live trade before adding population/districts.

---

## Module index

```
Simulation Layer
  client/src/trade/living/     — Living Economy Core
  client/src/monster/cellular/ — Living Monster Cellular Core

Gameplay Layer (examples)
  client/src/combat/
  client/src/monster/MonsterManager.ts  — behavior adapter only (60 FPS)
  client/src/progression/
  client/src/quest/

Presentation Layer (examples)
  client/src/character/
  client/src/ui/
```

---

## One sentence for the whole project

**Everything emerges from Local Rules.**

Economy, monsters, and every future system should prefer small rules acting together over central scripts — unless a truly exceptional case requires a bounded exception.
