# Material Presets

ค่าตั้งต้น ปรับได้จาก playtest/lighting แต่ต้องบันทึกเหตุผลเมื่อออกนอกช่วง

| Material | BaseColor | Roughness | Metalness | Normal | AO | Emissive |
|---|---|---:|---:|---|---|---|
| Sand | `#CDB884` | 0.96 | 0.00 | 0.45 | subtle | none |
| Grass | `#587C42` | 0.88 | 0.00 | 0.38 | subtle | none |
| Rock | `#747D7C` | 0.86 | 0.00 | 0.75 | medium | none |
| Wood | `#795337` | 0.78 | 0.00 | 0.55 | medium | none |
| Metal | `#737C82` | 0.38 | 0.82 | 0.24 | light | none |
| Leather | `#4A2C1C` | 0.68 | 0.00 | 0.36 | medium | none |
| Cloth | source color | 0.90 | 0.00 | 0.40 | light | none |
| Skin | `#C98F68` | 0.58 | 0.00 | 0.12 | subtle | none |
| Water | deep teal | 0.20 | 0.00 | dual 0.72 | none | foam only |
| Fruit | rarity color | 0.38–0.55 | 0.00 | 0.30 | subtle | vein/symbol only |

Runtime ปัจจุบันใช้ micro normal/roughness 64px ร่วมกันเพื่อลด memory และใช้ texture PBR 1K เฉพาะ terrain/wood/bark/rock/ocean
