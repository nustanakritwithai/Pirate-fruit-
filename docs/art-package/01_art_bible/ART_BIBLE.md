# Pirate Fruit — Mobile Realistic PBR Art Bible

## Visual Direction

โลกโจรสลัดเขตร้อนแบบ Semi-Realistic สำหรับมือถือ: สีธรรมชาติอิ่มแต่ไม่การ์ตูนจัด, สัดส่วนอ่านง่าย, ผิววัสดุมี roughness/normal ชัด และใช้รายละเอียด geometry เฉพาะจุดที่ผู้เล่นเข้าใกล้

| Pillar | Direction |
|---|---|
| World | Tropical Pirate, ชื้น อบอุ่น ผ่านการใช้งาน |
| Rendering | Mobile PBR, ACES tone mapping, natural lighting |
| Shape | Stylized Realism, silhouette ชัด, ไม่ chibi |
| Detail | Macro shape ก่อน micro detail; ห้าม noise เต็มทุกพื้นผิว |
| Performance | Android mid-range ≥30 FPS, เป้าหมาย 45–60 FPS |

## Color Palette

| Role | Color range |
|---|---|
| Ocean | deep teal `#0A526C` → shallow turquoise `#14808E` |
| Vegetation | jungle green `#2F7044` → sunlit green `#7F9E55` |
| Sand | warm beige `#CDB884` |
| Wood | dark brown `#382317` → weathered brown `#8B6443` |
| Stone | cool gray `#747D7C` |
| Pirate accent | rust red `#7B3024`, brass `#C59A47` |
| Magic | rarity-specific emissive; ใช้ไม่เกิน 10% ของพื้นที่ asset |

## Style Rules

- Character: สัดส่วนมนุษย์, ศีรษะประมาณ 1/7–1/7.5 ของความสูง, มือ/อาวุธใหญ่ขึ้นเล็กน้อยเพื่ออ่านบนมือถือ
- Monster: silhouette บอกชนิดและ threat ได้จากระยะกลาง; Boss มี cape/shoulder/hat shape เพิ่ม ไม่ใช้แค่ scale
- Building: ผนังปูนทราย, โครงไม้, หลังคาดินเผา, foundation หิน; ใช้ modular kit และ texture reuse
- Boat: hull/deck/sail/rope/metal แยก roughness ชัด มี waterline และ wake anchor
- Weapon: โลหะมี specular ชัดแต่ไม่เป็นกระจก, ด้ามหนัง/ไม้ด้าน, trail เป็น unlit additive
- Fruit: รูปร่างและสีอ่าน rarity ได้; emissive จำกัดเฉพาะ vein/symbol
- VFX: core สว่าง ขอบนุ่ม อายุสั้น; ห้าม transparency layer ซ้อนจำนวนมาก
- UI: glass panel สีเข้ม, contrast สูง, safe area มือถือ และไม่บัง action controls

## Environment

- Beach: dry/wet sand transition, shoreline foam และ drift detail
- Forest: palm canopy + instanced ground cover + shrubs; หลีกเลี่ยง alpha shadow ใน Low/Medium
- Village: weathered plaster, dark structural wood, terracotta roof, warm lantern night accent
- Cave: rock roughness ต่างระหว่างแห้ง/เปียก; ใช้ baked/emissive guide มากกว่า point light หลายดวง
- Sea: deep/shallow gradient, dual normal motion, clearcoat specular, opaque mobile shader
- Cliff: rock normal เด่น, macro color variation, LOD silhouette ไม่กระโดด

## Lighting Presets

| Time | Sun | Sky | Fog | Environment |
|---|---|---|---|---|
| Morning | warm `#FFD9B0` | pale blue | light cyan | 0.50–0.58 |
| Noon | neutral warm `#FFF1DC` | saturated blue | blue-gray | 0.58–0.68 |
| Sunset | orange `#FF9D62` | mauve/orange | dusty violet | 0.40–0.52 |
| Night | cool `#7792BF` | navy | dark blue | 0.12–0.18 |

ใช้ DirectionalLight มีเงาได้หนึ่งดวง จุดไฟกลางคืน 0/1/3 ดวงตาม Low/Medium/High และ environment map ไม่ regenerate ทุกเฟรม

## Material Rules

| Material | Roughness | Metalness | Normal strength |
|---|---:|---:|---:|
| Sand | 0.92–1.00 | 0 | 0.35–0.60 |
| Grass | 0.78–0.92 | 0 | 0.25–0.50 |
| Wood | 0.70–0.88 | 0 | 0.40–0.70 |
| Stone | 0.78–0.95 | 0 | 0.55–0.85 |
| Iron | 0.30–0.50 | 0.70–0.90 | 0.15–0.35 |
| Leather | 0.58–0.76 | 0 | 0.25–0.45 |
| Cloth | 0.82–0.96 | 0 | 0.30–0.50 |
| Skin | 0.50–0.66 | 0 | 0.08–0.18 |
| Water | 0.16–0.28 | 0 | dual normal + clearcoat |

BaseColor ต้องไม่มี baked highlight/shadow แรง, Normal/roughness ใช้ NoColorSpace, BaseColor/UI ใช้ sRGB และทุก texture ต้องมี mipmaps
