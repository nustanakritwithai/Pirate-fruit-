# Current Asset Audit

วันที่ audit: 2026-07-15 — ตรวจจากไฟล์และ runtime source หลังเชื่อม Character/Monster/NPC GLB ทุกเกาะ ค่า poly GLB นับจาก index accessor ส่วน license ที่ไม่มีไฟล์หลักฐานเป็น `UNKNOWN`

## Environment

| Asset | Usage | Poly/Texture | Material | Reuse | Optimize/Replace | LOD | Collider | License | Status |
|---|---|---|---|---|---|---|---|---|---|
| Procedural terrain | Starter Island ground | 72–140 grid segments; 3-way splat | PBR grass/sand/rock | High | keep shader budget | tier geometry | height function | code | READY |
| Grass/Sand/Rock textures | terrain | JPEG ~1K, color+normal | Standard PBR | High | add compressed KTX2 later | N/A | N/A | UNKNOWN | OPTIMIZE |
| Ocean normal | ocean | JPEG ~1K | dual-normal Physical | High | KTX2 later | tier segments | wave formula | UNKNOWN | OPTIMIZE |
| Palms | island vegetation | instanced trunk/fronds | bark + alpha foliage | High | billboard LOD later | Missing LOD | cylinder proxy | procedural/UNKNOWN texture | OPTIMIZE |
| Rocks | island props | instanced icosahedron | rock PBR | High | LOD2 optional | tier detail only | sphere proxy | UNKNOWN | OPTIMIZE |
| Ground cover/shrubs | island detail | instanced | shared Mobile PBR | High | verify alpha overdraw | distance culling only | none | procedural | READY |
| Clouds | sky | instanced planes, 256 canvas | unlit alpha | High | verify overdraw | count by tier | none | procedural | READY |

## Buildings

| Asset | Usage | Poly/Texture | Material | Reuse | Optimize/Replace | LOD | Collider | License | Status |
|---|---|---|---|---|---|---|---|---|---|
| Village huts | 4 starter huts | procedural primitives | plaster/wood/stone/glass PBR | High | modular GLB later | Missing LOD | radius proxy | procedural | OPTIMIZE |
| Harbor dock | starter harbor | instanced 34 boards | planks PBR | High | retain instancing | Missing LOD | platform proxy | UNKNOWN texture | READY |
| Hill shrine | POI | procedural | stone/terracotta PBR | Medium | add authored detail later | Missing LOD | none | procedural | OPTIMIZE |
| Lanterns | village/night | instanced + max 3 lights | emissive shell | High | within tier budget | N/A | none | procedural | READY |

## Characters

| Asset | Usage | Poly/Texture | Material | Reuse | Optimize/Replace | LOD | Collider | License | Status |
|---|---|---|---|---|---|---|---|---|---|
| Quaternius Henry | Player + general NPC | 11,062 tris; embedded texture; 14 clips | 2 GLTF PBR slots | shared cached geometry | add distant LOD | Missing LOD | controller/radius proxy; visual rig separate | CC0-1.0 | OPTIMIZE |
| Quaternius Anne | female NPC roles across 6 islands | 12,368 tris; embedded texture; 14 clips | 2 GLTF PBR slots | high | mobile visual QA + distant LOD | Missing LOD | radius proxy; visual rig separate | CC0-1.0 | OPTIMIZE |
| Quaternius Mako / Pirate Captain | harbor masters and quest chiefs | 10,576–13,170 tris; 14 clips | 2 GLTF PBR slots | high | add distant LOD | Missing LOD | radius proxy; visual rig separate | CC0-1.0 | OPTIMIZE |
| Pirate V1 procedural rig | player/NPC fallback if GLB load fails | 4,238 tris; shared 64px maps | 3 Mobile PBR atlas slots | fallback only | retain fallback | Missing LOD | gameplay proxy | project code | READY |

## Monsters

| Asset | Usage | Poly | Material | Reuse | Optimize/Replace | LOD | Collider | License | Status |
|---|---|---:|---|---|---|---|---|---|---|
| Pirate Kit Mako / Captain / Sharky / Skeleton | pirate families, raiders, cultists and captain | 10,576–14,594 tris; 14–15 clips | 2 GLTF PBR slots | cached by asset ID | Sharky exceeds target; add LOD | Missing LOD | gameplay radius; visual rig separate | CC0-1.0 | OPTIMIZE |
| Easy Enemies Spider | crab/scorpion/crawler families on 5 biomes | 2,712 tris; 5 clips | 2 GLTF PBR slots + biome tint | very high | mobile visual QA | Missing LOD | gameplay radius; visual rig separate | CC0-1.0 | OPTIMIZE |
| Ultimate Monsters Goleling | construct/golem families on 5 biomes | 3,696 tris; 8 clips | 4 GLTF PBR slots + biome tint | very high | mobile visual QA | Missing LOD | gameplay radius; visual rig separate | CC0-1.0 | OPTIMIZE |
| Goleling Evolved / Yeti / Hywirl / Demon | island bosses | 2,136–6,712 tris; 8–14 clips | 3–6 GLTF PBR slots + biome tint | per boss family | mobile visual QA + boss LOD | Missing LOD | boss radius; visual rig separate | CC0-1.0 | OPTIMIZE |
| Procedural crab/humanoid rigs | per-asset load failure fallback | runtime benchmark pending | shared Mobile PBR | fallback only | retain fallback | Missing LOD | gameplay radius | project code | READY |

## Boat

| Asset | Usage | Poly/Texture | Material | Reuse | Optimize/Replace | LOD | Collider | License | Status |
|---|---|---|---|---|---|---|---|---|---|
| Procedural boats | owned/spawned boat | estimated 4k–8k | wood/cloth/rope/iron PBR | per definition | authored hull LOD later | Missing LOD | boat gameplay bounds | procedural + UNKNOWN textures | OPTIMIZE |

## Weapons / UI / VFX

| Asset | Usage | Detail | License | Status |
|---|---|---|---|---|
| Training sword visual | active sword | procedural PBR metal/leather | procedural | READY |
| Fighting wraps | active style | procedural cloth | procedural | READY |
| Flintlock visual | active gun | procedural PBR wood/iron/brass | procedural | READY |
| Fruit visual | active fruit; palette from item ID | procedural PBR fruit/foliage | procedural | READY |
| Utility pouch/compass | utility visual foundation | procedural PBR leather/brass | procedural | READY |
| HUD/UI icons | touch/progression | emoji + DOM/CSS | platform font dependent | REPLACE |
| Combat VFX | slash/shockwave/impact | shared/additive geometry, unlit | procedural | READY |

## Priority

1. ทำ mobile visual QA ให้ Anne, Spider และ Ultimate Monsters แล้วสร้าง LOD1 ให้ Sharky/NPC ที่เกิน 12k tris
2. เพิ่ม license/provenance files สำหรับ texture ภายนอกที่ยังเป็น UNKNOWN
3. แปลง texture เป็น KTX2/Basis หลัง benchmark
4. เปลี่ยน emoji UI เป็น icon atlas ที่มี license
5. เก็บ procedural character/monster ไว้เป็น fallback และติดตาม GLB load failure จาก production
