# Character Assets A2

Phase A2 เพิ่มตัวละครแบบ articulated โดยคง gameplay root, collider และ movement logic เดิมทั้งหมด

## Player

- ใช้ `PiratePlayerVisual.ts` ซึ่งสร้างใหม่ในโปรเจกต์แทนโมเดล Soldier เดิมทั้งหมด
- Human-proportion Pirate V1: เสื้อโค้ต กางเกง บูต ผ้าโพกหัว ใบหน้า และวัสดุ Mobile PBR
- rig มี spine, arms, forearms, hands, upper/lower legs และ feet ที่ควบคุม pivot ได้เอง
- มี calibrated `socket:left-palm`, `socket:right-palm` และ `socket:hips`
- รองรับ `Idle`, `Walk`, `Run`, `Swim`, `Jump/Airborne`, `Attack 1–4`, `Cast`, `Block`, `Stunned`, `Knockback`, `Knockdown` และ `Death`
- ท่าโจมตีแยก silhouette ตามหมวด `style`, `sword`, `gun` และ `fruit`
- animator อ่าน `CombatState` และ active loadout เท่านั้น ไม่กำหนด damage, hitbox, cooldown หรือ timing

## NPC

- Humanoid สัดส่วน Stylized Realism ไม่ใช่ chibi
- แยก pivot ลำตัว ศีรษะ แขน และขา
- ใช้วัสดุ Mobile PBR สำหรับ skin, cloth, leather, iron และ hair
- มี idle breathing, head look และ talk/wave เมื่อผู้เล่นเข้าใกล้

## Visual Contract

- `CharacterVisualResult.group` คือ world/gameplay root
- `CharacterVisualResult.rig` คือ visual pivots ที่ animator แก้ได้
- `PiratePlayerRig` คือ visual rig ของผู้เล่นและเป็นเจ้าของ calibrated equipment sockets
- Animation ห้ามย้าย world root หรือแก้ collider
- อุปกรณ์ของมอนสเตอร์ผูกกับ bone/pivot เช่น `attachment:cutlass`

## Optimization

- ไม่มี geometry/material allocation ใน animation update
- Pirate V1 ใช้ 4,238 triangles, 18 merged meshes และ 3 material slots
- สีเสื้อผ้าถูก bake เป็น vertex color บน PBR atlas materials เพื่อลด material switch
- geometry และ material cache เป็นงาน optimization รอบถัดไป
- Soldier GLB ไม่ถูกโหลดใน runtime แล้ว
