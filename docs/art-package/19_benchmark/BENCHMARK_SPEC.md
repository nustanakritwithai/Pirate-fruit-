# Benchmark Scene Specification

## Scene Contents

- Starter Island และ ocean ทั้งฉาก
- อาคารหมู่บ้าน/ท่าเรือ/ศาล/หาดฝึก
- vegetation ตาม Medium profile
- Normal Monster 8 ตัว + Boss 1 ตัว
- Boat 1 ลำ
- Player + visible equipment
- M1 combo, projectile, AoE และ impact VFX
- วัดทั้ง Noon และ Night

ใช้ save/teleport สำหรับวางกล้องทดสอบได้ แต่ห้ามสร้าง gameplay branch เฉพาะ benchmark

## Metrics and Targets

| Metric | Low | Medium | High |
|---|---:|---:|---:|
| FPS minimum | 30 | 30 | 30 |
| FPS target | 45 | 45–60 | 45–60 |
| Frame time target | ≤22.2 ms | ≤22.2 ms | ≤22.2 ms |
| Draw calls | ≤85 | ≤120 | ≤150 |
| Visible triangles | ≤150k | ≤220k | ≤300k |
| Texture GPU count | ≤30 | ≤40 | ≤50 |
| Programs | ≤24 | ≤32 | ≤40 |

## Procedure

1. เปิด `?quality=medium&debugPBR=1`
2. Warm-up 30 วินาที
3. เก็บค่า idle village, forest combat, boss combat, boat/ocean อย่างละ 60 วินาที
4. ทำซ้ำ Noon/Night และ portrait/landscape
5. บันทึก median, 1% low, peak draw calls/triangles และ memory warning
6. ถ้า Medium ต่ำกว่า 30 FPS ห้ามเพิ่ม asset ใหม่จนแก้ benchmark ผ่าน
