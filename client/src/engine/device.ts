/** อุปกรณ์นี้ควรใช้ระบบสัมผัส/โหมดประหยัด GPU ไหม (บังคับได้ด้วย ?touch=1 ตอนทดสอบ) */
export function isTouchDevice(): boolean {
  if (new URLSearchParams(location.search).has('touch')) return true;
  return navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
}
