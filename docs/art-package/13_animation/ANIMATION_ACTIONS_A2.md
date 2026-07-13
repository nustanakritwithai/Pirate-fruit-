# Animation Actions A2

## Action Map

| Actor | Gameplay Source | Visual Action |
|---|---|---|
| Player | movement speed / grounded | Idle, Walk, Run, Airborne |
| Player | `CombatState.attack1–4` | Sword: diagonal/reverse/rising/spin; Style: jab/hook/uppercut/spinning kick; Gun recoil; Fruit palm strike |
| Player | `casting` | Cast pose; Fruit ใช้ silhouette กว้างกว่า |
| Player | `blocking` | two-arm guard pose |
| Player | `stunned`, `knockback`, `knockdown`, `dead` | hit reaction, recoil, fall, death |
| NPC | player distance | Idle หรือ Talk/Wave |
| Monster | AI state | Idle, Walk, Run/Chase |
| Monster | attack event / `pendingHeavy` | Attack หรือ Heavy Telegraph |
| Monster | damage / death | Hit หรือ Death |

## Runtime Rules

1. `PlayerActionAnimator` restore Pirate V1 bind pose ทุก frame
2. animator วาด Idle/Walk/Run/Swim ก่อน แล้วจึงเติม pose จาก `CombatState`
3. `ProceduralCharacterAnimator` restore base pose ของ NPC/Monster แล้วคำนวณ pose ใหม่ทุก frame
4. visual animation ห้ามสร้าง hitbox, apply damage, consume energy หรือเริ่ม cooldown
5. visual animation ห้ามย้าย gameplay/world root
6. Equipment วาง grip origin ตรง calibrated palm socket โดยตรงและมีตำแหน่ง fallback เมื่อ socket ขาด
7. Combat Core ส่ง attack progress 0..1 ให้ visual เพื่อ sync windup/strike/recovery โดย visual ไม่มีสิทธิ์เปลี่ยน timing

## Transition Policy

- Locomotion ใช้รอบการเคลื่อนไหวต่อเนื่องจาก elapsed time และคืน bind pose ก่อนเปลี่ยนท่า
- Combat overlay เริ่มตาม `CombatState` ที่มีอยู่ ไม่มี animation-owned timing
- แต่ละ loadout มี ready stance และแต่ละ Combo 1–4 มี full-body pose คนละชุด
- Heavy telegraph ค้างตาม `pendingHeavy`; release animation เริ่มจาก event เดิม
- Death/respawn reset internal rig เพื่อป้องกัน pose ค้าง

## Verification

- Unit test ตรวจ standard rig nodes และ attachment
- Unit test ตรวจ locomotion/attack/death โดย world root ไม่ขยับ
- Unit test ตรวจ Pirate V1 locomotion, block, sword attack และ quaternion drift
- Unit test ตรวจว่า sword/gun grip อยู่ตรง palm socket ระหว่างหมุนแขน
- Unit test ตรวจ pairwise pose difference ของ Sword/Style Combo 1–4
- Unit test ตรวจว่า idle sword blade ไม่ชน torso bounds
- Full build และ logic test suite ต้องผ่านก่อน merge
