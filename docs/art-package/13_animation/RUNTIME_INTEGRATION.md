# Character & Monster Runtime Integration

เอกสารนี้ระบุจุดเชื่อม Asset เข้าระบบเกม โดยให้ gameplay เป็น source of truth และให้ชั้น art อ่านสถานะเท่านั้น

## Player Pipeline

1. `Player` สร้าง Pirate V1 จาก `PiratePlayerVisual.ts`; ไม่มีการโหลด Soldier GLB
2. `PiratePlayerRig` กำหนด pivot และ calibrated palm/hips sockets ที่โปรเจกต์ควบคุมเอง
3. `PlayerActionAnimator` restore bind pose แล้ววาด Idle/Walk/Run/Swim และ `CombatState`
4. `EquipmentVisuals` อ่าน active loadout และตาม palm/hips sockets หลัง animation update

| Loadout | Socket | Visual |
|---|---|---|
| Style | LeftHand + RightHand | fighting wraps |
| Sword | RightHand | active sword |
| Gun | RightHand | active gun |
| Fruit | LeftHand | active fruit |
| Utility | Hips | utility pouch/compass |

ดาบและปืนสร้างโดยให้ group origin เป็นกึ่งกลางด้ามจับ ส่วน socket อยู่กลางฝ่ามือจริง จึงไม่ต้องคำนวณ wrist/palm offset และอาวุธไม่แยกจากมือเมื่อแขนหมุน หาก visual asset ไม่มี socket ระบบยังใช้ตำแหน่ง fallback เพื่อให้เกมเริ่มได้

## NPC Pipeline

- `NPCManager` สร้าง articulated humanoid จาก `CharacterVisuals`
- ระยะผู้เล่นเลือกเฉพาะ visual state `idle` หรือ `talk`
- Dialogue และ interaction callback เดิมเป็นผู้ควบคุม action ของเกม

## Monster Pipeline

- `MonsterManager` เป็นเจ้าของ AI, attack timing และ damage
- `Monster` แปลง AI state เป็น Idle/Walk/Run visual state
- attack release ส่ง visual event เข้า animator โดยไม่เปลี่ยน hit frame
- `pendingHeavy` ขับ heavy pose และ telegraph เดิม
- damage/death/respawn ส่ง Hit/Death/Reset ให้ internal rig
- Reward, Quest และ contribution hooks ทำงานจาก death pipeline เดิม

## Safety Boundary

- Bone/socket code ไม่เขียน `CharacterController.position`
- Animator ไม่สร้าง hitbox หรือคำนวณ damage
- Equipment visual ไม่แก้ loadout; อ่าน active item อย่างเดียว
- Monster visual ไม่แก้ AI constants, HP, reward หรือ respawn duration
- ทุก visual pivot อยู่ใต้ gameplay/world root ที่ระบบเดิมเป็นเจ้าของ

## Verification

- socket test ตรวจว่าอุปกรณ์ตามมือเมื่อมือเคลื่อนและหมุน
- socket test ตรวจว่า gameplay root ไม่ถูกเปลี่ยน
- rig test ตรวจชื่อ calibrated Pirate V1 sockets และยืนยันว่าไม่มี Mixamo node ในผู้เล่นใหม่
- animation tests ตรวจ Player/NPC/Monster poses
- budget test ตรวจ 4,238 triangles, ≤20 meshes และ ≤3 material slots
- production build และ full logic suite ต้องผ่านก่อน merge
