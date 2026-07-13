# Character & Monster Runtime Integration

เอกสารนี้ระบุจุดเชื่อม Asset เข้าระบบเกม โดยให้ gameplay เป็น source of truth และให้ชั้น art อ่านสถานะเท่านั้น

## Player Pipeline

1. `Player` โหลด `Soldier.glb`
2. `resolveMixamoPlayerRig()` resolve bone มาตรฐานเพียงครั้งเดียว
3. `AnimationMixer` เล่น Idle/Walk/Run จากไฟล์ GLB
4. `PlayerActionAnimator` เติม pose จาก `CombatState` หลัง locomotion
5. `EquipmentVisuals` อ่าน active loadout และตาม hand/hips sockets หลัง bone update

| Loadout | Socket | Visual |
|---|---|---|
| Style | LeftHand + RightHand | fighting wraps |
| Sword | RightHand | active sword |
| Gun | RightHand | active gun |
| Fruit | LeftHand | active fruit |
| Utility | Hips | utility pouch/compass |

หาก model ไม่มี socket ระบบใช้ตำแหน่ง fallback เดิมและเกมยังเริ่มได้

`Soldier.glb` ใช้ palm offset ที่วัดจาก bind-pose skin weights และวางจุดกึ่งกลางด้ามดาบตรงกับ palm แทนการวาง group origin ตรง wrist bone เพื่อป้องกันอาวุธลอยข้างมือ

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
- rig test ตรวจชื่อ Mixamo hands ที่ใช้จริง
- animation tests ตรวจ Player/NPC/Monster poses
- production build และ full logic suite ต้องผ่านก่อน merge
