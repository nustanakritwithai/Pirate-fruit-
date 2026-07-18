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
// S9: จับ WebSocket จริงจากหน้าเกม — ยืนยัน handshake + เฟรม economy push
// S14: เก็บ payload ของ presence ด้วย เพื่อยืนยัน boatId เดินทางถึงหน้าเกม
const wsEvents = { opened: 0, frames: [], presence: [] };
page.on('websocket', (socket) => {
  wsEvents.opened += 1;
  socket.on('framereceived', (frame) => {
    try {
      const message = JSON.parse(String(frame.payload));
      if (message?.type) wsEvents.frames.push(message.type);
      if (message?.type === 'presence') wsEvents.presence.push(message);
    } catch { /* ไม่ใช่ JSON — ข้าม */ }
  });
});
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

// 3b) S10 quest: เมื่อเปิด flag เกมจะ reconcile สถานะเควสต์ตอนบูต — ต้องเห็น
//     GET /api/quest/state 200 จริงข้าม origin (พิสูจน์ cookie ผ่านชั้น CORS)
if (process.env.SMOKE_EXPECT_QUEST === 'true') {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline
    && !apiCalls.some((line) => line.includes('GET /api/quest/state -> 200'))) {
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!apiCalls.some((line) => line.includes('GET /api/quest/state -> 200'))) {
    fail('quest state reconcile was not observed cross-origin', { apiCalls, pageErrors });
  }
  // mutation ต้องผ่าน preflight ด้วย (4xx ธุรกิจ = ผ่านชั้นเครือข่าย)
  const questProbe = await page.evaluate(async (api) => {
    try {
      const response = await fetch(`${api}/api/quest/accept`, {
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
  if (!questProbe.ok) {
    fail('quest endpoint failed at the network/CORS layer', { questProbe, apiCalls });
  }
}

// 3c) S11 monster: mutation ต้องผ่าน CORS preflight (4xx ธุรกิจ = ผ่านชั้นเครือข่าย)
if (process.env.SMOKE_EXPECT_MONSTER === 'true') {
  const monsterProbe = await page.evaluate(async (api) => {
    try {
      const response = await fetch(`${api}/api/monster/kills`, {
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
  if (!monsterProbe.ok) {
    fail('monster endpoint failed at the network/CORS layer', { monsterProbe, apiCalls });
  }
}

// 3d) S12 progression: เมื่อเปิด flag เกมจะดึงสถานะ level/exp ทางการตอนบูต
if (process.env.SMOKE_EXPECT_PROGRESSION === 'true') {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline
    && !apiCalls.some((line) => line.includes('GET /api/progression/state -> 200'))) {
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!apiCalls.some((line) => line.includes('GET /api/progression/state -> 200'))) {
    fail('progression state fetch was not observed cross-origin', { apiCalls, pageErrors });
  }
}

// 4) S9 realtime: เมื่อเปิด flag ต้องมี WS เชื่อมจริง + ได้ welcome และ economy push
if (process.env.SMOKE_EXPECT_REALTIME === 'true') {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline
    && !(wsEvents.frames.includes('welcome') && wsEvents.frames.includes('economy'))) {
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (wsEvents.opened === 0 || !wsEvents.frames.includes('welcome') || !wsEvents.frames.includes('economy')) {
    fail('realtime websocket did not deliver welcome + economy frames', { wsEvents, apiCalls });
  }
}

// 5) S13 multiplayer: เปิดผู้เล่นคนที่สอง (context ใหม่ = คนละ session/ตัวละคร)
//    ทั้งคู่อยู่เกาะเริ่มต้นและส่ง move อัตโนมัติ — หน้าแรกต้องได้เฟรม presence ของคนที่สอง
if (process.env.SMOKE_EXPECT_MULTIPLAYER === 'true') {
  // ผู้เล่นคนที่สอง = client WebSocket จริง (node ws) — ไม่ถูก rAF/timer throttle
  // ให้ผลนิ่งใน headless CI: เปิด session ของตัวเอง ต่อ /ws แล้วส่ง move บนเกาะเดียวกัน
  // page1 (เบราว์เซอร์จริง, มี presence อยู่แล้ว) ต้องได้เฟรม presence ของผู้เล่นคนที่สอง
  const { default: NodeWebSocket } = await import('ws');
  const guest = await fetch(`${API_URL}/api/session/guest`, {
    method: 'POST',
    headers: { origin: GAME_URL, 'content-type': 'application/json' },
    body: '{}',
  });
  // เก็บ diagnostic ทุกด้าน เพื่อชี้จุดพังได้แน่ชัดจาก log ของ CI
  const peerDiag = { guestStatus: guest.status, frames: [], gotPage1Presence: false, error: null, closed: null };
  const cookie2 = guest.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  const wsUrl = `${API_URL.replace(/^http/, 'ws')}/ws`;
  const peer = new NodeWebSocket(wsUrl, { headers: { origin: GAME_URL, cookie: cookie2 } });
  // S14: ผู้เล่นคนที่สองแล่นเรือ war-galleon — presence ต้องพา boatId ถึงหน้าเกม
  const NAVAL = process.env.SMOKE_EXPECT_NAVAL === 'true';
  const peerMove = () => peer.send(JSON.stringify({
    type: 'move', islandId: 'starter-island', x: 12, y: 0, z: 8, heading: 0,
    onBoat: NAVAL, boatId: NAVAL ? 'war-galleon' : undefined,
  }));
  peer.on('open', () => {
    peerMove();
    // ส่งซ้ำเป็นระยะ กันจังหวะที่ page1 ยังไม่มี presence ตอน move แรก
    const timer = setInterval(peerMove, 1_000);
    peer.on('close', () => clearInterval(timer));
  });
  peer.on('message', (data) => {
    try {
      const message = JSON.parse(String(data));
      if (message?.type) peerDiag.frames.push(message.type);
      // peer ได้ presence = page1 ลง presence สำเร็จ + relay ทำงาน (พิสูจน์คนละทางกับ page1)
      if (message?.type === 'presence') peerDiag.gotPage1Presence = true;
    } catch { /* ไม่ใช่ JSON */ }
  });
  peer.on('error', (err) => { peerDiag.error = String(err).slice(0, 200); });
  peer.on('unexpected-response', (_req, res) => { peerDiag.error = `unexpected-response ${res.statusCode}`; });
  peer.on('close', (code) => { peerDiag.closed = code; });

  const gotNaval = () => wsEvents.presence.some((p) => p.onBoat === true && p.boatId === 'war-galleon');
  const done = () => (NAVAL ? gotNaval() : wsEvents.frames.includes('presence'));
  // page1 ต้องมี presence ของตัวเองก่อน Server ถึงจะ relay presence ของ peer มาให้
  // (relay ข้าม connection ที่ยังไม่เคยขยับ) — ปั๊ม move จากฝั่ง Node ทุกรอบผ่าน
  // __realtime.sendMove โดยตรง ไม่พึ่ง setInterval ในหน้าเว็บที่ headless CI throttle
  let pumpDiag = { hasRealtime: false, connected: false, sent: 0 };
  const pumpSelfMove = () => page.evaluate(() => {
    const rt = window.__realtime;
    const out = { hasRealtime: Boolean(rt), connected: Boolean(rt && rt.connected), sent: false };
    if (rt && typeof rt.sendMove === 'function') {
      rt.sendMove({ islandId: 'starter-island', x: 0, y: 0, z: 0, heading: 0, onBoat: false });
      out.sent = true;
    }
    return out;
  }).then((out) => {
    if (out) {
      pumpDiag.hasRealtime = out.hasRealtime;
      pumpDiag.connected = out.connected;
      if (out.sent) pumpDiag.sent += 1;
    }
  }).catch((err) => { pumpDiag.error = String(err).slice(0, 200); });
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline && !done()) {
    await pumpSelfMove();
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  peer.close();
  if (!done()) {
    fail('did not receive the expected presence frame from the second player', {
      naval: NAVAL, presence: wsEvents.presence.slice(0, 3), wsEvents, peerDiag, pumpDiag, apiCalls,
    });
  }
  console.log('S13/S14 multiplayer OK', JSON.stringify({ peerDiag, pumpDiag }));
}

console.log('SMOKE PASS');
console.log(JSON.stringify({ apiCalls: [...new Set(apiCalls)], tradeProbeStatus: tradeProbe.status, wsEvents: { opened: wsEvents.opened, frames: [...new Set(wsEvents.frames)] }, pageErrors }, null, 2));
await browser.close();
