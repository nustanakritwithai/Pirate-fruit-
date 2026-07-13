# Art Pipeline Summary

## Foundation Complete

- โครงสร้าง Art Package 00–20 พร้อม README
- Art Bible, material presets, budget, manifest, naming และ checklist พร้อมใช้
- Audit asset ปัจจุบันโดยไม่เดา license
- Benchmark spec และ runtime monitor `?debugPBR=1`
- Mobile PBR material library ใช้ micro normal/roughness ร่วมกัน
- Quality tiers: Low 0.75x, Medium 1.0x, High 1.25x

## Runtime Visual Upgrade

- ACES/sRGB/tier exposure และ environment intensity ตามกลางวันกลางคืน
- terrain splat + macro variation + wet-sand shoreline response
- Physical ocean clearcoat + dual normal + shoreline foam
- instanced grass/shrubs/palms/rocks/crates
- PBR village materials และรายละเอียดโครงไม้
- Stylized-realistic NPC, crab, pirate และ boss silhouettes
- PBR boat hull details, sail, rope, metal, barrel และ wake
- GLB material enhancement และ visible equipment ครบ style/sword/gun/fruit/utility
- Procedural fruit palette ผูกกับ item ID จึงรองรับ Fruit Databook โดยไม่เพิ่ม texture ต่อผล
- VFX ตั้ง `toneMapped=false` ให้สี additive คงที่

## Current Status

- READY: runtime material foundation, terrain/ocean, shared presets, Phase 7/8 equipment visuals, registry/checklist
- OPTIMIZE: Soldier GLB, common monsters, boats, huts, texture compression/LOD
- REPLACE: authored Boss model และ emoji UI ในรอบ asset production
- MISSING: verified license files, KTX2 pipeline, authored LOD packs, preview thumbnails

Gameplay modified: **None** — visual integration อ่าน state เท่านั้น ไม่แก้ Combat, Progression, Quest, Fruit, Save, Physics หรือ Network
