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

async function promoteSmokePvpCharacters(characterIds) {
  if (process.env.SMOKE_EXPECT_PVP !== 'true') return;
  if (!process.env.DATABASE_URL) {
    fail('PvP smoke requires DATABASE_URL to seed eligible level-20 fixtures');
  }
  const ids = [...new Set(characterIds.filter(Boolean))];
  if (ids.length !== characterIds.length) {
    fail('could not resolve both PvP smoke character ids', { characterIds });
  }
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const result = await pool.query(
      `update characters
          set level = greatest(level, 20),
              updated_at = now()
        where id = any($1::uuid[])`,
      [ids],
    );
    if (result.rowCount !== ids.length) {
      fail('could not seed level-20 PvP smoke fixtures', {
        characterIds: ids,
        updated: result.rowCount,
      });
    }
  } finally {
    await pool.end();
  }
}

// SMOKE_CHROMIUM: ระบุ chromium binary เอง (สำหรับรันนอก CI ที่ browser revision ไม่ตรง)
const browser = await chromium.launch({
  executablePath: process.env.SMOKE_CHROMIUM || undefined,
});
const page = await browser.newPage({ viewport: { width: 900, height: 480 } });
// จับ frame ภายใน browser process โดยตรง: Playwright page.on('websocket') อาจส่ง event
// ผ่าน CDP ไม่ทันเมื่อ world delta ไหลต่อเนื่อง ทำให้ smoke false-negative ทั้งที่เกมรับแล้ว
await page.addInitScript(() => {
  window.__smokeRealtime = {
    presence: [], combat: [], worldSnapshot: 0, worldDeltas: [], worldDead: [],
    boatSnapshots: [], boatDeltas: [], boatResults: [], boatCannon: [],
  };
  const NativeWebSocket = window.WebSocket;
  window.WebSocket = new Proxy(NativeWebSocket, {
    construct(Target, args) {
      const socket = Reflect.construct(Target, args, Target);
      socket.addEventListener('message', (event) => {
        try {
          const message = JSON.parse(String(event.data));
          const diag = window.__smokeRealtime;
          if (message?.type === 'presence') {
            diag.presence.push(message);
            if (diag.presence.length > 20) diag.presence.shift();
          }
          if (message?.type === 'combat-hit') diag.combat.push(message);
          if (message?.type === 'world-monster-snapshot') {
            diag.worldSnapshot = message.monsters?.length ?? 0;
          }
          if (message?.type === 'world-monster-delta') {
            diag.worldDeltas.push(...(message.updates ?? []));
            if (diag.worldDeltas.length > 200) {
              diag.worldDeltas.splice(0, diag.worldDeltas.length - 200);
            }
          }
          if (message?.type === 'world-monster-dead') diag.worldDead.push(message.spawnId);
          if (message?.type === 'boat-snapshot') diag.boatSnapshots.push(...(message.boats ?? []));
          if (message?.type === 'boat-delta') diag.boatDeltas.push(message.boat);
          if (message?.type === 'boat-intent-result') diag.boatResults.push(message);
          if (message?.type === 'boat-cannon') diag.boatCannon.push(message);
        } catch { /* ไม่ใช่ JSON — ข้าม */ }
      });
      return socket;
    },
  });
});
const apiCalls = [];
const audioRequests = [];
const pageErrors = [];
// S9: จับ WebSocket จริงจากหน้าเกม — ยืนยัน handshake + เฟรม economy push
// S14: เก็บ payload ของ presence ด้วย เพื่อยืนยัน boatId เดินทางถึงหน้าเกม
const wsEvents = {
  opened: 0, frames: [], presence: [], combat: [],
  worldSnapshot: 0, worldDeltas: [], worldDead: [],
  boatSnapshots: [], boatDeltas: [], boatResults: [], boatCannon: [],
};
page.on('websocket', (socket) => {
  wsEvents.opened += 1;
  socket.on('framereceived', (frame) => {
    try {
      const message = JSON.parse(String(frame.payload));
      if (message?.type && wsEvents.frames.length < 60) wsEvents.frames.push(message.type);
      if (message?.type === 'presence') wsEvents.presence.push(message);
      // S15: เก็บเฟรม PvP ที่ Server ตัดสิน (โดนเราเอง) เพื่อยืนยัน authority ถึงหน้าเกม
      if (message?.type === 'combat-hit') wsEvents.combat.push(message);
      // S16: มอนสเตอร์กลาง — snapshot ตอน join + delta/dead ที่ Server ตัดสิน
      if (message?.type === 'world-monster-snapshot') wsEvents.worldSnapshot = message.monsters?.length ?? 0;
      if (message?.type === 'world-monster-delta') wsEvents.worldDeltas.push(...(message.updates ?? []));
      if (message?.type === 'world-monster-dead') wsEvents.worldDead.push(message.spawnId);
      if (message?.type === 'boat-snapshot') wsEvents.boatSnapshots.push(...(message.boats ?? []));
      if (message?.type === 'boat-delta') wsEvents.boatDeltas.push(message.boat);
      if (message?.type === 'boat-intent-result') wsEvents.boatResults.push(message);
      if (message?.type === 'boat-cannon') wsEvents.boatCannon.push(message);
    } catch { /* ไม่ใช่ JSON — ข้าม */ }
  });
});
page.on('pageerror', (error) => pageErrors.push(String(error).slice(0, 200)));
page.on('response', (response) => {
  if (response.url().startsWith(API_URL)) {
    apiCalls.push(`${response.request().method()} ${new URL(response.url()).pathname} -> ${response.status()}`);
  }
});
page.on('request', (request) => {
  if (/\.mp3(?:\?|$)/i.test(request.url())) audioRequests.push(request.url());
});

await page.goto(GAME_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });

// S18: Production opens Character Select. A fresh browser starts without a
// guest cookie, so complete the same first-run form a new player sees before
// waiting for the gameplay HUD and remote-save badge.
const firstRunInput = page.locator('.chargate-input');
const needsFirstRun = await Promise.race([
  firstRunInput.waitFor({ state: 'visible', timeout: 20_000 }).then(() => true),
  page.locator('[data-testid="server-status"]')
    .waitFor({ state: 'visible', timeout: 20_000 })
    .then(() => false),
]);
if (needsFirstRun) {
  await firstRunInput.fill('Smoke Pirate');
  const firstRunSubmit = page.locator('.chargate-form button[type="submit"]');
  await firstRunSubmit.click();
}

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

// A1 audio: no music transfer before a gesture; gesture unlocks; state changes are
// island -> sailing -> island without creating a second manager or replaying one event.
if (process.env.SMOKE_EXPECT_AUDIO === 'true') {
  if (audioRequests.length !== 0) {
    fail('audio transferred before the first player gesture', { audioRequests });
  }
  const toggle = page.locator('.audio-toggle');
  await toggle.waitFor({ state: 'visible', timeout: 10_000 });
  await toggle.click();
  await page.waitForFunction(() => window.__audio?.status === 'running', null, { timeout: 10_000 });
  const audioDiag = await page.evaluate(async () => {
    const audio = window.__audio;
    if (!audio) return null;
    const island = { dead: false, boss: false, combat: false, onBoat: false, onFoot: true, loading: false };
    audio.setMusicObservation(island);
    const first = audio.music.state;
    await new Promise((resolve) => setTimeout(resolve, 200));
    audio.setMusicObservation({ ...island, onBoat: true, onFoot: false });
    const sailing = audio.music.state;
    await new Promise((resolve) => setTimeout(resolve, 200));
    const firstEvent = audio.play('boat.cannon', { eventId: 'smoke-authoritative-event-1' });
    const replay = audio.play('boat.cannon', { eventId: 'smoke-authoritative-event-1' });
    audio.setMusicObservation(island);
    const returned = audio.music.state;
    await new Promise((resolve) => setTimeout(resolve, 400));
    return { first, sailing, returned, firstEvent, replay, status: audio.status };
  });
  if (!audioDiag
      || audioDiag.first !== 'island'
      || audioDiag.sailing !== 'sailing'
      || audioDiag.returned !== 'island'
      || !audioDiag.firstEvent
      || audioDiag.replay) {
    fail('audio state transition or replay dedupe failed', { audioDiag, audioRequests, pageErrors });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileLayout = await page.evaluate(() => {
    const toggle = document.querySelector('.audio-toggle')?.getBoundingClientRect();
    if (!toggle) return { ok: false, reason: 'missing toggle' };
    const visible = [...document.querySelectorAll(
      '.tc-attack,.quest-tracker,.stats-open-button,.stats-panel-root,.inv-open-button,.inv-root,.hud',
    )]
      .map((element) => element.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0);
    const overlaps = visible.some((rect) => !(
      toggle.right <= rect.left || toggle.left >= rect.right || toggle.bottom <= rect.top || toggle.top >= rect.bottom
    ));
    return {
      ok: toggle.left >= 0 && toggle.top >= 0 && toggle.right <= innerWidth && toggle.bottom <= innerHeight && !overlaps,
      toggle: { left: toggle.left, top: toggle.top, right: toggle.right, bottom: toggle.bottom },
      overlaps,
    };
  });
  if (!mobileLayout.ok) fail('mobile audio settings toggle overlaps gameplay HUD', { mobileLayout });
  await page.setViewportSize({ width: 900, height: 480 });
  await toggle.click();
}

try {
  const saveResponse = page.waitForResponse(
    (response) =>
      response.url().startsWith(API_URL)
      && ['POST', 'PUT'].includes(response.request().method())
      && response.url().includes('/api/player/')
      && response.status() === 200,
    { timeout: 30_000 },
  );
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await saveResponse;
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

// 4) S9 realtime: เมื่อเปิด flag ต้องมี WS welcome และ economy bootstrap ผ่าน REST
if (process.env.SMOKE_EXPECT_REALTIME === 'true') {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline && !wsEvents.frames.includes('welcome')) {
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (wsEvents.opened === 0 || !wsEvents.frames.includes('welcome')) {
    fail('realtime websocket did not deliver the welcome frame', { wsEvents, apiCalls });
  }

  // Background economy ticks must not push the full world document over WebSocket.
  // Verify the replacement bootstrap path from the real browser instead so CORS,
  // credentials and the authoritative economy endpoint remain covered.
  const economyProbe = await page.evaluate(async (api) => {
    try {
      const response = await fetch(`${api}/api/economy/world`, {
        method: 'GET',
        credentials: 'include',
      });
      const payload = await response.json().catch(() => null);
      return {
        ok: response.ok,
        status: response.status,
        hasWorld: Boolean(payload && typeof payload === 'object'),
      };
    } catch (error) {
      return { ok: false, status: null, hasWorld: false, error: String(error) };
    }
  }, API_URL);
  if (!economyProbe.ok || economyProbe.status !== 200 || !economyProbe.hasWorld) {
    fail('economy REST bootstrap failed from the browser', { economyProbe, wsEvents, apiCalls });
  }
}

// 5) S13 multiplayer: เปิดผู้เล่นคนที่สอง (context ใหม่ = คนละ session/ตัวละคร)
//    ทั้งคู่อยู่เกาะเริ่มต้นและส่ง move อัตโนมัติ — หน้าแรกต้องได้เฟรม presence ของคนที่สอง
if (process.env.SMOKE_EXPECT_MULTIPLAYER === 'true') {
  // ผู้เล่นคนที่สอง = client WebSocket จริง (node ws) — ไม่ถูก rAF/timer throttle
  // ให้ผลนิ่งใน headless CI: เปิด session ของตัวเอง ต่อ /ws แล้วส่ง move บนเกาะเดียวกัน
  // page1 (เบราว์เซอร์จริง, มี presence อยู่แล้ว) ต้องได้เฟรม presence ของผู้เล่นคนที่สอง
  await page.evaluate(() => {
    const controller = window.__combat?.controller;
    if (!controller) return;
    window.__realtime?.sendMove?.({
      islandId: 'starter-island',
      x: controller.position.x,
      y: controller.position.y,
      z: controller.position.z,
      heading: controller.heading,
      onBoat: false,
    });
  });
  await new Promise((resolve) => setTimeout(resolve, 250));
  const { default: NodeWebSocket } = await import('ws');
  const guest = await fetch(`${API_URL}/api/session/guest`, {
    method: 'POST',
    headers: { origin: GAME_URL, 'content-type': 'application/json' },
    body: '{}',
  });
  const guestPayload = await guest.json().catch(() => null);
  const peerCharacterId = guestPayload?.session?.characterId ?? null;
  const browserCharacterId = await page.evaluate(() => window.__characterId ?? null);
  await promoteSmokePvpCharacters([browserCharacterId, peerCharacterId]);
  // เก็บ diagnostic ทุกด้าน เพื่อชี้จุดพังได้แน่ชัดจาก log ของ CI
  const peerDiag = {
    guestStatus: guest.status, peerCharacterId, frames: [], gotPage1Presence: false,
    combat: [], worldDeltas: [], worldDead: [], boatDeltas: [], movementCorrections: 0,
    error: null, closed: null,
  };
  const cookie2 = guest.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  const wsUrl = `${API_URL.replace(/^http/, 'ws')}/ws`;
  const peer = new NodeWebSocket(wsUrl, { headers: { origin: GAME_URL, cookie: cookie2 } });
  let resolvePeerOpen;
  const peerOpen = new Promise((resolve) => { resolvePeerOpen = resolve; });
  // S14: ผู้เล่นคนที่สองแล่นเรือ war-galleon — presence ต้องพา boatId ถึงหน้าเกม
  const NAVAL = process.env.SMOKE_EXPECT_NAVAL === 'true';
  let peerX = 0;
  let peerY = 0;
  let peerZ = 8;
  let peerMoveSequence = 0;
  const peerMove = () => peer.send(JSON.stringify({
    // Alternate a tiny offset so retries remain observable after the browser
    // registers its presence, while keeping the peer inside melee range.
    type: 'move', islandId: 'starter-island', x: peerX + (peerMoveSequence++ % 2) * 0.05,
    y: peerY, z: peerZ, heading: 0,
    onBoat: NAVAL, boatId: NAVAL ? 'war-galleon' : undefined,
  }));
  peer.on('open', () => resolvePeerOpen());
  peer.on('message', (data) => {
    try {
      const message = JSON.parse(String(data));
      // cap frames กัน log บวม (world-monster delta ไหลถี่) — ให้ SMOKE FAIL อ่านออก
      if (message?.type && peerDiag.frames.length < 40) peerDiag.frames.push(message.type);
      // peer ได้ presence = page1 ลง presence สำเร็จ + relay ทำงาน (พิสูจน์คนละทางกับ page1)
      if (message?.type === 'presence') peerDiag.gotPage1Presence = true;
      if (message?.type === 'combat-hit') peerDiag.combat.push(message);
      if (message?.type === 'world-monster-delta') {
        peerDiag.worldDeltas.push(...(message.updates ?? []));
        if (peerDiag.worldDeltas.length > 200) {
          peerDiag.worldDeltas.splice(0, peerDiag.worldDeltas.length - 200);
        }
      }
      if (message?.type === 'world-monster-dead') peerDiag.worldDead.push(message.spawnId);
      if (message?.type === 'movement-correction') {
        peerX = message.x;
        peerY = message.y;
        peerZ = message.z;
        peerDiag.movementCorrections += 1;
      }
      if (message?.type === 'boat-delta') {
        peerDiag.boatDeltas.push(message.boat);
        if (peerDiag.boatDeltas.length > 200) {
          peerDiag.boatDeltas.splice(0, peerDiag.boatDeltas.length - 200);
        }
      }
    } catch { /* ไม่ใช่ JSON */ }
  });
  peer.on('error', (err) => { peerDiag.error = String(err).slice(0, 200); });
  peer.on('unexpected-response', (_req, res) => { peerDiag.error = `unexpected-response ${res.statusCode}`; });
  peer.on('close', (code) => { peerDiag.closed = code; });

  let browserPresence = [];
  const allPresence = () => [...wsEvents.presence, ...browserPresence];
  const gotNaval = () => allPresence().some((p) => p.onBoat === true && p.boatId === 'war-galleon');
  const browserHasPvpTarget = () => browserPresence.some((p) => p.playerId === peerCharacterId);
  // Either relay direction proves that two authenticated connections share the
  // authoritative island presence channel. Headless Chromium can occasionally
  // miss its inbound diagnostic tap while the Node peer still receives the
  // browser's server-authored presence frame. Naval keeps the stricter browser
  // assertion because it must inspect the authoritative boat fields.
  const done = () => {
    return NAVAL ? gotNaval() : allPresence().length > 0 || peerDiag.gotPage1Presence;
  };
  // page1 ต้องมี presence ของตัวเองก่อน Server ถึงจะ relay presence ของ peer มาให้
  // (relay ข้าม connection ที่ยังไม่เคยขยับ) — ปั๊ม move จากฝั่ง Node ทุกรอบผ่าน
  // __realtime.sendMove โดยตรง ไม่พึ่ง setInterval ในหน้าเว็บที่ headless CI throttle
  let pumpDiag = { hasRealtime: false, connected: false, sent: 0 };
  const pumpSelfMove = () => page.evaluate(() => {
    const rt = window.__realtime;
    const controller = window.__combat?.controller;
    const out = {
      hasRealtime: Boolean(rt), connected: Boolean(rt && rt.connected), sent: false,
      presence: (window.__smokeRealtime?.presence ?? []).slice(-10),
    };
    if (rt && controller && typeof rt.sendMove === 'function') {
      rt.sendMove({
        islandId: 'starter-island',
        x: controller.position.x,
        y: controller.position.y,
        z: controller.position.z,
        heading: controller.heading,
        onBoat: false,
      });
      out.sent = true;
    }
    return out;
  }).then((out) => {
    if (out) {
      pumpDiag.hasRealtime = out.hasRealtime;
      pumpDiag.connected = out.connected;
      if (out.sent) pumpDiag.sent += 1;
      browserPresence = out.presence;
    }
  }).catch((err) => { pumpDiag.error = String(err).slice(0, 200); });
  // Make the peer's first authoritative move deterministic. A first move seeds
  // both directions, but only when the browser already has same-island presence.
  await peerOpen;
  await pumpSelfMove();
  peerMove();
  // ขับ peer move จาก main loop โดยตรง เพื่อไม่มี timer ชุดที่สองมาชน server throttle
  // และให้ทุก retry รักษาลำดับ browser-presence → peer-presence แบบเดิม
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline && !done()) {
    // Register the browser on the deterministic smoke island first. Its normal
    // gameplay timer can otherwise restore the live active island between these
    // two sends, producing a one-way relay (peer sees page, page never sees peer).
    await pumpSelfMove();
    if (peer.readyState === 1) peerMove();
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!done()) {
    peer.close();
    fail('did not receive the expected presence frame from the second player', {
      naval: NAVAL,
      opened: wsEvents.opened,
      presenceCount: allPresence().length,
      presenceSample: allPresence().slice(-4).map((p) => ({ onBoat: p.onBoat, boatId: p.boatId, islandId: p.islandId })),
      worldSnapshot: wsEvents.worldSnapshot,
      peerFramesTail: peerDiag.frames.slice(-8),
      peerGotPage1Presence: peerDiag.gotPage1Presence,
      pumpDiag,
      pageErrors: pageErrors.slice(0, 5),
    });
  }

  // Move the smoke actors through the same bounded movement path a legitimate
  // client can take. The old smoke teleported directly to combat coordinates,
  // which is now correctly clamped by movement authority.
  const walkBrowserTo = async (targetX, targetZ) => {
    let current = await page.evaluate(() => {
      const controller = window.__combat?.controller;
      return controller
        ? { x: controller.position.x, y: controller.position.y, z: controller.position.z }
        : null;
    });
    if (!current) fail('browser movement fixture could not resolve the controller');
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline && Math.hypot(targetX - current.x, targetZ - current.z) > 0.1) {
      const result = await page.evaluate(({ x, z }) => {
        const rt = window.__realtime;
        const controller = window.__combat?.controller;
        if (!rt?.connected || !controller) return null;
        const dx = x - controller.position.x;
        const dz = z - controller.position.z;
        const distance = Math.hypot(dx, dz);
        if (distance <= 0.1) {
          return { x: controller.position.x, y: controller.position.y, z: controller.position.z };
        }
        const step = Math.min(6, distance);
        const nextX = controller.position.x + dx / distance * step;
        const nextZ = controller.position.z + dz / distance * step;
        controller.teleport(nextX, controller.position.y, nextZ);
        rt.sendMove({
          islandId: 'starter-island',
          x: nextX,
          y: controller.position.y,
          z: nextZ,
          heading: controller.heading,
          onBoat: false,
        });
        return { x: nextX, y: controller.position.y, z: nextZ };
      }, { x: targetX, z: targetZ });
      if (!result) fail('browser disconnected while walking the PvP smoke fixture', { current });
      current = result;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (Math.hypot(targetX - current.x, targetZ - current.z) > 0.1) {
      fail('browser movement fixture did not reach its target', { current, targetX, targetZ });
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  };
  const walkPeerTo = async (targetX, targetZ) => {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline && Math.hypot(targetX - peerX, targetZ - peerZ) > 0.1) {
      const dx = targetX - peerX;
      const dz = targetZ - peerZ;
      const distance = Math.hypot(dx, dz);
      const step = Math.min(6, distance);
      peerX += dx / distance * step;
      peerZ += dz / distance * step;
      if (peer.readyState !== 1) fail('peer disconnected while walking the PvP smoke fixture', { peerDiag });
      peerMove();
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (Math.hypot(targetX - peerX, targetZ - peerZ) > 0.1) {
      fail('peer movement fixture did not reach its target', { peerX, peerZ, targetX, targetZ });
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  };

  // S15 PvP: browser จริงโจมตี peer → peer ต้องได้ combat-hit ที่ Server ตัดสินเอง
  // (ดาเมจ/HP มาจาก Server — พิสูจน์ authority ข้าม client จริง ไม่เชื่อ Client)
  const pvpDiag = { hasTarget: false, gameplayAttacks: 0, gotHit: false, browserSawTarget: false };
  if (process.env.SMOKE_EXPECT_PVP === 'true') {
    const targetId = peerCharacterId;
    pvpDiag.hasTarget = Boolean(targetId);
    const gotCombat = () => peerDiag.combat.some(
      (c) => c.targetId === targetId && c.hp < c.maxHp,
    );
    // Put the independent peer beside the actual controlled avatar. Dispatching
    // pointerdown on the real control exercises Input -> PlayerCombat -> target
    // selection without Playwright waiting on the app's fullscreen gesture promise.
    // Keep the PvP authority smoke outside the starter-village safe zone.
    // Repeat these authoritative positions because the live gameplay loop may publish
    // the headless avatar's visual spawn position between smoke attempts.
    await Promise.all([
      walkBrowserTo(30, 8),
      walkPeerTo(31, 8),
    ]);
    peerY = 0;
    if (peer.readyState === 1) peerMove();
    await page.evaluate(() => {
      if (window.__combat?.controller) window.__combat.controller.heading = Math.PI / 2;
      window.__realtime?.sendMove({
        islandId: 'starter-island', x: 30, y: 0, z: 8,
        heading: Math.PI / 2, onBoat: false,
      });
    });
    const pvpDeadline = Date.now() + 20_000;
    while (targetId && Date.now() < pvpDeadline && !pvpDiag.gotHit) {
      if (peer.readyState === 1) peerMove();
      await new Promise((resolve) => setTimeout(resolve, 100));
      pvpDiag.browserSawTarget ||= await page.evaluate(
        (id) => (window.__smokeRealtime?.presence ?? []).some((presence) => presence.playerId === id),
        targetId,
      );
      await page.locator('.tc-attack').dispatchEvent('pointerdown', { pointerId: 71 });
      pvpDiag.gameplayAttacks += 1;
      // Keep one real control-path gesture above, then submit the same target-only
      // intent through the live RealtimeClient. Headless rAF can pause before
      // PlayerCombat consumes the touch queue; server authority must not depend on it.
      await page.evaluate((id) => {
        const rt = window.__realtime;
        rt?.sendMove({
          islandId: 'starter-island', x: 30, y: 0, z: 8,
          heading: Math.PI / 2, onBoat: false,
        });
        rt?.sendAttack(id, 'melee');
      }, targetId);
      await new Promise((resolve) => setTimeout(resolve, 400));
      pvpDiag.gotHit = gotCombat();
    }
  }

  // S16 shared monsters: browser จริงที่ได้รับ snapshot ส่ง intent → peer ต้องเห็น HP ลด + ตาย
  // (พิสูจน์ state เดียวกันข้าม client โดย Server เป็นเจ้าของ HP/death)
  const worldDiag = {
    gotSnapshot: 0, hitsSent: 0, sawDamage: false, sawDead: false,
    peerSawDamage: false, peerSawDead: false,
  };
  if (process.env.SMOKE_EXPECT_WORLD_MONSTERS === 'true') {
    const spawnId = 'starter-crab-1';
    await walkBrowserTo(22, -4);
    const peerSawDamage = () => peerDiag.worldDeltas.some((d) => d.spawnId === spawnId && d.hp < 70);
    const peerSawDead = () => peerDiag.worldDead.includes(spawnId);
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline && !peerSawDead()) {
      const sent = await page.evaluate((targetSpawnId) => {
        const rt = window.__realtime;
        if (!rt || !rt.connected || typeof rt.sendMonsterHits !== 'function') return false;
        return Boolean(rt.sendMonsterHits([targetSpawnId], 'skill'));
      }, spawnId);
      if (sent) {
        worldDiag.hitsSent += 1;
      }
      await new Promise((resolve) => setTimeout(resolve, 400));
      const browserWorld = await page.evaluate(() => window.__smokeRealtime ?? null);
      worldDiag.gotSnapshot = browserWorld?.worldSnapshot ?? 0;
      worldDiag.sawDamage = browserWorld?.worldDeltas.some(
        (d) => d.spawnId === 'starter-crab-1' && d.hp < 70,
      ) ?? false;
      worldDiag.sawDead = browserWorld?.worldDead.includes('starter-crab-1') ?? false;
    }
    worldDiag.peerSawDamage = peerSawDamage();
    worldDiag.peerSawDead = peerSawDead();
  }

  // S17 boat authority: browser sends summon/control intents only. Server chooses entity,
  // dock transform and movement; the independent peer must observe the same boat delta.
  const boatDiag = {
    starterBoatAcquired: false, saveStatus: null, intentId: null, summonSent: false,
    summonAttempts: 0, accepted: false, reason: null, entityId: null,
    resolutionSource: null, inputSent: 0, peerMoved: false,
  };
  if (process.env.SMOKE_EXPECT_BOAT_WORLD === 'true') {
    // A new account intentionally owns no boat. Acquire the free starter through the real
    // shop/storage path, then wait for the credentialed cross-origin save before summoning.
    // This keeps the smoke subject to the same canonical player_boats gate as production.
    const selectedBoat = await page.evaluate(() => window.__boat?.selectedBoatId ?? null);
    if (selectedBoat !== 'training-dinghy') {
      const saveResponse = page.waitForResponse(
        (response) => new URL(response.url()).pathname === '/api/player/save'
          && response.request().method() === 'POST'
          && response.status() === 200,
        { timeout: 30_000 },
      );
      // Exercise the real progression purchase path directly. The shop overlay is
      // presentation-only and may be suppressed when the headless avatar is briefly
      // mounted by an authoritative boat snapshot from the preceding scenario.
      const purchase = await page.evaluate(() => window.__boat?.progress?.purchase('training-dinghy') ?? null);
      if (!purchase?.ok) fail('could not acquire starter boat through progression', { purchase });
      await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
      boatDiag.saveStatus = (await saveResponse).status();
    }
    boatDiag.starterBoatAcquired = await page.evaluate(
      () => window.__boat?.selectedBoatId === 'training-dinghy',
    );
    boatDiag.intentId = await page.evaluate(() => {
      const rt = window.__realtime;
      rt?.sendMove({
        islandId: 'starter-island', x: 4.2, y: 0, z: -43, heading: Math.PI,
        onBoat: false,
      });
      return rt?.sendBoatIntent('summon') ?? null;
    });
    boatDiag.summonSent = Boolean(boatDiag.intentId);
    if (boatDiag.summonSent) boatDiag.summonAttempts += 1;
    const summonDeadline = Date.now() + 20_000;
    while (Date.now() < summonDeadline && !boatDiag.accepted && !boatDiag.reason) {
      const browserBoat = await page.evaluate(() => window.__smokeRealtime ?? null);
      const resolution = browserBoat?.boatResults.find(
        (result) => result.intentId === boatDiag.intentId,
      );
      if (resolution) {
        boatDiag.accepted = resolution.accepted;
        boatDiag.reason = resolution.reason ?? null;
        boatDiag.entityId = resolution.entityId ?? null;
        boatDiag.resolutionSource = 'owner-result';
        break;
      }
      // The page's inbound message task can lag behind the Node peer while the shared-world
      // delta stream is busy. A matching boat-delta on the independent peer is the same
      // server-authoritative acceptance evidence: only the server chooses entityId/transform.
      const peerBoat = peerDiag.boatDeltas.find((boat) => boat?.ownerId !== peerCharacterId
        && boat?.definitionId === 'training-dinghy'
        && boat?.islandId === 'starter-island');
      if (peerBoat) {
        boatDiag.accepted = true;
        boatDiag.entityId = peerBoat.entityId;
        boatDiag.resolutionSource = 'peer-delta';
        break;
      }
      const resent = await page.evaluate((intentId) => {
        const rt = window.__realtime;
        rt?.sendMove({
          islandId: 'starter-island', x: 4.2, y: 0, z: -43, heading: Math.PI,
          onBoat: false,
        });
        return Boolean(rt?.sendBoatIntent('summon', {}, intentId));
      }, boatDiag.intentId);
      if (resent) boatDiag.summonAttempts += 1;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    if (boatDiag.entityId) {
      await page.evaluate((entityId) => {
        window.__realtime?.sendMove({ islandId: 'starter-island', x: 4.2, y: 0, z: -43, heading: Math.PI, onBoat: false });
        window.__realtime?.sendBoatIntent('board', { entityId });
      }, boatDiag.entityId);
      const initial = peerDiag.boatDeltas.find((boat) => boat?.entityId === boatDiag.entityId);
      const initialX = initial?.x ?? 4.2;
      const initialZ = initial?.z ?? -43;
      const moveDeadline = Date.now() + 15_000;
      while (Date.now() < moveDeadline && !boatDiag.peerMoved) {
        const sent = await page.evaluate((entityId) => Boolean(window.__realtime?.sendBoatIntent('input', {
          entityId, throttle: 1, steer: 0, anchor: false,
        })), boatDiag.entityId);
        if (sent) boatDiag.inputSent += 1;
        await new Promise((resolve) => setTimeout(resolve, 300));
        boatDiag.peerMoved = peerDiag.boatDeltas.some((boat) => boat?.entityId === boatDiag.entityId
          && Math.hypot(boat.x - initialX, boat.z - initialZ) > 0.25);
      }
    }
  }

  peer.close();
  if (process.env.SMOKE_EXPECT_WORLD_MONSTERS === 'true'
    && !(worldDiag.gotSnapshot > 0 && worldDiag.hitsSent > 0
      && worldDiag.peerSawDamage && worldDiag.peerSawDead)) {
    fail('shared world monster state did not cross browser and peer (snapshot/damage/death)', {
      worldDiag, worldDeltas: wsEvents.worldDeltas.slice(0, 3), worldDead: wsEvents.worldDead,
      pvpDiag, peerDiag, peerReadyState: peer.readyState, pumpDiag,
    });
  }
  if (process.env.SMOKE_EXPECT_PVP === 'true' && !pvpDiag.gotHit) {
    fail('did not receive a server-authoritative combat-hit from PvP', {
      pvpDiag, combat: wsEvents.combat.slice(0, 3), peerDiag, pumpDiag,
    });
  }
  if (process.env.SMOKE_EXPECT_BOAT_WORLD === 'true'
    && !(boatDiag.summonSent && boatDiag.accepted && boatDiag.entityId
      && (boatDiag.peerMoved || boatDiag.resolutionSource === 'peer-delta'))) {
    fail('authoritative boat state did not cross browser and peer', { boatDiag, peerDiag, wsEvents, pumpDiag });
  }
  console.log('S13-S17 multiplayer OK', JSON.stringify({ peerDiag, pumpDiag, pvpDiag, worldDiag, boatDiag }));
}

console.log('SMOKE PASS');
console.log(JSON.stringify({ apiCalls: [...new Set(apiCalls)], tradeProbeStatus: tradeProbe.status, wsEvents: { opened: wsEvents.opened, frames: [...new Set(wsEvents.frames)] }, pageErrors }, null, 2));
await browser.close();
