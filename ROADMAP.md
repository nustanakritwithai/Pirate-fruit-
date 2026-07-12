# 🏴‍☠️ Pirate Fruit — Roadmap (v2)

แผนพัฒนาเกมโอเพนเวิลด์แนว Blox Fruits ด้วย Three.js + TypeScript
ปรับโครงใหม่ให้ตรงกับสถานะจริงของโค้ด: เกมไม่ใช่ prototype เดินเล่นแล้ว
แต่เป็น **single-player vertical slice** ที่มีโลก เรือ มอนสเตอร์ บอส และ Combat Framework แล้ว

หลักการ: **หยุดเพิ่มระบบแนวกว้างชั่วคราว แล้วสร้างแกนกลางสามส่วนให้แข็งแรง**
Combat Framework → Level/Stats/Mastery → Quest/Reward Loop

วงจรเกมเป้าหมาย:
รับ Quest → ต่อสู้ → ได้ EXP และเงิน → เพิ่ม Level → อัป Stats → เพิ่ม Mastery
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
→ ตรวจเป้าหมาย → คำนวณ Damage → Apply → Stun/Knockback → **Reward Contribution hook** (รอ Phase 6)

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

## Phase 6 — Level, Stats, Mastery และ Quest พื้นฐาน ⬜

- [ ] Player Level + EXP (ต่อจาก Reward Contribution hook ที่วางไว้แล้ว)
- [ ] Stat Points 5 สาย: **Combat / Vitality / Blade / Ranged / Fruit Power**
- [ ] Mastery แยกตามของแต่ละชิ้น: Basic Brawl, Sword แต่ละเล่ม, Gun แต่ละกระบอก, Fruit แต่ละผล
      (ไม่มี Weapon Mastery / Haki Mastery รวม)
- [ ] สกิลปลดตาม masteryRequired (ฟิลด์มีอยู่แล้วใน SkillDefinition)
- [ ] Quest พื้นฐานจาก NPC: ฆ่ามอน / เก็บของ — แหล่ง EXP ที่เป็นระบบ
- [ ] รางวัล: เงิน (ผูกกับ BoatProgress coins เดิม) + EXP + Mastery

## Phase 7 — Fighting Style, Sword และ Loadout เต็มรูปแบบ ⬜

- [ ] Fighting Style หลายสาย + ครูฝึกสอน (ซื้อ/เปลี่ยน)
- [ ] ดาบหลายเล่ม (ดรอปจากบอส/ร้าน)
- [ ] UI จัดการ Loadout 5 ช่อง + สลับของในช่องเดียวกัน
- [ ] สกิลต่อของแต่ละชิ้น ปลดตาม Mastery

## Phase 8 — Fruit Framework ⬜

- [ ] โครงผลไม้ปีศาจ: กิน → เปลี่ยนสายพลัง → สกิลเฉพาะ (หมวด fruit ใน Loadout)
- [ ] Fruit Dealer + สุ่ม (Gacha) + ความหายาก Common → Mythic
- [ ] Fruit Spawn ตามจุดบนเกาะ
- [ ] Mastery ต่อผล + ปลดสกิลตามระดับ

## Phase 9 — หลายเกาะและ World Progression ⬜

- [ ] เกาะที่ 2-3 (ระดับมอนสูงขึ้น) + การเดินเรือระหว่างเกาะ
- [ ] เลเวลขั้นต่ำต่อเกาะ + ป้ายบอกระดับ
- [ ] บอส/ร้านค้า/NPC ต่อเกาะ

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
├── npc/       NPC + บทสนทนา
├── effects/   slash / shockwave / damage numbers
├── ui/        HUD, minimap, boss bar, touch controls, ร้านค้า
└── save/      localStorage (ต้องย้ายขึ้น server ก่อน Phase 10)
```

หมายเหตุ: ข้อมูลสำคัญ (เงิน เรือ ตำแหน่ง loadout) ยังอยู่ใน localStorage —
เหมาะกับ single-player prototype แต่ต้อง migrate ใน Phase 10
