/**
 * Phase 8 — Skill Gameplay Databook: schema ของ "ค่าที่ใช้ต่อสู้จริง" ต่อสกิล
 *
 * ตาราง Wiki ให้แค่ metadata (ชื่อ/คูลดาวน์/พลังงาน/คำอธิบาย) — ไฟล์ generated.ts
 * เก็บค่า gameplay ที่ derive จากสูตร + classifier + override ครบทุกท่า (429)
 * ดู scripts/gen-skill-gameplay.ts
 */

/** ปุ่มของท่าตามเกมต้นทาง (F = ท่าเคลื่อนที่/บิน, M1 = โจมตีปกติพิเศษ) */
export type SkillSlotKey = 'Z' | 'X' | 'C' | 'V' | 'F' | 'M1';

/**
 * รูปแบบการทำงานของท่า
 * - projectile: ยิงกระสุน/คลื่นไปข้างหน้า
 * - beam: ลำแสง/เลเซอร์ต่อเนื่อง (ช่องหน้าเป็นเส้น ฉีดดาเมจต่อเนื่องช่วงสั้น)
 * - aoe: ระเบิดรอบตัว/รอบจุด
 * - ground: กระแทกพื้น/พุ่งจากพื้น (โซนหน้าตัวละคร)
 * - dash: พุ่งเข้าฟัน/ชาร์จ
 * - melee: ตีระยะประชิดชุดใหญ่
 * - mobility: เคลื่อนที่/บิน (ท่า F ส่วนใหญ่)
 * - buff: เสริมพลัง/ฟื้นฟู ไม่เน้นดาเมจ
 * - summon: เรียกสิ่งมีชีวิต/วัตถุช่วยรบ (วางร่างที่ยิงเอง)
 * - homing: กระสุนติดตามเป้าอัตโนมัติ
 * - teleport: วาร์ปไปหลังศัตรูแล้วฟัน
 */
export type SkillArchetype =
  | 'projectile'
  | 'beam'
  | 'aoe'
  | 'ground'
  | 'dash'
  | 'melee'
  | 'mobility'
  | 'buff'
  | 'summon'
  | 'homing'
  | 'teleport';

export type CcType = 'stun' | 'knockback' | 'launch' | 'pull' | 'disable' | 'slow';

/** crowd-control หนึ่งชนิดที่ท่าใส่ให้เป้าหมาย */
export interface CcSpec {
  type: CcType;
  /** ความแรง (ระยะผลัก/แรงดูด หน่วยเกม) — stun/disable ใช้ 0 */
  power: number;
  /** ระยะเวลา (วินาที) */
  duration: number;
}

/** ดาเมจต่อเนื่อง (พิษ/ไฟลุก) */
export interface DotSpec {
  dps: number;
  duration: number;
}

/** ค่าที่พร้อมใช้สร้างสกิลจริงในเกม 1 ท่า */
export interface SkillGameplay {
  id: string;
  slot: SkillSlotKey;
  archetype: SkillArchetype;
  /** ไอคอนเฉพาะสกิล (emoji) เดาจากชื่อ/ธาตุ — ให้แต่ละท่าต่างกันชัด */
  icon: string;
  /** ดาเมจรวมทั้งท่า (ก่อนคูณสเตต) — 0 = ท่า utility ล้วน */
  damage: number;
  /** จำนวนฮิตที่แบ่งดาเมจ (1-8) */
  hitCount: number;
  /** ระยะยิง/พุ่ง (0 = รอบตัว) */
  range: number;
  /** รัศมีโดน */
  radius: number;
  projectileSpeed?: number;
  /** เวลาร่ายก่อนผลออก */
  castTime: number;
  cc: CcSpec[];
  dot?: DotSpec;
  /** สีเอฟเฟกต์หลัก */
  vfxColor: number;
  /** คัดลอกจากตารางต้นทาง เพื่อให้ record ใช้งานได้ในตัว */
  cooldown: number;
  energy: number;
  /** derived = จากสูตรล้วน, override = ถูกจูนมือใน overrides.ts */
  source: 'derived' | 'override';
}
