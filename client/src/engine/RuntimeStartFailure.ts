import { resolvePocketMonsterParentOrigin } from '../realtime/PocketMonsterParentPresence';

export const PIRATE_RUNTIME_FAILED_MESSAGE = 'pocketmonster:pirate-runtime-failed-v1';
export const PIRATE_RUNTIME_START_FAILED = 'PIRATE_RUNTIME_START_FAILED';
const FAILURE_PANEL_ID = 'pirate-runtime-start-error';

/** Show a safe fallback even when startup fails before the presence bridge exists. */
export function showRuntimeStartFailure(): void {
  document.querySelector('.game-loading')?.remove();
  if (!document.getElementById(FAILURE_PANEL_ID)) {
    const panel = document.createElement('div');
    panel.id = FAILURE_PANEL_ID;
    panel.setAttribute('role', 'alert');
    panel.setAttribute('data-testid', FAILURE_PANEL_ID);
    panel.style.cssText = 'position:fixed;inset:0;z-index:110;display:flex;flex-direction:column;'
      + 'align-items:center;justify-content:center;padding:24px;text-align:center;'
      + 'color:#ff9b8e;background:#06121f;white-space:pre-line';
    // Startup can fail for reasons other than WebGL. Do not guess the cause or
    // expose exception text, connection details, or credentials in the fallback.
    panel.textContent = 'เปิดเกมไม่สำเร็จ\nลองโหลดหน้าเกมใหม่ หากยังไม่ได้ ให้ลองเปิดด้วยเบราว์เซอร์อื่น';
    document.body.appendChild(panel);
  }

  const targetOrigin = resolvePocketMonsterParentOrigin(
    window.location.search,
    window.location.origin,
    window.parent !== window,
  );
  if (!targetOrigin) return;
  try {
    // The parent installs its listener before loading this iframe. Keep this
    // terminal signal independent of the presence/ready initialization path.
    window.parent.postMessage({
      type: PIRATE_RUNTIME_FAILED_MESSAGE,
      code: PIRATE_RUNTIME_START_FAILED,
    }, targetOrigin);
  } catch {
    // A closed/navigating parent must not hide the local recovery guidance.
  }
}
