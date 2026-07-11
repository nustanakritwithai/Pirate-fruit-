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

| ปุ่ม | การกระทำ |
|---|---|
| `W A S D` / ลูกศร | เดิน |
| `Shift` | วิ่ง (ใช้ Energy) |
| `Space` | กระโดด |
| คลิกซ้าย | ล็อกเมาส์เพื่อหมุนกล้อง (`Esc` ปลด) |
| ล้อเมาส์ | ซูมเข้า/ออก |

ตำแหน่งจะถูกเซฟอัตโนมัติทุก 3 วินาที (localStorage) — ปิดแล้วเปิดใหม่จะเกิดที่เดิม
ตกทะเลจะถูกพากลับจุดเซฟล่าสุดและเสีย HP เล็กน้อย

## สิ่งที่มีใน Phase 1

- เกาะเริ่มต้นแบบ procedural (เนิน หาดทราย ต้นปาล์ม หิน ลัง) ล้อมด้วยทะเล
- ตัวละคร 3D (`Soldier.glb` จาก three.js examples) พร้อม animation Idle / Walk / Run
- กล้อง Third Person
- ระบบชน: พื้นเกาะ + สิ่งกีดขวาง
- HUD: แถบ HP, แถบ Energy, พิกัด, FPS
- เซฟ/โหลดตำแหน่งอัตโนมัติ

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
