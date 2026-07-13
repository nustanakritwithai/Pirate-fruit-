# Current Asset Audit

วันที่ audit: 2026-07-13 — ตรวจจากไฟล์และ runtime source หลังรวม Phase 7/8 เท่านั้น ค่า poly procedural เป็นค่าประมาณ ส่วน license ที่ไม่มีไฟล์หลักฐานเป็น `UNKNOWN`

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
| Pirate V1 procedural rig | Player | 4,238 tris; 18 merged meshes; shared 64px micro maps | 3 Mobile PBR atlas materials + vertex colors | Single hero | runtime-ready; add distant LOD later | Missing LOD | controller capsule; visual rig separate | project code | READY |
| Articulated procedural NPC human | 4 NPCs; idle/talk/wave | runtime benchmark pending | skin/cloth/leather/metal PBR | standard 7-pivot rig | shared geometry/cache later | Missing LOD | radius proxy; visual rig separate | code | OPTIMIZE |

## Monsters

| Asset | Usage | Poly | Material | Reuse | Optimize/Replace | LOD | Collider | License | Status |
|---|---|---:|---|---|---|---|---|---|---|
| Articulated PBR Crab | normal camps; scuttle/attack/heavy/hit/death | runtime benchmark pending | shell/leather PBR | standard crab rig | cache geometry/material | Missing LOD | gameplay radius; visual rig separate | code | OPTIMIZE |
| Articulated PBR Pirate | grunt; chase/attack/heavy/hit/death | runtime benchmark pending | cloth/skin/leather/iron | standard humanoid rig | cache geometry/material | Missing LOD | gameplay radius; visual rig separate | code | OPTIMIZE |
| Articulated PBR Captain | boss; chase/attack/heavy/hit/death | runtime benchmark pending | same + cape/armor | standard humanoid rig | authored boss GLB later | Missing LOD | boss radius; visual rig separate | code | REPLACE |

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

1. เพิ่ม LOD ให้ Pirate V1, Boss, boats และ huts
2. เพิ่ม license/provenance files สำหรับ texture ภายนอกที่ยังเป็น UNKNOWN
3. แปลง texture เป็น KTX2/Basis หลัง benchmark
4. เปลี่ยน emoji UI เป็น icon atlas ที่มี license
5. เปลี่ยน Boss procedural เป็น authored Mobile PBR GLB เมื่อ P7 integration คงที่
