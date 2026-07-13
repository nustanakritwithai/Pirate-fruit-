# Monster Assets A2

Phase A2 ปรับมอนสเตอร์ Starter Island ให้เป็น articulated Mobile PBR โดยไม่เปลี่ยน AI, reward, HP, damage, attack range หรือ respawn timing

| Monster | Asset | Readable Actions |
|---|---|---|
| Sea Crab | articulated shell, claws, leg banks, eye stalks | Idle, Scuttle, Attack, Heavy Telegraph, Hit, Death |
| Wandering Pirate | humanoid pirate, hat, beard, cutlass | Idle, Walk/Chase, Attack, Heavy Telegraph, Hit, Death |
| Blackbeard Captain | boss silhouette, cape, shoulder armor, cutlass | Idle, Walk/Chase, Attack, Heavy Telegraph, Hit, Death |

## Gameplay Boundary

- `MonsterManager` ส่ง visual event ตอน attack ถูกปล่อยตาม timing เดิม
- `pendingHeavy` ใช้ขับท่าง้างและ emissive telegraph เดิม
- `takeDamage()` ส่ง hit reaction หลัง damage pipeline เดิมคำนวณเสร็จ
- death animation ทำงานใน internal rig; world root และ respawn point ไม่เปลี่ยน
- boss knockback resistance และทุกค่าของ Combat Framework คงเดิม

## Art Follow-up

- เพิ่ม LOD ให้ Crab/Pirate/Captain
- cache geometry/material ที่ใช้ซ้ำในฝูงมอนสเตอร์
- เปลี่ยน Captain เป็น authored GLB เมื่อ silhouette และ animation set ผ่าน playtest
- เพิ่ม animation clip compression เมื่อเปลี่ยนจาก procedural เป็น authored clips
