# Asset Checklist

ทุก asset ต้องผ่านก่อนเปลี่ยนสถานะเป็น `READY`

- [ ] Scale เป็นเมตรและเทียบกับ character reference
- [ ] Pivot อยู่ตำแหน่งที่เหมาะกับ spawn/socket/animation
- [ ] Naming ตรง `NAMING_CONVENTION.md`
- [ ] LOD0/LOD1/LOD2 หรือมีเหตุผลที่ไม่ต้องใช้
- [ ] Collider เป็น proxy แยกจาก visual mesh
- [ ] BaseColor/Normal/Roughness/Metallic/AO ถูก color space
- [ ] Texture ไม่เกิน budget
- [ ] Material slot ไม่เกิน budget
- [ ] License มีหลักฐาน; ไม่ทราบใช้ `UNKNOWN`
- [ ] Manifest ครบ
- [ ] Preview thumbnail พร้อม
- [ ] ไม่มี baked lighting รุนแรงใน BaseColor
- [ ] Shadow/alpha/transparent cost ผ่าน tier ที่กำหนด
- [ ] Mobile tested portrait + landscape
- [ ] Benchmark ไม่ต่ำกว่า 30 FPS ใน Medium
