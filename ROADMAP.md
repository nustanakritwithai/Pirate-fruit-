# 🏴‍☠️ Pirate Fruit — Roadmap

แผนพัฒนาเกมโอเพนเวิลด์แนว Blox Fruits ด้วย Three.js แบ่งเป็น 12 Phase
แต่ละ Phase เล่นและทดสอบได้จริงก่อนขยายต่อ เพื่อให้ AI Agent สร้างและทดสอบได้ทีละระบบ

สถานะ: ✅ เสร็จแล้ว · 🔨 กำลังทำ · ⬜ ยังไม่เริ่ม

---

## Phase 1 — Core Prototype ✅

เป้าหมาย: **"เดินเล่นได้"**

- [x] ระบบ Three.js (renderer, game loop แบบ fixed timestep)
- [x] โหลดแผนที่ (เกาะเริ่มต้น)
- [x] ตัวละคร 3D (GLTF + animation Idle/Walk/Run)
- [x] กล้อง Third Person (pointer lock + ซูมล้อเมาส์)
- [x] เดิน / วิ่ง / กระโดด
- [x] Sprint (ใช้ Energy, หมดแล้วต้องรอฟื้น)
- [x] ระบบชน (Collision — พื้นเกาะ + สิ่งกีดขวาง)
- [x] HUD พื้นฐาน (HP, Energy, พิกัด, FPS, คำแนะนำปุ่ม)
- [x] มินิแมพ (วาดเกาะจากสูตรความสูง + ลูกศรบอกทิศผู้เล่น + ทิศเหนือ)
- [x] เซฟตำแหน่ง (localStorage + autosave + respawn ตอนตกน้ำ)
- [x] รองรับมือถือ: ระบบบังคับแบบ RoV (จอยสติ๊กเสมือน, ปุ่มโจมตีหลัก, ช่องสกิล 3 + ไม้ตาย 1, กระโดด, หมุนกล้องด้วยการลากนิ้ว)
- [x] พุ่งหลบ (Dash) ติดตัว — คูลดาวน์ 2.2 วิ + ใช้ Energy (ปุ่ม `Q` บน PC / ปุ่ม 💨 บนมือถือ)
- [x] กราฟฟิก Mobile Realistic PBR: ท้องฟ้าบรรยากาศจริง (Sky + env map), พื้นเกาะ texture splatting ทราย/หญ้า/หิน (albedo+normal), น้ำทะเล normal map เคลื่อนไหว 2 ชั้น, ปาล์ม/หิน/ลังใช้ texture PBR จริง (CC0 จาก ambientCG)

## Phase 2 — โลกของเกม ✅

สร้างโลกแบบเกาะ

- [x] เกาะเริ่มต้น: หมู่บ้าน หาดฝึก สวนผลไม้ ศาลาบนเนิน และท่าเรือ
- [x] ทะเล shader แบบ Mobile PBR พร้อมสีตามระยะชายฝั่งและฟองคลื่น
- [x] คลื่นภาพ 2 ชั้น + `getWaveHeight()` เตรียมใช้กับเรือใน Phase 3
- [x] ท้องฟ้าบรรยากาศจริง + เมฆแบบ InstancedMesh
- [x] กลางวัน/กลางคืน 12 นาที พร้อมโคมไฟกลางคืนและเซฟเวลา
- [x] NPC 4 ตัว พร้อมชื่อ ระยะโต้ตอบ และบทสนทนาแบบหลายหน้า
- [x] Safe Spawn แยกจาก autosave ป้องกันเกิดซ้ำในจุดอันตราย
- [x] จุดสำคัญของเกาะแสดงบนมินิแมพ
- [x] ระดับกราฟิก Low / Medium / High พร้อมเลือกอัตโนมัติบนมือถือ

## Phase 3 — ระบบเรือ ✅

- [x] อู่เรือกัปตันคราม + เงินและ ownership ที่บันทึกใน localStorage
- [x] เรือพายฝึกหัดฟรี + เรือใบวายุราคา 500 เหรียญ
- [x] เรียก/เก็บ/ซ่อมเรือ และจำกัดเรือใช้งานพร้อมกันหนึ่งลำ
- [x] ขึ้น/ลงเรือ พร้อมสลับกล้อง Input และปุ่มมือถือ
- [x] ขับหน้า ถอย เลี้ยว เบรก Boost และ Anchor
- [x] ลอยตามคลื่น 4 จุดด้วย `getWaveHeight()`
- [x] HP เรือ ชนเกาะ ดาเมจ เอฟเฟกต์แตก และ cooldown เรียกใหม่
- [x] Dock Zone จอดเทียบท่าและลงบนท่าอย่างปลอดภัย
- [x] Boat HUD: HP ความเร็ว Anchor และ Boost cooldown

## Phase 4 — ระบบมอนสเตอร์ ✅

แต่ละเกาะมี

- [x] เลเวลกำกับต่อโซน/มอนสเตอร์ (แสดง Lv บนหลอดเลือด — การบังคับ gate รอ Player Level ใน Phase 6)
- [x] มอนสเตอร์หลายชนิด: ปูทะเลดุ (Lv.2) และโจรสลัดเร่ร่อน (Lv.4) พร้อม HP / Damage ต่างกัน
- [x] AI ไล่ผู้เล่น (idle/wander → chase → attack → กลับบ้าน, ไม่เดินลงน้ำ)
- [x] Respawn (ตาย → ยุบหาย → เกิดใหม่ที่แคมป์เดิม; ผู้เล่นตาย → กลับหมู่บ้าน+ฟื้น HP)
- [x] Boss กัปตันหนวดดำ (Lv.10, HP 680) + แถบเลือดบอสกลางบน
- [x] ต่อสายการโจมตี melee (กรวยหน้าตัวละคร) ให้ทำดาเมจจริง + เอฟเฟกต์โดนตี + แฟลชจอแดงตอนโดน

## Phase 5 — Combat ⬜

- [ ] หมัด + คอมโบ
- [ ] ดาบ
- [ ] Dash
- [ ] Block
- [ ] Skill
- [ ] เอฟเฟกต์
- [ ] Knockback

## Phase 6 — ระบบเลเวล ⬜

ผู้เล่นมี

- [ ] Level / EXP
- [ ] HP / Energy สเกลตามเลเวล
- [ ] Stat Point
- [ ] อัปค่าสถานะ: Melee / Defense / Sword / Fruit

## Phase 7 — ผลไม้ปีศาจ ⬜

- [ ] ระบบสุ่มผลไม้
- [ ] ความหายาก: Common / Rare / Epic / Legendary / Mythic
- [ ] กินแล้วเปลี่ยนสายพลัง + สกิลเฉพาะ
- [ ] Mastery ของผลไม้ (1 / 20 / 50 / 100 / 200)
- [ ] ปลดล็อกสกิลใหม่ตามระดับ Mastery

## Phase 8 — Quest ⬜

- [ ] NPC ให้เควส: ฆ่ามอน / เก็บของ / ส่งของ / ล่าบอส
- [ ] รางวัล: เงิน / EXP / ไอเทม

## Phase 9 — ระบบเกาะ ⬜

สร้างเกาะหลายระดับ

- [ ] 1. Beginner Island
- [ ] 2. Jungle Island
- [ ] 3. Desert Island
- [ ] 4. Snow Island
- [ ] 5. Sky Island
- [ ] 6. Volcano Island
- [ ] 7. Underwater Island
- [ ] 8. Ancient Island
- [ ] 9. Demon Island
- [ ] 10. Final Island

แต่ละเกาะ: มอนสเตอร์ / NPC / ร้านค้า / บอส / ดันเจียน

## Phase 10 — Multiplayer ⬜

- [ ] Server Authoritative
- [ ] Login
- [ ] Sync Player
- [ ] Chat
- [ ] Party
- [ ] PvP
- [ ] Trading
- [ ] Guild

## Phase 11 — Endgame ⬜

- [ ] Raid Boss
- [ ] World Boss
- [ ] Dungeon
- [ ] Sea Event
- [ ] Treasure
- [ ] Rare Fruit Event

## Phase 12 — Optimization (มือถือ) ⬜

- [ ] LOD
- [x] Instancing (ต้นปาล์ม ใบไม้ หิน ลัง เมฆ และชิ้นส่วนท่าเรือ)
- [ ] Frustum Culling
- [x] Texture Compression (ทำก่อนกำหนด — JPG 1K บีบ mozjpeg รวม ~2.4MB)
- [x] Mobile PBR (ทำก่อนกำหนด — ดูหมายเหตุ Phase 1)
- [x] Dynamic Shadow ระดับต่ำ (ทำก่อนกำหนด — มือถือลด shadow map 2048→1024 + จำกัด pixel ratio 1.5)
- [ ] Occlusion Culling

---

## โครงสร้างโปรเจกต์

```
client/                 # เกมฝั่งเบราว์เซอร์ (Vite + TypeScript + Three.js)
    src/
        engine/         # game loop, renderer, input
        camera/         # กล้อง third person
        player/         # ตัวละคร + character controller
        world/          # เกาะ, ทะเล, แสง, collision, props
        ui/             # HUD
        save/           # เซฟลง localStorage
        # จะเพิ่มใน Phase ถัดๆ ไป:
        # ocean/ island/ monster/ npc/ combat/ fruit/ skills/
        # inventory/ quest/ boat/ effects/

server/                 # เพิ่มใน Phase 10 (Multiplayer)
    # auth/ player/ combat/ ai/ quest/ fruit/
    # inventory/ save/ network/
```

## ลำดับการพัฒนา

1. ✅ เดิน วิ่ง กระโดด
2. ✅ กล้อง
3. ✅ เกาะแรก
4. ✅ ทะเลและคลื่น
5. ✅ เรือ
6. ✅ มอนสเตอร์
7. 🔨 ต่อสู้ (melee พื้นฐานทำดาเมจแล้ว — ดาบ/สกิล/คอมโบเต็มรูปแบบใน Phase 5)
8. ⬜ เลเวล
9. ⬜ NPC
10. ⬜ เควส
11. ⬜ ผลไม้ปีศาจ
12. ⬜ Mastery
13. ⬜ เกาะใหม่
14. ⬜ Multiplayer
15. ⬜ PvP
16. ⬜ World Boss
17. ⬜ ปรับประสิทธิภาพสำหรับมือถือ
