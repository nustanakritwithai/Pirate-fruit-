/**
 * S8 Browser Smoke — บูตเกม build จริงในเบราว์เซอร์จริง ยิงข้าม origin ไป server จริง
 * จับบั๊กคลาสที่ inject/fetch ฝั่ง Node มองไม่เห็น (CORS preflight, cookie, header)
 * — บั๊ก "CORS ไม่อนุญาต PUT" ใน production เคยรอดทุกเทสต์มาแล้วเพราะไม่มีชั้นนี้
 *
 * ต้องมี: server รันที่ SMOKE_API_URL (flags remote ครบ) + client preview ที่ SMOKE_GAME_URL
 */

import { chromium } from 'playwright';

const GAME_URL = process.env.SMOKE_GAME_URL ?? 'http://127.0.0.1:4173';
const API_URL = process.env.SMOKE_API_URL ?? 'http://127.0.0.1:10000';

function fail(message, extra) {
  console.error(`SMOKE FAIL: ${message}`);
  if (extra) console.error(JSON.stringify(extra, null, 2));
  process.exit(1);
}

// SMOKE_CHROMIUM: ระบุ chromium binary เอง (สำหรับรันนอก CI ที่ browser revision ไม่ตรง)
const browser = await chromium.launch({
  executablePath: process.env.SMOKE_CHROMIUM || undefined,
});
const page = await browser.newPage({ viewport: { width: 900, height: 480 } });
const apiCalls = [];
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(String(error).slice(0, 200)));
page.on('response', (response) => {
  if (response.url().startsWith(API_URL)) {
    apiCalls.push(`${response.request().method()} ${new URL(response.url()).pathname} -> ${response.status()}`);
  }
});

await page.goto(GAME_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });

// 1) ป้ายสถานะต้องขึ้น SAVE REMOTE เต็มตัว (session + save + economy ครบ)
await page
  .waitForFunction(
    () => document.querySelector('[data-testid="server-status"]')?.getAttribute('data-mode') === 'remote',
    null,
    { timeout: 120_000 },
  )
  .catch(async () => {
    const badge = await page.evaluate(() => {
      const element = document.querySelector('[data-testid="server-status"]');
      return element ? { mode: element.getAttribute('data-mode'), text: element.textContent } : null;
    });
    fail('server status badge never reached remote mode', { badge, apiCalls, pageErrors });
  });

// 2) รอเกมพร้อม แล้วบังคับ save จริงข้าม origin (POST save หรือ PUT checkpoint/cargo)
await page.waitForFunction(() => Boolean(window.__boat), null, { timeout: 120_000 });
await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
try {
  await page.waitForResponse(
    (response) =>
      response.url().startsWith(API_URL)
      && ['POST', 'PUT'].includes(response.request().method())
      && response.url().includes('/api/player/')
      && response.status() === 200,
    { timeout: 30_000 },
  );
} catch {
  fail('no successful cross-origin save write observed', { apiCalls, pageErrors });
}

// 2b) PUT ข้าม origin ต้องผ่าน CORS preflight เสมอ (regression ของบั๊ก production:
//     @fastify/cors default ไม่มี PUT → "Failed to fetch") — 4xx ธุรกิจถือว่าผ่านชั้นเครือข่าย
const putProbe = await page.evaluate(async (api) => {
  try {
    const response = await fetch(`${api}/api/player/cargo`, {
      method: 'PUT',
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': 'x'.repeat(43),
      },
      body: '{}',
    });
    return { ok: true, status: response.status };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}, API_URL);
if (!putProbe.ok) {
  fail('cross-origin PUT failed at the CORS/preflight layer', { putProbe, apiCalls });
}

// 3) เส้นทาง trade ต้องผ่าน CORS preflight จากหน้าเกมจริง (คำตอบ 4xx ธุรกิจถือว่าผ่าน
//    ชั้นเครือข่าย — TypeError/failed fetch เท่านั้นที่แปลว่า preflight พัง)
const tradeProbe = await page.evaluate(async (api) => {
  try {
    const response = await fetch(`${api}/api/trade/execute`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': 'x'.repeat(43),
      },
      body: '{}',
    });
    return { ok: true, status: response.status };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}, API_URL);
if (!tradeProbe.ok) {
  fail('trade endpoint failed at the network/CORS layer', { tradeProbe, apiCalls });
}

const sessionSeen = apiCalls.some((line) => line.includes('/api/session/') && (line.endsWith('200') || line.endsWith('201')));
const stateSeen = apiCalls.some((line) => line.includes('GET /api/player/state -> 200'));
if (!sessionSeen || !stateSeen) {
  fail('expected session + player state calls were not observed', { apiCalls });
}

console.log('SMOKE PASS');
console.log(JSON.stringify({ apiCalls: [...new Set(apiCalls)], tradeProbeStatus: tradeProbe.status, pageErrors }, null, 2));
await browser.close();
