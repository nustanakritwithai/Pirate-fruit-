# Mobile Asset Budget

เป้าหมาย Android ระดับกลาง: 30 FPS ขั้นต่ำ, 45–60 FPS เป้าหมาย, visible triangles 150k–220k ใน Medium, draw calls เป้าหมาย ≤120 และเตือนเมื่อ >150

| Asset | LOD0 tris | LOD1 tris | LOD2 tris | Texture | Material slots |
|---|---:|---:|---:|---|---:|
| Player character | 12k–18k | 6k–9k | 2k–4k | 1024, hero 2048 | ≤3 |
| Normal NPC | 8k–12k | 4k–6k | 1.5k–3k | 512–1024 | ≤2 |
| Normal monster | 5k–10k | 2.5k–5k | 1k–2k | 512–1024 | ≤2 |
| Mini Boss | 12k–20k | 6k–10k | 2.5k–5k | 1024 | ≤3 |
| Boss | 20k–30k | 10k–15k | 4k–7k | 1024–2048 | ≤4 |
| Small boat | 10k–16k | 5k–8k | 2k–4k | 1024 atlas | ≤3 |
| Large boat | 20k–35k | 10k–18k | 4k–8k | 1024–2048 atlas | ≤4 |
| Building module | 1k–6k | 500–3k | 150–1k | 512–1024 atlas | ≤2 |
| Prop | 150–2k | 80–1k | 20–300 | 256–512 atlas | 1 |
| Tree | 800–2.5k | 350–1.2k | billboard/100–300 | 512–1024 atlas | ≤2 |
| Grass/shrub | instanced 4–300 | same/billboard | culled | 256–512 atlas | 1 |

## Texture Usage

| Resolution | Use |
|---|---|
| 256 | icon, VFX mask, small prop, micro detail |
| 512 | common prop, vegetation atlas, normal monster |
| 1024 | character, boat, building atlas, boss normal use |
| 2048 | hero character/boss/key landmark เท่านั้น ต้องมีเหตุผลใน manifest |

## Quality Budget

| Tier | Pixel ratio cap | Draw calls | Visible tris | Shadows | Anisotropy |
|---|---:|---:|---:|---|---:|
| Low | 0.75 | 85 | 150k | Off | 1x |
| Medium | 1.00 | 120 | 220k | 1024 | 4x |
| High | 1.25 | 150 | 300k | 1536 | 8x |

- Real-time shadow light ≤1; point lights 0/1/3 ตาม tier
- Transparent full-screen surface หลีกเลี่ยง; water ใช้ opaque PBR shader
- Props ซ้ำต้องใช้ InstancedMesh
- LOD transition ต้องทดสอบทั้ง portrait และ landscape
- Material/program ใหม่ต้องมีเหตุผล ห้ามสร้าง material ต่อ instance ถ้าแชร์ได้
