/** อุปกรณ์นี้ควรใช้ระบบสัมผัส/โหมดประหยัด GPU ไหม (บังคับได้ด้วย ?touch=1 ตอนทดสอบ) */
export function isTouchDevice(): boolean {
  if (new URLSearchParams(location.search).has('touch')) return true;
  if (new URLSearchParams(location.search).has('notouch')) return false;
  return navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
}

export type ControlSurfaceLayout = 'touch' | 'desktop';

/**
 * เลือกเฉพาะรูปแบบ UI ของปุ่มควบคุม ไม่เปลี่ยนวิธี render หรือ quality profile:
 * - touch: จอย/กล้องสัมผัส + ปุ่มทั้งหมด
 * - desktop: แผง combat แบบย่อพร้อมคีย์และคูลดาวน์ โดยไม่ดักเมาส์ทั้งจอ
 */
export function controlSurfaceLayout(): ControlSurfaceLayout {
  const params = new URLSearchParams(location.search);
  if (params.has('touch')) return 'touch';
  if (params.has('notouch')) return 'desktop';
  try {
    const desktopPointer = typeof matchMedia !== 'undefined'
      && matchMedia('(pointer: fine)').matches
      && matchMedia('(hover: hover)').matches;
    if (desktopPointer) return 'desktop';
  } catch {
    // Embedded browsers may not expose matchMedia; device detection remains the fallback.
  }
  return isTouchDevice() ? 'touch' : 'desktop';
}
