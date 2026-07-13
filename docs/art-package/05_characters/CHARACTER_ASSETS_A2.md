# Character Assets A2

Phase A2 เพิ่มตัวละครแบบ articulated โดยคง gameplay root, collider และ movement logic เดิมทั้งหมด

## Player

- ใช้ `Soldier.glb` และคลิป Mixamo เดิมสำหรับ `Idle`, `Walk`, `Run`
- เพิ่ม procedural bone overlay สำหรับ `Jump/Airborne`, `Attack 1–4`, `Cast`, `Block`, `Stunned`, `Knockback`, `Knockdown` และ `Death`
- ท่าโจมตีแยก silhouette ตามหมวด `style`, `sword`, `gun` และ `fruit`
- overlay อ่าน `CombatState` และ active loadout เท่านั้น ไม่กำหนด damage, hitbox, cooldown หรือ timing

## NPC

- Humanoid สัดส่วน Stylized Realism ไม่ใช่ chibi
- แยก pivot ลำตัว ศีรษะ แขน และขา
- ใช้วัสดุ Mobile PBR สำหรับ skin, cloth, leather, iron และ hair
- มี idle breathing, head look และ talk/wave เมื่อผู้เล่นเข้าใกล้

## Visual Contract

- `CharacterVisualResult.group` คือ world/gameplay root
- `CharacterVisualResult.rig` คือ visual pivots ที่ animator แก้ได้
- Animation ห้ามย้าย world root หรือแก้ collider
- อุปกรณ์ของมอนสเตอร์ผูกกับ bone/pivot เช่น `attachment:cutlass`

## Optimization

- ไม่มี geometry/material allocation ใน animation update
- ตัว procedural ใช้ pivot หลัก 7 จุดต่อหนึ่งตัว
- geometry และ material cache เป็นงาน optimization รอบถัดไป
- `Soldier.glb` ยังต้องมี LOD และ texture compression ตาม Asset Audit
