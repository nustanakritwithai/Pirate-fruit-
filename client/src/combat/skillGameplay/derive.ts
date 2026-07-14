/**
 * Phase 8 — classifier + สูตร derive ค่า gameplay จากตาราง Wiki (pure, ทดสอบได้)
 *
 * หลักการ: คำอธิบายบน Wiki เขียนสม่ำเสมอพอที่จะ classify พฤติกรรมได้
 * (~200/270 ท่าผลไม้มี keyword ชัด) ส่วนดาเมจ Wiki ไม่มีตัวเลข → คำนวณจากสูตร
 * (สลอต × คูลดาวน์ × mastery × ความหายาก) แล้วจูนท่าเด่นใน overrides.ts
 */

import type {
  CcSpec,
  DotSpec,
  SkillArchetype,
  SkillGameplay,
  SkillSlotKey,
} from './types';

/** รูปแบบร่วมของสกิลดิบจากทั้ง 4 ตาราง (fruit/sword/gun/fighting-style) */
export interface RawDatabookSkill {
  id: string;
  key: string;
  name: string;
  mastery: number | null;
  cooldown: number | null;
  energy: number | null;
  breaksInstinct: boolean;
  description: string;
}

export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'legendary' | 'mythical';

/** บริบทของไอเทมเจ้าของท่า ใช้ประกอบสูตร/สี */
export interface DeriveContext {
  category: 'fruit' | 'sword' | 'gun' | 'style';
  rarity: ItemRarity;
  /** เฉพาะผลไม้: natural | elemental | beast */
  fruitType?: string;
}

// ---------------------------------------------------------------
// Archetype classifier — ลำดับกฎสำคัญ: เฉพาะเจาะจงก่อนกว้าง
// ---------------------------------------------------------------

const MOBILITY_RE =
  /\b(fly|flies|flying|flight|soar|soars|hover|hovers|glide|glides|levitate|travel around|travels around|ride|rides|swim|swims|move around|mobility)\b/i;
const BUFF_RE =
  /\b(heal|heals|healing|regenerate|regenerates|restores? (?:their|the user'?s?) (?:health|hp|energy)|buff|buffs|boost(?:s|ing)? (?:their|the user)|increase(?:s|d)? (?:their|the user'?s?) (?:damage|speed|defense))\b/i;
const SUMMON_RE = /\b(summons?|summoning|clones?|minions?|creates? (?:\d+|a|an|several) (?:copies|clones|allies))\b/i;
const DASH_RE =
  /\b(dash(?:es)?|rush(?:es)?|lunges?|charges? (?:at|forward|towards?)|blitz|zooms?|flash step|teleports? (?:to|behind|towards?)|propels? (?:themselves|the user) (?:forward|towards?))\b/i;
const GROUND_RE =
  /\b(slams? (?:it|them|their .{0,24}|down)? ?(?:down )?(?:onto|into|on) the ground|from the ground|out of the ground|erupts?|eruption|ground(?:s)? (?:beneath|below)|earthquake|quakes?|fissures?|shockwave along the ground)\b/i;
const AOE_RE =
  /\b(explosion|explodes?|exploding|around (?:them|the user|themselves)|surround(?:s|ing)?|nearby enemies|all (?:nearby )?enemies|aura|nova|storm|rains?(?: down)?|barrage of .{0,30}(?:down|sky|air)|spins? (?:around|rapidly)|expands?|burst(?:s)? (?:of|outward)|area of effect|in an area|radius)\b/i;
const MELEE_RE =
  /\b(punch(?:es)?|kicks?|barrage of (?:punches|kicks|strikes)|combo of|series of (?:punches|kicks|slashes|strikes)|swings? (?:their|the) .{0,24}(?:sword|blade|weapon|fist)|slash(?:es)? (?:the|at) (?:enemy|opponent|target)|close[- ]range|melee|bites?|claws?)\b/i;
// มัดรัว — โจมตีประชิดรัวหลายครั้งข้างหน้า (แยกออกจากท่าตีครั้งเดียว) เช็คก่อน projectile/aoe
const FLURRY_RE =
  /\b(flurry|barrage of (?:punches|kicks|strikes|slashes|jabs|blows|hits)|rapidly (?:slash|slashes|punch|punches|kick|kicks|strike|strikes|jab|jabs|hit)|rapid (?:punches|kicks|strikes|slashes|jabs|hits)|series of (?:rapid )?(?:punches|kicks|slashes|strikes|jabs)|unleashe?s? a (?:flurry|barrage))\b/i;
// ลำแสงต่อเนื่อง — ต้องมีคำว่า beam/laser + สัญญาณ "ค้าง/กวาด/ต่อเนื่อง" (กันท่ายิงลำแสงนัดเดียว)
const BEAM_RE = /\b(beams?|lasers?|ray of (?:light|energy))\b/i;
const BEAM_SUSTAINED_RE =
  /\b(continuous(?:ly)?|sweeps?|sweeping|move (?:it|the beam|around)|held|for as long|while (?:active|held|the skill)|lasts?|channel|prolonged)\b/i;
// วาร์ปหลังศัตรูแล้วฟัน — เจาะจงกว่า dash (DASH_RE เดิมมี "teleport" ด้วย จึงต้องเช็คก่อน)
const TELEPORT_RE =
  /\b(teleports?|flash step|warps?) (?:near|behind|next to|to|towards?) .{0,40}?(?:and |then |,)? ?(?:slash|slashes|cut|cuts|strike|strikes|attack|attacks|hit|hits|stab|stabs)|teleport(?:s|ing)? behind (?:the )?(?:enemy|opponent|target)/i;
// กระสุนติดตามเป้าอัตโนมัติ — เช็คก่อน projectile
const HOMING_RE =
  /\b(homing|heat[- ]?seeking|auto[- ]?aims?|auto[- ]?aiming|auto[- ]?aimed|tracks? (?:down )?(?:the |any |all )?(?:nearby )?(?:enemy|enemies|target|targets)|seeks? out|locks? onto)\b/i;
const PROJECTILE_RE =
  /\b(shoots?|shooting|fires?|firing|launch(?:es)?|throws?|hurls?|beams?|lasers?|projectiles?|bullets?|arrows?|blasts? (?:of|at|towards?)|sends? (?:out|forth|a|an|\d+)|flings?|spits?|breath(?:es)?)\b/i;

/** เดารูปแบบการทำงานจาก key + ชื่อ + คำอธิบาย */
export function deriveArchetype(raw: RawDatabookSkill): SkillArchetype {
  const text = `${raw.name}. ${raw.description}`;
  // ท่า F ในเกมต้นทางคือท่าเคลื่อนที่/บินเป็นหลัก
  if (raw.key === 'F') {
    if (DASH_RE.test(text)) return 'dash';
    return 'mobility';
  }
  if (MOBILITY_RE.test(text) && !PROJECTILE_RE.test(text) && !AOE_RE.test(text)) return 'mobility';
  if (SUMMON_RE.test(text)) return 'summon';
  // วาร์ปหลังศัตรู เจาะจงกว่า dash → เช็คก่อน
  if (TELEPORT_RE.test(text)) return 'teleport';
  if (BUFF_RE.test(text) && !PROJECTILE_RE.test(text)) return 'buff';
  if (DASH_RE.test(text)) return 'dash';
  if (GROUND_RE.test(text)) return 'ground';
  // มัดรัว/ลำแสงต่อเนื่อง เช็คก่อน projectile/aoe (คำว่า beam/barrage อยู่ในกฎกว้างด้านล่าง)
  if (FLURRY_RE.test(text)) return 'melee';
  if (BEAM_RE.test(text) && BEAM_SUSTAINED_RE.test(text)) return 'beam';
  // กระสุนติดตามเป้า เช็คก่อน projectile ทั่วไป
  if (HOMING_RE.test(text)) return 'homing';
  if (PROJECTILE_RE.test(text)) return 'projectile';
  if (AOE_RE.test(text)) return 'aoe';
  if (MELEE_RE.test(text)) return 'melee';
  // ไม้ตายที่อ่านไม่ออก → ระเบิดรอบตัว, ที่เหลือ → ยิงไปหน้า
  return raw.key === 'V' ? 'aoe' : 'projectile';
}

// ---------------------------------------------------------------
// Crowd control + DoT
// ---------------------------------------------------------------

export function deriveCc(raw: RawDatabookSkill): CcSpec[] {
  const desc = raw.description;
  const cc: CcSpec[] = [];
  if (/\bstuns?|stunning\b/i.test(desc)) cc.push({ type: 'stun', power: 0, duration: 1.0 });
  if (/\bpulls? (?:in|enemies|nearby)|sucks? in|vacuum|drags?\b/i.test(desc))
    cc.push({ type: 'pull', power: 6, duration: 0.4 });
  if (/\bknock(?:s|ing)? ?back|knockback|pushes? (?:back|away)|blows? (?:back|away)\b/i.test(desc))
    cc.push({ type: 'knockback', power: 8, duration: 0.25 });
  if (/\b(?:into|in) the air|upwards?|launches? (?:the )?(?:enemy|enemies|opponents?|targets?)\b/i.test(desc))
    cc.push({ type: 'launch', power: 7, duration: 0.4 });
  if (/\bdisables?|prevents? (?:the )?(?:enemy|opponent|them) from|unable to (?:move|attack)\b/i.test(desc))
    cc.push({ type: 'disable', power: 0, duration: 1.5 });
  if (/\bslows?|slowing|slowness|freez(?:es|ing)|frozen\b/i.test(desc))
    cc.push({ type: 'slow', power: 0.5, duration: 1.5 });
  return cc;
}

export function deriveDot(raw: RawDatabookSkill): DotSpec | undefined {
  if (/\bpoison(?:s|ed|ing)?|toxic|damage over time|burns?(?:ing)? (?:the )?(?:enemy|enemies|opponents?|targets?)|set(?:s)? .{0,20}on fire|bleed(?:s|ing)?\b/i.test(raw.description)) {
    return { dps: 6, duration: 3 };
  }
  return undefined;
}

// ---------------------------------------------------------------
// จำนวนฮิต — parse "3 slashes", "five projectiles" ฯลฯ
// ---------------------------------------------------------------

const NUMBER_WORDS: Record<string, number> = {
  two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
};

export function deriveHitCount(raw: RawDatabookSkill): number {
  const m = raw.description.match(
    /\b(\d+|two|three|four|five|six|seven|eight)\s+(?:consecutive\s+)?(slash(?:es)?|hits?|projectiles?|rockets?|shots?|times|punch(?:es)?|kicks?|strikes?|spikes?|blasts?|beams?|slams?|waves?)\b/i,
  );
  if (!m) return 1;
  const n = NUMBER_WORDS[m[1].toLowerCase()] ?? Number(m[1]);
  return Math.min(8, Math.max(1, Number.isFinite(n) ? n : 1));
}

// ---------------------------------------------------------------
// สูตรดาเมจ
// ---------------------------------------------------------------

const BASE_DAMAGE = 46;

const SLOT_MULT: Record<SkillSlotKey, number> = {
  Z: 1.0,
  X: 1.25,
  C: 1.5,
  V: 2.2, // ไม้ตาย
  F: 0.4, // ท่าเคลื่อนที่ ดาเมจเป็นผลพลอยได้
  M1: 0.5,
};

const RARITY_FACTOR: Record<ItemRarity, number> = {
  common: 1.0,
  uncommon: 1.08,
  rare: 1.18,
  legendary: 1.3,
  mythical: 1.45,
};

/** คำบอกระดับดาเมจในคำอธิบาย (มี ~23 ท่า) ใช้ปรับขึ้น/ลงเล็กน้อย */
function descriptionDamageFactor(desc: string): number {
  if (/\b(?:massive|huge|insane|great) damage\b/i.test(desc)) return 1.2;
  if (/\b(?:high|good) damage\b/i.test(desc)) return 1.1;
  if (/\b(?:decent|moderate) damage\b/i.test(desc)) return 1.0;
  if (/\b(?:minimal|low|small|little) damage\b/i.test(desc)) return 0.7;
  return 1.0;
}

export function normalizeSlot(key: string): SkillSlotKey {
  return (['Z', 'X', 'C', 'V', 'F', 'M1'] as const).includes(key as SkillSlotKey)
    ? (key as SkillSlotKey)
    : 'Z';
}

/**
 * ดาเมจรวมทั้งท่า = BASE × slot × cooldownFactor × masteryTier × rarity × descHint
 * - คูลดาวน์สูง = ท่าหนัก → ดาเมจสูงกว่า (monotonic)
 * - mastery สูง (ท่าปลายชุด) → แรงขึ้นเล็กน้อย
 */
export function deriveDamage(raw: RawDatabookSkill, ctx: DeriveContext): number {
  const slot = normalizeSlot(raw.key);
  const archetype = deriveArchetype(raw);
  // ท่า utility ล้วน (บิน/บัฟ) ไม่มีดาเมจ เว้นแต่คำอธิบายพูดถึงดาเมจ
  if ((archetype === 'mobility' || archetype === 'buff') && !/damag/i.test(raw.description)) {
    return 0;
  }
  const cooldown = raw.cooldown ?? defaultCooldown(slot);
  const cooldownFactor = Math.min(2, Math.max(0.8, 0.75 + cooldown / 20));
  const masteryTier = 1 + Math.min(raw.mastery ?? 0, 600) / 1000;
  return Math.round(
    BASE_DAMAGE *
      SLOT_MULT[slot] *
      cooldownFactor *
      masteryTier *
      RARITY_FACTOR[ctx.rarity] *
      descriptionDamageFactor(raw.description),
  );
}

// ---------------------------------------------------------------
// ระยะ / รัศมี / ความเร็ว / เวลาร่าย
// ---------------------------------------------------------------

export function deriveShape(
  archetype: SkillArchetype,
  slot: SkillSlotKey,
): { range: number; radius: number; projectileSpeed?: number } {
  const isUlt = slot === 'V';
  switch (archetype) {
    case 'projectile':
      return { range: isUlt ? 22 : 18, radius: isUlt ? 2.6 : 2.0, projectileSpeed: isUlt ? 19 : 17 };
    case 'beam':
      // ลำแสงเป็นเส้นยาวหน้าตัว รัศมี = ครึ่งความกว้างลำแสง
      return { range: isUlt ? 20 : 16, radius: isUlt ? 2.2 : 1.6 };
    case 'aoe':
      return { range: 0, radius: isUlt ? 6.5 : 4.8 };
    case 'ground':
      return { range: isUlt ? 8 : 6, radius: isUlt ? 4.5 : 3.5 };
    case 'dash':
      return { range: isUlt ? 10 : 8, radius: 2.3 };
    case 'melee':
      return { range: 3.2, radius: 2.2 };
    case 'summon':
      return { range: isUlt ? 6 : 4, radius: 4.0 };
    case 'homing':
      // กระสุนติดตาม — เหมือน projectile แต่เลี้ยวเข้าเป้า
      return { range: isUlt ? 24 : 20, radius: isUlt ? 2.4 : 1.9, projectileSpeed: isUlt ? 16 : 14 };
    case 'teleport':
      // วาร์ปหาเป้า — ระยะไกลกว่าฟันประชิด
      return { range: isUlt ? 16 : 12, radius: 2.4 };
    case 'mobility':
    case 'buff':
      return { range: 0, radius: 2.5 };
  }
}

const CAST_TIME: Record<SkillSlotKey, number> = {
  Z: 0.15,
  X: 0.2,
  C: 0.22,
  V: 0.3,
  F: 0.1,
  M1: 0.05,
};

function defaultCooldown(slot: SkillSlotKey): number {
  return { Z: 6, X: 9, C: 12, V: 20, F: 4, M1: 1.2 }[slot];
}

function defaultEnergy(slot: SkillSlotKey): number {
  return { Z: 16, X: 24, C: 32, V: 50, F: 10, M1: 4 }[slot];
}

// ---------------------------------------------------------------
// สีเอฟเฟกต์
// ---------------------------------------------------------------

const CATEGORY_COLOR: Record<DeriveContext['category'], number> = {
  style: 0xffcf8e,
  sword: 0x9fdcff,
  gun: 0xd9c27a,
  fruit: 0xff8a3c,
};

const FRUIT_TYPE_COLOR: Record<string, number> = {
  natural: 0x9de07a,
  elemental: 0x74c8ff,
  beast: 0xc890ff,
};

export function deriveVfxColor(ctx: DeriveContext): number {
  if (ctx.category === 'fruit' && ctx.fruitType && FRUIT_TYPE_COLOR[ctx.fruitType]) {
    return FRUIT_TYPE_COLOR[ctx.fruitType];
  }
  return CATEGORY_COLOR[ctx.category];
}

// ---------------------------------------------------------------
// สัญลักษณ์ = สไตล์/พฤติกรรม (1 archetype : 1 สัญลักษณ์, ไม่ซ้ำ)
// "เจอสัญลักษณ์นี้ = สกิลสไตล์นี้ทุกครั้ง" — เอกลักษณ์ธาตุยังสื่อผ่านชื่อสกิล + สี vfxColor
// ---------------------------------------------------------------

/** แหล่งเดียวของสัญลักษณ์ตามสไตล์ — deterministic 1:1 */
export const STYLE_ICON: Record<SkillArchetype, string> = {
  projectile: '🌀',
  beam: '🔆',
  aoe: '💥',
  ground: '🪨',
  dash: '💨',
  melee: '👊',
  mobility: '🕊️',
  buff: '💚',
  summon: '🌟',
  homing: '🎯',
  teleport: '✨',
};

/** สัญลักษณ์ของท่า = สไตล์การทำงานล้วน (ไม่อิงธาตุ/ชื่อ) */
export function deriveIcon(archetype: SkillArchetype): string {
  return STYLE_ICON[archetype];
}

// ---------------------------------------------------------------
// รวมทุกอย่าง → SkillGameplay หนึ่ง record
// ---------------------------------------------------------------

export function deriveSkillGameplay(raw: RawDatabookSkill, ctx: DeriveContext): SkillGameplay {
  const slot = normalizeSlot(raw.key);
  const archetype = deriveArchetype(raw);
  const shape = deriveShape(archetype, slot);
  const dot = deriveDot(raw);
  const record: SkillGameplay = {
    id: raw.id,
    slot,
    archetype,
    icon: deriveIcon(archetype),
    damage: deriveDamage(raw, ctx),
    hitCount: deriveHitCount(raw),
    range: shape.range,
    radius: shape.radius,
    castTime: CAST_TIME[slot],
    cc: deriveCc(raw),
    vfxColor: deriveVfxColor(ctx),
    cooldown: raw.cooldown ?? defaultCooldown(slot),
    energy: raw.energy ?? defaultEnergy(slot),
    source: 'derived',
  };
  if (shape.projectileSpeed !== undefined) record.projectileSpeed = shape.projectileSpeed;
  if (dot) record.dot = dot;
  return record;
}
