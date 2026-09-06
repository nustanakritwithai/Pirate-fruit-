# ส่งต่องาน Pirate — ตรวจรอยฟันดาบของผู้เล่นอื่น

Draft PR นี้เพิ่ม test จาก PlayerCombat.update ที่กด M1 ด้วย training-sword, rig และ EquipmentVisuals จริง จับ blade-trail ผ่าน ScopedVisualEffects → ParentPresence → sanitizeVisual → RemotePlayers และทำ ribbon/edge ฝั่งผู้ชมเป็น overlay อายุสั้นที่ไม่ถูก depth/frustum บังทั้งจังหวะ

ผลก่อนพัก VPS: normalAttackPresence 1/1 และ PresentationProtocol 3/3 ผ่าน; actual sword payload ผ่าน Client sanitizer/queue ไปถึง C# peer snapshot ทั้ง combo 0 และ finisher 3 แต่ยังไม่ยืนยันภาพบน Browser ผู้ชม การพบ effect object ใน scene ไม่ใช่หลักฐานว่าผู้เล่นเห็นรอยฟันจริง

รับคู่กับ Client และ Server PR บน branch `codex/smooth-presence-basic-attack-20260906` ลิงก์/HEAD อยู่ในรายละเอียด PR ใช้ `MonsterLifeServer/docs/handoffs/2026-09-06-smooth-sword/` เพื่อรับสคริปต์และ QA fixtures ครบ ทดสอบบนเครื่องอื่นเท่านั้น

| งานต่อ | เกณฑ์ |
|---|---|
| Test portability | ปกติ test ไม่เขียนไฟล์; เมื่อต้องส่ง fixture ให้ตั้ง `PIRATE_PRESENCE_QA_OUTPUT_DIR` เป็น absolute path ของ directory ที่ประกาศไว้ แล้ว test จะเขียนเฉพาะ `sword-gameplay-combo0.json` และ `sword-gameplay-finisher3.json` ภายในนั้น |
| Receiver/ภาพ | ใช้ accepted-blade-visual-combo0.json และ finisher3 จาก Server handoff ผ่าน receiver และ visible Pocket overlay; ใน iframe อ่าน `window.__pocketRemotePresentation.snapshot()` ซึ่งคืนเฉพาะข้อมูล presentation ไม่มี session/token |
| Regression | รัน sword/protocol/remotePlayers tests, shared build, client typecheck/build บนเครื่องอื่น และทำ Browser สองบัญชี |
| ส่งผลกลับ | บันทึก exact HEAD, ขั้นที่ผ่าน/ล้ม และหลักฐานภาพใน PR; แก้บน branch เดิม |

คำสั่งทดสอบหลักจาก root repo: `npm ci`, `npm run build:shared`, `npm run test:client -- --run src/realtime/__tests__/normalAttackPresence.test.ts src/realtime/__tests__/PresentationProtocol.test.ts src/realtime/__tests__/remotePlayers.test.ts`, `npm run typecheck:client`, `npm run build:client`

Production ใช้ C# VPS relay ผ่าน parent Client; ช่อง visual ที่ขาดใน Pirate Node realtimeHub ไม่ใช่หลักฐานสาเหตุของ production นี้ คงรายละเอียดผู้เล่นครบ ไม่เปิด Combat/damage จาก presentation และยังไม่ merge/deploy
