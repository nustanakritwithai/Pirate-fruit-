/**
 * Phase 8 — จูนมือท่าเด่น: ค่าที่ระบุตรงนี้จะทับค่า derived ตอน generate
 * (รัน `npm run gen:skills` หลังแก้ไฟล์นี้เพื่ออัปเดต generated.ts)
 *
 * ใส่เฉพาะฟิลด์ที่อยากทับ — ที่เหลือใช้ค่าจากสูตร
 */

import type { SkillGameplay } from './types';

export const SKILL_OVERRIDES: Record<string, Partial<SkillGameplay>> = {
  // Bomb V — ระเบิดยักษ์รอบตัว: รัศมีใหญ่ + ผลักแรง สมชื่อไม้ตายผลระเบิด
  'bomb-base-v': {
    archetype: 'aoe',
    radius: 8,
    cc: [{ type: 'knockback', power: 12, duration: 0.3 }],
  },
  // Rocket Z (Missile Fist) — จรวดพุ่งตรง ระเบิดเมื่อชน
  'rocket-base-z': {
    archetype: 'projectile',
    projectileSpeed: 21,
    radius: 2.4,
  },
  // Flame V1 Z — ลูกไฟ + ไฟลุกต่อเนื่อง
  'flame-moveset-v1-z': {
    archetype: 'projectile',
    dot: { dps: 8, duration: 3 },
  },
  // Dark V1 V — หลุมดำดูดศัตรูเข้าหาศูนย์กลาง
  'dark-moveset-v1-v': {
    archetype: 'aoe',
    radius: 7,
    cc: [{ type: 'pull', power: 9, duration: 0.8 }],
  },
  // Light V1 Z — ลำแสงเร็วจัด
  'light-moveset-v1-z': {
    archetype: 'projectile',
    projectileSpeed: 26,
    range: 24,
  },
};
