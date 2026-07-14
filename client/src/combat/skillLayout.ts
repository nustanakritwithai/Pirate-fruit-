/**
 * จัดเรียงช่องสกิล Z/X/C/V ต่อไอเทม (override การจับคู่ key→ปุ่มจาก databook)
 *
 * ค่าเริ่มต้น: ปุ่มแต่ละช่องใช้ท่าฐานของ key เดียวกัน (Z→Z, X→X, …) จาก databook
 * ที่นี่ให้ "override" ได้ว่าปุ่มไหนจะวางสกิล id ไหน (ต้องเป็นสกิลของไอเทมนั้นเอง)
 * ไอเทมที่ไม่มีในตารางนี้ = ใช้การจัดเรียงเดิมทุกอย่าง (ไม่กระทบ)
 *
 * key = ตำแหน่งปุ่ม ('Z'|'X'|'C'|'V') · value = skillId ที่จะวางบนปุ่มนั้น
 */
export type SlotKeyLetter = 'Z' | 'X' | 'C' | 'V';

export const SKILL_SLOT_OVERRIDES: Record<string, Partial<Record<SlotKeyLetter, string>>> = {
  // โชว์เคส: ผลไม้ Rocket — สลับ X↔C (จัดให้คลื่นระเบิดมาก่อนท่าพุ่ง)
  // เพิ่มไอเทมอื่นได้ตามใจ เช่น { combat: { X:'combat-c', C:'combat-x' } }
  rocket: { X: 'rocket-base-c', C: 'rocket-base-x' },
};

/** หาสกิลที่ถูกจัดวางบนปุ่ม slotKey ของไอเทม (override ก่อน, ไม่มี → ค่าเดิมตาม key) */
export function arrangedSkill<T extends { id: string; key: string }>(
  itemId: string | null,
  slotKey: string,
  byKey: Map<string, T>,
  byId: Map<string, T>,
): T | undefined {
  if (itemId) {
    const overrideId = SKILL_SLOT_OVERRIDES[itemId]?.[slotKey as SlotKeyLetter];
    if (overrideId) {
      const overridden = byId.get(overrideId);
      if (overridden) return overridden;
    }
  }
  return byKey.get(slotKey);
}
