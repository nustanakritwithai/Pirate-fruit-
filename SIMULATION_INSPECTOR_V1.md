# Simulation Inspector v1.0 (SI1)

**ศูนย์ควบคุมโลกสำหรับ Developer** — รวม Living Economy, Living Monster, Devil Fruit World Influence, Combat Experience และ Performance ไว้ในหน้าต่างเดียว

> Developer Tool เท่านั้น — ไม่โหลดใน Production Build เมื่อ `DEBUG=false`

---

## Activation

| วิธี | รายละเอียด |
|------|------------|
| **F12** | เปิด/ปิด Simulation Inspector |
| **?sim=1** | เปิดอัตโนมัติเมื่อโหลดเกม (dev only) |
| F8 / F9 / F10 | แผงเดิมยังใช้ได้แบบ standalone |

---

## Architecture

```
Simulation Inspector (F12)
├── Overview        — world tick, FPS, counts
├── Economy         — embed F8 EconomyDebugPanel
├── Monster         — embed F9 MonsterCellularDebugPanel
├── Devil Fruit     — embed F10 DevilFruitInfluenceDebugPanel
├── Combat          — CE1 pressure, roles, formation
├── World           — unified timeline + filters
├── Performance     — tick times, render stats
├── Settings        — pause, speed, freeze, heatmaps
├── Time Machine    — 60s ring buffer scrub
├── Live Cell       — click monster → thought/neighbors/role
└── Influence Viz   — colored rings in world (attack/alert/flee/fire/smoke)
```

### Module layout

```
client/src/simulation/inspector/
  SimulationInspector.ts      — dockable UI shell
  SimulationController.ts     — pause / speed / freeze / step
  SimulationEventBus.ts       — unified timeline events
  SimulationTimeMachine.ts    — 30–60s historical snapshots
  SimulationPersistence.ts    — localStorage panel state
  InfluenceVisualizer.ts      — Three.js influence rings
  LiveCellInspector.ts        — per-monster AI DevTools panel
  HeatmapModes.ts             — heatmap mode registry
```

### Production gating

```ts
// main.ts — dynamic import, tree-shaken in production
if (import.meta.env.DEV && __DEBUG__) {
  const { initSimulationInspector } = await import('./simulation/inspector');
  ...
}
```

`vite.config.ts` defines `__DEBUG__` from `process.env.DEBUG !== 'false'`.

---

## Tabs

### Overview
World Tick, Simulation Speed, Paused, Economy/Monster/Influence ticks, FPS, Memory, entity counts.

### Economy (F8 embedded)
Factory Status, Genome, Trade Routes, Orders, Player Contracts, Economy Pressure, Heatmap toggle.

### Monster (F9 embedded)
State Counts, Influence, Pack Cohesion, Combat metrics, neighbor averages.

### Devil Fruit (F10 embedded)
Active areas by type, heatmap canvas, spawn debug actions.

### Combat (CE1)
Attack/Flee Pressure, Cohesion, Formation pressure, role distribution (Frontliner/Flanker/Watcher/Retreater).

### World
Global timeline — Economy, Monster, Devil Fruit, Combat, Quest events with category filter.

### Performance
FPS, tick durations (Economy 5s / Monster 250ms / DF 250ms), render info, spatial queries.

### Settings
| Control | Effect |
|---------|--------|
| Pause / Step | หยุดโลก หรือเดิน 1 tick |
| Speed 1x–100x | เร่ง simulation delta |
| Freeze Economy/Monster/DF | หยุดเฉพาะระบบ |
| Debug Colors | สี thought บนมอนสเตอร์ |
| Heatmaps | โหมด overlay |
| Influence Visualizer | วงสีอิทธิพลในโลก |
| Select Mode | คลิกมอนสเตอร์ → Live Cell |
| Reset Panels | ล้าง localStorage layout |

---

## Time Machine

Ring buffer บันทึก snapshot ทุก ~1 วินาที (สูงสุด 60 วินาที)

```
◀────────────▶
12:01:10  12:01:11  12:01:12
```

เลื่อน scrub bar เพื่อดูย้อนหลัง:
- Economy state
- Monster state counts
- Fire/Smoke influence positions

---

## Live Cell Inspector

เปิด **Select Mode** ใน Settings แล้วคลิกมอนสเตอร์ในเกม:

```
Monster #42
Current Thought: alert
Next Thought: hunt
Role: flanker
Neighbors: Alert 3.2 · Attack 1.5 · Boss 2.0
```

---

## Influence Visualizer

| สี | ความหมาย |
|----|----------|
| แดง | Attack Influence |
| เหลือง | Alert |
| ฟ้า | Flee |
| ส้ม | Fire |
| ม่วง | Smoke |

วงจางลงและขยาย — แสดง "คลื่นอิทธิพล" ที่ทำให้ AI ตัดสินใจ

---

## Persistence (localStorage)

จำ: panel position, size, collapsed, active tab, heatmap mode, influence overlay, select mode

Key: `pirate-fruit:sim-inspector:v1`

---

## Tests

42 tests ใน `client/src/simulation/__tests__/simulationInspector.test.ts`

ครอบคลุม: controller, event bus, time machine, persistence, heatmaps, live cell, no memory leak

---

## Related docs

- [SIMULATION_CORE_V1.md](./SIMULATION_CORE_V1.md) — architecture lock
- [LIVING_ECONOMY_V1.md](./client/src/trade/living/LIVING_ECONOMY_V1.md)
- [LIVING_MONSTER_V1.md](./client/src/monster/cellular/LIVING_MONSTER_V1.md)
- [COMBAT_EXPERIENCE_V1.md](./client/src/monster/cellular/COMBAT_EXPERIENCE_V1.md)
- [DEVIL_FRUIT_SIMULATION_V1.md](./client/src/devilfruit/influence/DEVIL_FRUIT_SIMULATION_V1.md)

---

## Definition of Done ✅

- [x] Simulation ทั้งหมดดูได้จาก F12 หน้าต่างเดียว
- [x] F8/F9/F10 embed ภายใน Inspector + ยังใช้ standalone ได้
- [x] Time Machine 30–60s scrub
- [x] Live Cell Inspector (Select Mode)
- [x] Influence Visualizer overlay
- [x] ไม่โหลด production (`import.meta.env.DEV && __DEBUG__`)
- [x] 42 tests ผ่าน
- [x] Production build ผ่าน
