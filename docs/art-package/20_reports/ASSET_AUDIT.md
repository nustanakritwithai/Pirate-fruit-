# Current Asset Audit

วันที่ audit: 2026-07-12 — ตรวจจากไฟล์และ runtime source ใน repository เท่านั้น ค่า poly procedural เป็นค่าประมาณ ส่วน license ที่ไม่มีไฟล์หลักฐานเป็น `UNKNOWN`

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
| `Soldier.glb` | Player | ~11,376 tris; 2 meshes/materials/textures; 4 clips | embedded PBR enhanced runtime | Single hero | compress mesh/textures | Missing LOD | controller capsule | UNKNOWN | OPTIMIZE |
| Procedural NPC human | 4 NPCs | estimated 2k–4k each | skin/cloth/leather/metal PBR | material presets | shared geometry/cache later | Missing LOD | radius proxy | procedural | OPTIMIZE |

## Monsters

| Asset | Usage | Poly | Material | Reuse | Optimize/Replace | LOD | Collider | License | Status |
|---|---|---:|---|---|---|---|---|---|---|
| PBR Crab | normal camps | estimated 3k–5k | shell/leather PBR | per type | cache geometry/material | Missing LOD | gameplay radius | procedural | OPTIMIZE |
| PBR Pirate | grunt | estimated 3k–6k | cloth/skin/leather/iron | per type | cache geometry/material | Missing LOD | gameplay radius | procedural | OPTIMIZE |
| PBR Captain | boss | estimated 5k–8k | same + cape/armor | one | authored boss GLB later | Missing LOD | boss radius | procedural | REPLACE |

## Boat

| Asset | Usage | Poly/Texture | Material | Reuse | Optimize/Replace | LOD | Collider | License | Status |
|---|---|---|---|---|---|---|---|---|---|
| Procedural boats | owned/spawned boat | estimated 4k–8k | wood/cloth/rope/iron PBR | per definition | authored hull LOD later | Missing LOD | boat gameplay bounds | procedural + UNKNOWN textures | OPTIMIZE |

## Weapons / UI / VFX

| Asset | Usage | Detail | License | Status |
|---|---|---|---|---|
| Training sword visual | active sword | procedural PBR metal/leather | procedural | READY |
| Fighting wraps | active style | procedural cloth | procedural | READY |
| HUD/UI icons | touch/progression | emoji + DOM/CSS | platform font dependent | REPLACE |
| Combat VFX | slash/shockwave/impact | shared/additive geometry, unlit | procedural | READY |

## Priority

1. เพิ่ม LOD ให้ Soldier, Boss, boats และ huts
2. เพิ่ม license/provenance files สำหรับ texture และ Soldier GLB
3. แปลง texture เป็น KTX2/Basis หลัง benchmark
4. เปลี่ยน emoji UI เป็น icon atlas ที่มี license
5. เปลี่ยน Boss procedural เป็น authored Mobile PBR GLB เมื่อ P7 integration คงที่
