# 🏴‍☠️ Pirate Fruit

เกมโอเพนเวิลด์แนว Blox Fruits สร้างด้วย **Three.js + TypeScript** เล่นบนเบราว์เซอร์

ตอนนี้อยู่ที่ **Phase 1 — Core Prototype**: เดินเล่นบนเกาะเริ่มต้นได้แล้ว
ดูแผนพัฒนาทั้ง 12 Phase ได้ที่ [ROADMAP.md](ROADMAP.md)

## วิธีรัน

```bash
cd client
npm install
npm run dev
```

แล้วเปิด http://localhost:5173

## วิธีเล่น

### บนคอมพิวเตอร์

| ปุ่ม | การกระทำ |
|---|---|
| `W A S D` / ลูกศร | เดิน |
| `Shift` | วิ่ง (ใช้ Energy) |
| `Space` | กระโดด |
| `Q` | พุ่งหลบ (Dash — คูลดาวน์ 2.2 วิ ใช้ Energy 12) |
| คลิกซ้าย | ล็อกเมาส์เพื่อหมุนกล้อง (`Esc` ปลด) / คลิกระหว่างล็อก = โจมตี |
| ล้อเมาส์ | ซูมเข้า/ออก |

### บนมือถือ (ระบบบังคับแบบ RoV)

| ส่วน | การกระทำ |
|---|---|
| จอยสติ๊กเสมือน (ฝั่งซ้าย แตะตรงไหนก็ได้) | เดิน |
| ปุ่ม 🏃 | เปิด/ปิดโหมดวิ่ง (ใช้ Energy) |
| ปุ่ม ⚔️ (ใหญ่ มุมขวาล่าง) | โจมตีหลัก |
| ปุ่ม 💨 | พุ่งหลบ (Dash) — มีวงแหวนคูลดาวน์บนปุ่ม |
| ปุ่ม ⬆️ | กระโดด |
| ปุ่มสกิล 1-3 🔒 | ปลดล็อกใน Phase 5 (Combat) |
| ปุ่มไม้ตาย 🔒 (วงม่วง) | ปลดล็อกใน Phase 7 (ผลไม้ปีศาจ) |
| ลากนิ้วบนพื้นที่ว่างฝั่งขวา | หมุนกล้อง |

ตำแหน่งจะถูกเซฟอัตโนมัติทุก 3 วินาที (localStorage) — ปิดแล้วเปิดใหม่จะเกิดที่เดิม
ตกทะเลจะถูกพากลับจุดเซฟล่าสุดและเสีย HP เล็กน้อย

## สิ่งที่มีใน Phase 1

- เกาะเริ่มต้นแบบ procedural (เนิน หาดทราย ต้นปาล์ม หิน ลัง) ล้อมด้วยทะเล
- กราฟฟิก **Mobile Realistic PBR**: ท้องฟ้าจำลองบรรยากาศจริง + environment map,
  พื้นเกาะ texture splatting 3 ชั้น (ทราย/หญ้า/หิน พร้อม normal map),
  น้ำทะเลคลื่นเคลื่อนไหวสะท้อนแสงอาทิตย์, ต้นปาล์ม/หิน/ลังใช้ texture จริง
- ปรับแต่งให้มือถือ: texture JPG 1K (~2.4MB), จำกัด pixel ratio, ลดความละเอียดเงาอัตโนมัติ
- ตัวละคร 3D (`Soldier.glb` จาก three.js examples) พร้อม animation Idle / Walk / Run
- กล้อง Third Person
- ระบบชน: พื้นเกาะ + สิ่งกีดขวาง
- HUD: แถบ HP, แถบ Energy, พิกัด, FPS
- เซฟ/โหลดตำแหน่งอัตโนมัติ

## เครดิต Asset (CC0)

- Texture PBR (หญ้า Grass004, ทราย Ground033, หิน Rock023, เปลือกไม้ Bark012, ไม้กระดาน Planks012) จาก [ambientCG](https://ambientcg.com) — CC0
- `waternormals.jpg` และโมเดล `Soldier.glb` จาก [three.js examples](https://github.com/mrdoob/three.js)

## คำสั่งอื่น

```bash
npm run build     # type-check + build ลง dist/
npm run preview   # เสิร์ฟไฟล์ที่ build แล้ว
```

## Deploy ขึ้น Render

repo นี้มี [`render.yaml`](render.yaml) เป็น Blueprint พร้อม deploy เป็น Static Site:

1. เข้า [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint**
2. เลือก repo นี้ (branch ที่ต้องการ) — Render จะอ่าน `render.yaml` แล้วตั้งค่า build/publish ให้อัตโนมัติ
3. กด **Apply** รอ build เสร็จก็ได้ URL ใช้งานทันที

Build command และ publish directory (`client` → `npm run build` → `dist/`) ถูกกำหนดไว้ใน `render.yaml` แล้ว ไม่ต้องตั้งค่าเองในหน้าเว็บ
