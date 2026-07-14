# 🏴‍☠️ Pirate Fruit — Roadmap (v2)

แผนพัฒนาเกมโอเพนเวิลด์แนว Blox Fruits ด้วย Three.js + TypeScript
ปรับโครงใหม่ให้ตรงกับสถานะจริงของโค้ด: เกมไม่ใช่ prototype เดินเล่นแล้ว
แต่เป็น **single-player vertical slice** ที่มีโลก เรือ มอนสเตอร์ บอส และ Combat Framework แล้ว

หลักการ: **หยุดเพิ่มระบบแนวกว้างชั่วคราว แล้วสร้างแกนกลางสามส่วนให้แข็งแรง**
Combat Framework → Level/Stats/Mastery → Quest/Reward Loop

วงจรเกมเป้าหมาย:
รับ Quest → ต่อสู้ → ได้ EXP และเงิน → เพิ่ม Level → อัป Stats (สเกลเต็มตาม Wiki) → เพิ่ม Mastery
→ ปลดล็อก Skill → สู้ Boss → เดินทางไปเกาะต่อไป

สถานะ: ✅ เสร็จแล้ว · 🔨 กำลังทำ · ⬜ ยังไม่เริ่ม

---

## Phase 1 — Core Prototype ✅

- Three.js + TypeScript + Vite (three 0.178, vite 6)
- ตัวละคร 3D พร้อม Idle / Walk / Run, กล้อง Third Person
- เดิน วิ่ง กระโดด Sprint, Dash พร้อม Energy + Cooldown
- Collision (พื้นเกาะสูตรความสูง + สิ่งกีดขวาง + platform)
- HUD, Minimap, FPS / draw calls / triangles
- ระบบควบคุมมือถือแบบ MOBA (จอยสติ๊กลอย + ปุ่มชุดขวา)
- Save ตำแหน่งลง localStorage
- Mobile Realistic PBR + Graphics Preset (ประหยัด/สมดุล/สวย)

## Phase 2 — โลกของเกม ✅

- เกาะเริ่มต้นแบบ Procedural (texture splatting ทราย/หญ้า/หิน)
- หมู่บ้าน หาดฝึก สวนผลไม้ ศาลา และท่าเรือ
- NPC 4 ตัวพร้อมบทสนทนา, Safe Zone + Safe Spawn
- กลางวัน–กลางคืน (12 นาที + โคมไฟกลางคืน)
- ทะเล shader + คลื่น (getWaveHeight ใช้ร่วมกับเรือ)
- จุดสำคัญบน Minimap, Instancing สำหรับวัตถุจำนวนมาก

## Phase 3 — ระบบเรือ ✅

- อู่เรือ + NPC, ซื้อ/เป็นเจ้าของ/เลือกเรือ (เรือพาย + เรือใบ)
- เรียก เก็บ ซ่อมเรือ, ขับหน้า ถอย เลี้ยว เบรก Boost Anchor
- เรือเอียงตามคลื่น 4 จุด, HP เรือ + ความเสียหายจากการชน
- ขึ้น/ลงเรือได้ทุกที่ รวมถึงลงกลางทะเลแล้วว่ายกลับขึ้นเรือ
- Boat HUD + ปุ่มมือถือเฉพาะโหมดเรือ

## Phase 4 — มอนสเตอร์ ✅

- ปูทะเลดุ Lv.2, โจรสลัดเร่ร่อน Lv.4, บอสกัปตันหนวดดำ Lv.10
- AI: Idle → Wander → Chase → Attack → Return + **Leash กันไล่เข้าหมู่บ้าน**
- มอนสเตอร์ไม่เดินลงทะเล, HP Bar + Level เหนือหัว, Respawn
- Hit effect, ผู้เล่นรับดาเมจ/ตายได้, Boss Bar
- i-frame แยกตามศัตรู (attack cooldown ต่อตัว)

## Phase 5 — Combat Framework ✅

### 5.1 Combat State ✅
`idle / attack1-4 / casting / blocking / stunned / knockback / knockdown / dead`
(state machine ใน `combat/CombatState.ts` — ระบบอื่นอ่านผ่าน getter)

### 5.2 M1 Combo ✅
- คอมโบ 4 จังหวะ Hit 1 → 2 → 3 → 4 Finisher
- Combo Window (1.2 วิ) + Combo Reset
- Hit Once Per Swing, Attack Recovery ต่อจังหวะ
- Movement Lock บางจังหวะ (จังหวะ 4 ล็อกอยู่กับที่)
- Knockback ใน Hit สุดท้าย
- Animation Event: hitbox เกิดหลัง windup ของแต่ละจังหวะ

### 5.3 Damage Pipeline ✅
Attack Request → ตรวจ Combat State → ตรวจ Cooldown → สร้าง Hitbox (กรวย/รัศมี/projectile)
→ ตรวจเป้าหมาย → คำนวณ Damage → Apply → Stun/Knockback → **Reward Contribution hook**
ซึ่ง Phase 6 ใช้เก็บ contribution ต่ออุปกรณ์โดยไม่สร้าง Damage Pipeline ซ้ำ

### 5.4 Loadout Framework ✅
ช่อง 1 Fighting Style · 2 Sword · 3 Gun · 4 Fruit · 5 Utility (`combat/Loadout.ts` + persist)
ตอนนี้มีของ: หมัดพื้นฐาน (style) + ดาบฝึกหัด (sword) — โครงรองรับทุกหมวดแล้ว

### 5.5 Block และ Guard ✅
- Block ลดดาเมจจากด้านหน้าเหลือ 25%
- **Guard Meter** (แถบฟ้าใต้ Energy) — กันแล้วกิน guard ตามดาเมจ
- Guard หมด → **Guard Break** (สตัน 1.6 วิ + บล็อกไม่ได้จน guard ฟื้นถึง 30)
- ศัตรูบางท่าป้องกันไม่ได้: บอสทุกตีครั้งที่ 3 = ท่าหนัก **unblockable + knockdown** (มีแฟลชเตือน)
- ผู้เล่นโจมตี/ร่ายสกิลขณะ Block ไม่ได้

### 5.6 Skill Framework ✅
`SkillDefinition { id, category, masteryRequired, cooldown, energyCost, castTime, damage, range, radius, tags }`
— data-driven เต็มรูปแบบ: สกิลปัจจุบัน 3 ตัว (🌊 ฟันคลื่น / 🌀 วงจันทร์ / ⚡ พุ่งฟัน) อยู่หมวด style,
มี castTime (state casting), เพิ่มสกิลใหม่ได้โดยไม่แก้ Combat Core

## Phase 6 — Level, Stats, Mastery และ Quest พื้นฐาน ✅

- [x] Player Level + EXP พร้อม multi-level up — **สเกลเต็มตาม Wiki**: Level Cap 2800,
  EXP curve `floor(2·L^2.3 + 84)` (ดึงจาก databook `levels/`)
- [x] **สเตตัส 5 แบบตาม Blox Fruits Wiki**: Melee/มือเปล่า · Defense/พลังป้องกัน · Sword/ดาบ ·
  Gun/ปืน · Blox Fruit/ผลไม้ปีศาจ (3 แต้ม/Level, cap 2800/สเตต, max ได้ 3 สเตต)
- [x] ผลตามสูตร Wiki: Defense +5 HP · Melee +5 Energy + ดาเมจหมัด · Sword/Gun/Fruit ดาเมจสูงสุด ~78.26x
  — `PROGRESSION_CONFIG` ดึงค่าจาก databook `stats/` เป็น single source of truth
- [x] StatsPanel โชว์ชื่อ+ผลตาม Wiki + ค่าจริงสด (Max HP/Energy, ตัวคูณดาเมจต่อหมวด)
- [x] Mastery แยกตาม Item ID และบังคับใช้ `SkillDefinition.masteryRequired`
- [x] Reward Contribution ต่อศัตรู: 70% ให้อุปกรณ์ที่ทำดาเมจสูงสุด, 30% ให้ last hit
- [x] Enemy/Boss Reward พร้อมลด EXP/Mastery เมื่อเลเวลต่างกันมาก
- [x] Quest 3 รายการ (kill / boss) จากหัวหน้าหมู่บ้าน พร้อม auto claim
- [x] Progression HUD, Stats/Mastery Panel, Quest Tracker และ Reward Feed
- [x] Save migration จาก Phase 1–5 และ Coins ชุดเดียวกับ BoatProgress
- [x] Logic tests + progression/quest integration E2E

## Phase 7 — ระบบผลไม้ + 2 ชุดสกิล + ร้านสุ่ม (Gacha) ✅

แนวคิด: **ไอเทม 1 ชิ้น = 1 ชุดสกิล** ตัวละครถือ 2 ชุด — ของอาวุธที่ถือ + ของผลไม้ที่ติดตั้ง

- [x] Databook จาก Blox Fruits Wiki: ผลไม้ 41 ชนิด, ดาบ, ปืน, สไตล์ต่อสู้, สกิลครบทุกกลุ่ม
- [x] `SkillLoadout` — ถืออาวุธ 1 (ดาบ/ปืน/สไตล์) + ผลไม้ 1, สลับชุดสกิลด้วยปุ่มอาวุธ/`R`
- [x] เชื่อมชุดสกิลเข้าเกมจริง (`combat/SkillCasting.ts` + `SkillResolver.ts`) — ปุ่มสกิล 1-3 + ไม้ตายยิงได้
- [x] **M1 (คอมโบ) ใช้อาวุธที่ถือเสมอ** ไม่ขึ้นกับชุดสกิลที่ active
- [x] ไม้ตาย (Ultimate) ใช้งานได้จริง — ปุ่มมือถือ `tc-ult` + คีย์ `4`/`G`
- [x] ร้านสุ่ม (Gacha) ดึงของจาก databook + ความหายาก Common → Mythic (ถ่วงน้ำหนัก) + ดีลเลอร์หลิน
- [x] อินเวนทอรี: เป็นเจ้าของ/ติดตั้งของ + persist (`shop/ItemInventory.ts`)
- [x] Logic tests (gacha weight, ownership/equip/toggle, adapter, resolver) + Playwright E2E

## Phase 8 — Fruit Framework ต่อยอด ⬜

- [x] โครงผลไม้ปีศาจ + Fruit Dealer + สุ่ม (Gacha) + ความหายาก (ทำใน Phase 7)
- [x] **Skill Gameplay Databook ครบ 431 ท่า** (`combat/skillGameplay/`) — generate จากตาราง Wiki:
  classifier อ่านคำอธิบาย → archetype (projectile/aoe/ground/dash/melee/mobility/buff/summon),
  CC (stun/knockback/launch/pull/disable/slow), DoT, จำนวนฮิต; ดาเมจจากสูตร
  (สลอต × คูลดาวน์ × mastery × ความหายาก); จูนท่าเด่นที่ `overrides.ts` แล้ว `npm run gen:skills`
- [x] `SkillCasting` อ่านค่าจาก databook แทน heuristic (fallback เดิมยังอยู่กันพัง)
- [ ] จูน override รายท่าเพิ่ม (เอฟเฟกต์เฉพาะผล เช่น หลุมดำ Dark, กรงเหล็ก ฯลฯ)
- [ ] Mastery จริงต่อผล/อาวุธ (ผูกกับ Progression) + Awakening (moveset V2)
- [ ] Fruit Spawn ตามจุดบนเกาะ + ครูฝึกสไตล์ต่อสู้

## Phase 9 — หลายเกาะและ World Progression 🔨

- [x] Island Registry + composite terrain/collision รองรับหลายเกาะโดยไม่เปลี่ยนรูปทรงเกาะแรก
- [x] เกาะที่ 2 **เกาะพงไพรหมอก** (Lv.15-30): ป่าดิบชื้น ค่ายนักสำรวจ ซากวิหาร ลานบอส
- [x] ท่าเรือแยกต่อเกาะ + เรียก/จอด/ลงเรือได้ทั้งสองฝั่ง และมินิแมพ local/ocean overview
- [x] โจรป่าพงไพร Lv.16, ผู้พิทักษ์ศิลา Lv.22, บอสวานรพิษโบราณ Lv.28
- [x] NPC ใหม่ 4 คน + ภารกิจเกาะใหม่ 4 งาน (รวม multi-objective)
- [x] Checkpoint ต่อเกาะ + Save v3 migration จากเซฟเดิม + LOD simulation ระยะไกล
- [x] เกาะที่ 3 **เกาะทะเลทรายสุริยะ** (Lv.31-50): นครคาราวาน โอเอซิส เหมืองหิน พีระมิด และเส้นทางเดินเรือสามเกาะ
- [x] แมงป่องทะเลทราย Lv.31, โจรทะเลทราย Lv.34, โกเลมทราย Lv.41, บอสผู้พิทักษ์สุริยะ Lv.48
- [x] NPC ทะเลทราย 4 คน + ภารกิจ 4 งาน + Ocean Overview/Save/Checkpoint รองรับสามเกาะ
- [x] เกาะที่ 4 **เกาะเหมันต์คราม** (Lv.51-70): หมู่บ้านนักล่า ทะเลสาบน้ำแข็ง เหมืองคริสตัล และป้อมราชัน
- [x] แมงมุมน้ำแข็ง Lv.51, โจรน้ำแข็ง Lv.55, โกเลมคริสตัล Lv.62, บอสราชันน้ำแข็ง Lv.68
- [x] NPC หิมะ 4 คน + ภารกิจ 4 งาน + Ocean Overview/Save/Checkpoint รองรับสี่เกาะ
- [x] เกาะที่ 5 **เกาะนภาวายุ** (Lv.71-90): หมู่บ้านหน้าผา สวนเมฆ โรงตีผลึก และวิหารพายุ
- [x] ปูเมฆ Lv.71, โจรเวหา Lv.75, โกเลมพายุ Lv.82, บอสเจ้าแห่งพายุ Lv.88
- [x] NPC นภา 4 คน + ภารกิจ 4 งาน + Ocean Overview/Save/Checkpoint รองรับห้าเกาะ
- [ ] เกาะที่ 6 และเส้นทาง World Progression ช่วง Lv.91+
- [ ] ร้านค้าเฉพาะเกาะ / Fruit Spawn / วัตถุดิบประจำ biome

## Phase 10 — Server Migration และ Multiplayer ⬜

- [ ] ย้ายข้อมูลสำคัญออกจาก localStorage (เงิน ตำแหน่ง เรือ ownership เลเวล) ขึ้น server
- [ ] Server Authoritative + Login
- [ ] Sync Player + Chat + Party

## Phase 11 — Raid, Awakening, Sea Events และ Endgame ⬜

- [ ] Raid Boss / World Boss
- [ ] Fruit Awakening
- [ ] Sea Events + Treasure

## Phase 12 — Trading, Crew, PvP และ Live-Service ⬜

- [ ] Trading ระหว่างผู้เล่น
- [ ] Crew (กิลด์) + สงคราม
- [ ] PvP + จัดอันดับ
- [ ] ระบบ Live-Service (อีเวนต์หมุนเวียน)

---

## สถาปัตยกรรมปัจจุบัน

```
Three.js Client (single-player)
├── engine/    game loop, input, graphics preset
├── world/     เกาะ, ทะเล, day/night, collision, POI
├── island/    หมู่บ้าน ท่าเรือ สิ่งปลูกสร้าง
├── player/    character controller (เดิน/ว่าย/dash/stun)
├── camera/    third person
├── boat/      เรือ + ร้าน + ownership
├── monster/   AI + แคมป์ + บอส + heavy attack
├── combat/    ⭐ Combat Framework: state machine, loadout,
│              damage pipeline, guard, skill data
├── progression/ Level / Stats / Mastery / Reward / Save migration
├── quest/     Quest definitions / progress / manager
├── npc/       NPC + บทสนทนา
├── effects/   slash / shockwave / damage numbers
├── ui/        HUD, progression, mastery, quest, touch controls, ร้านค้า
└── save/      localStorage (ต้องย้ายขึ้น server ก่อน Phase 10)
```

หมายเหตุ: ข้อมูลสำคัญ (เงิน เรือ ตำแหน่ง loadout และ progression) ยังอยู่ใน localStorage —
เหมาะกับ single-player vertical slice แต่ต้อง migrate ใน Phase 10
