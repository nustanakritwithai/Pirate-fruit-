import { chromium } from 'playwright';

const gameUrl = process.env.SMOKE_GAME_URL ?? 'http://127.0.0.1:4173';

function fail(message, diagnostics) {
  console.error(`AUDIO SMOKE FAIL: ${message}`);
  if (diagnostics) console.error(JSON.stringify(diagnostics, null, 2));
  process.exitCode = 1;
}

const browser = await chromium.launch({
  executablePath: process.env.SMOKE_CHROMIUM || undefined,
});
const page = await browser.newPage({ viewport: { width: 900, height: 480 } });
const audioRequests = [];
const pageErrors = [];

await page.addInitScript(() => {
  window.__audioContextConstructed = 0;
  const NativeAudioContext = window.AudioContext || window.webkitAudioContext;
  if (NativeAudioContext) {
    const WrappedAudioContext = new Proxy(NativeAudioContext, {
      construct(Target, args) {
        window.__audioContextConstructed += 1;
        return Reflect.construct(Target, args, Target);
      },
    });
    window.AudioContext = WrappedAudioContext;
    if (window.webkitAudioContext) window.webkitAudioContext = WrappedAudioContext;
  }
});
page.on('pageerror', (error) => pageErrors.push(String(error).slice(0, 240)));
page.on('request', (request) => {
  if (/\.mp3(?:\?|$)/i.test(request.url())) audioRequests.push(request.url());
});

try {
  await page.goto(gameUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => Boolean(window.__boat && window.__audio), null, { timeout: 120_000 });
  const beforeGesture = await page.evaluate(() => ({
    status: window.__audio?.status,
    contexts: window.__audioContextConstructed,
  }));
  if (beforeGesture.status !== 'locked' || beforeGesture.contexts !== 0 || audioRequests.length !== 0) {
    fail('audio was not inert before the first gesture', { beforeGesture, audioRequests, pageErrors });
  }

  const toggle = page.locator('.audio-toggle');
  await toggle.click();
  await page.waitForFunction(() => window.__audio?.status === 'running', null, { timeout: 10_000 });
  const transitions = await page.evaluate(async () => {
    const audio = window.__audio;
    const island = { dead: false, boss: false, combat: false, onBoat: false, onFoot: true, loading: false };
    audio.setMusicObservation(island);
    const first = audio.music.state;
    await new Promise((resolve) => setTimeout(resolve, 250));
    audio.setMusicObservation({ ...island, onBoat: true, onFoot: false });
    const sailing = audio.music.state;
    await new Promise((resolve) => setTimeout(resolve, 250));
    const firstEvent = audio.play('boat.cannon', { eventId: 'audio-smoke-event' });
    const replay = audio.play('boat.cannon', { eventId: 'audio-smoke-event' });
    audio.setMusicObservation(island);
    const returned = audio.music.state;
    await new Promise((resolve) => setTimeout(resolve, 450));
    return { first, sailing, returned, firstEvent, replay, status: audio.status };
  });
  if (transitions.first !== 'island'
      || transitions.sailing !== 'sailing'
      || transitions.returned !== 'island'
      || transitions.status !== 'running'
      || !transitions.firstEvent
      || transitions.replay) {
    fail('music transition or authoritative-event dedupe failed', { transitions, pageErrors });
  }
  if (audioRequests.length === 0) {
    fail('no lazy music request started after unlock', { transitions, pageErrors });
  }

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileLayout = await page.evaluate(() => {
    const toggleRect = document.querySelector('.audio-toggle')?.getBoundingClientRect();
    if (!toggleRect) return { ok: false, reason: 'missing toggle' };
    const hudRects = [...document.querySelectorAll(
      '.tc-attack,.quest-tracker,.stats-open-button,.stats-panel-root,.inv-open-button,.inv-root,.hud',
    )]
      .map((element) => element.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0);
    const overlaps = hudRects.some((rect) => !(
      toggleRect.right <= rect.left || toggleRect.left >= rect.right
      || toggleRect.bottom <= rect.top || toggleRect.top >= rect.bottom
    ));
    return {
      ok: toggleRect.left >= 0 && toggleRect.top >= 0
        && toggleRect.right <= innerWidth && toggleRect.bottom <= innerHeight && !overlaps,
      toggle: {
        left: toggleRect.left, top: toggleRect.top,
        right: toggleRect.right, bottom: toggleRect.bottom,
      },
      overlaps,
    };
  });
  if (!mobileLayout.ok) fail('mobile audio control overlaps the gameplay HUD', { mobileLayout });

  if (!process.exitCode) {
    console.log(JSON.stringify({
      ok: true,
      beforeGesture,
      transitions,
      mp3RequestsAfterUnlock: audioRequests.length,
      mobileLayout,
      localFallback: true,
    }));
  }
} finally {
  await browser.close();
}

if (process.exitCode) process.exit(process.exitCode);
