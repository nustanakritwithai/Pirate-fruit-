# Animation Actions A2

## Action Map

| Actor | Gameplay Source | Visual Action |
|---|---|---|
| Player | movement speed / grounded | Idle, Walk, Run, Airborne |
| Player | `CombatState.attack1–4` | Style/Sword/Gun attack overlay และ finisher |
| Player | `casting` | Cast pose; Fruit ใช้ silhouette กว้างกว่า |
| Player | `blocking` | two-arm guard pose |
| Player | `stunned`, `knockback`, `knockdown`, `dead` | hit reaction, recoil, fall, death |
| NPC | player distance | Idle หรือ Talk/Wave |
| Monster | AI state | Idle, Walk, Run/Chase |
| Monster | attack event / `pendingHeavy` | Attack หรือ Heavy Telegraph |
| Monster | damage / death | Hit หรือ Death |

## Runtime Rules

1. `AnimationMixer` อัปเดต locomotion ของ Player ก่อน
2. `PlayerActionAnimator` เติม bone overlay หลัง mixer
3. `ProceduralCharacterAnimator` restore base pose แล้วคำนวณ pose ใหม่ทุก frame
4. visual animation ห้ามสร้าง hitbox, apply damage, consume energy หรือเริ่ม cooldown
5. visual animation ห้ามย้าย gameplay/world root
6. Equipment ใช้ shared Mixamo socket adapter และมีตำแหน่ง fallback เมื่อ bone ขาด

## Transition Policy

- Locomotion ใช้ crossfade 0.2 วินาทีจากระบบเดิม
- Combat overlay เริ่มตาม `CombatState` ที่มีอยู่ ไม่มี animation-owned timing
- Heavy telegraph ค้างตาม `pendingHeavy`; release animation เริ่มจาก event เดิม
- Death/respawn reset internal rig เพื่อป้องกัน pose ค้าง

## Verification

- Unit test ตรวจ standard rig nodes และ attachment
- Unit test ตรวจ locomotion/attack/death โดย world root ไม่ขยับ
- Unit test ตรวจ Mixamo block และ sword attack overlays
- Full build และ logic test suite ต้องผ่านก่อน merge
