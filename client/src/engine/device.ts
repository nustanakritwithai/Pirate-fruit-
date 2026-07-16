const TOUCH_PANEL_STORAGE_KEY = 'pirate-fruit:touch-panel';

/** อุปกรณ์นี้ควรใช้ระบบสัมผัส/โหมดประหยัด GPU ไหม (บังคับได้ด้วย ?touch=1 ตอนทดสอบ) */
export function isTouchDevice(): boolean {
  if (new URLSearchParams(location.search).has('touch')) return true;
  if (new URLSearchParams(location.search).has('notouch')) return false;
  return navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
}

/** เปิดแผงควบคุมบนจอ (จอย+ปุ่ม) — มือถือเปิดอัตโนมัติ, เดสก์ท็อปจำค่าจาก localStorage */
export function loadTouchPanelVisible(): boolean {
  if (new URLSearchParams(location.search).has('touch')) return true;
  if (new URLSearchParams(location.search).has('notouch')) return false;
  try {
    const stored = localStorage.getItem(TOUCH_PANEL_STORAGE_KEY);
    if (stored !== null) return stored === '1';
  } catch {
    /* private mode */
  }
  return isTouchDevice();
}

export function saveTouchPanelVisible(visible: boolean): void {
  try {
    localStorage.setItem(TOUCH_PANEL_STORAGE_KEY, visible ? '1' : '0');
  } catch {
    /* ignore */
  }
}
