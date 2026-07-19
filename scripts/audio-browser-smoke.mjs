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
const binaryRequests = [];
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
  if (/\.(?:mp3|glb)(?:\?|$)/i.test(request.url())) binaryRequests.push(request.url());
});

try {
  await page.goto(gameUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => Boolean(window.__boat && window.__audio), null, { timeout: 120_000 });
  const beforeGesture = await page.evaluate(() => ({
    status: window.__audio?.status,
    contexts: window.__audioContextConstructed,
  }));
  if (beforeGesture.status !== 'locked' || beforeGesture.contexts !== 0 || binaryRequests.length !== 0) {
    fail('procedural runtime was not inert before the first gesture', { beforeGesture, binaryRequests, pageErrors });
  }

  const toggle = page.locator('.audio-toggle');
  const toggleBox = await toggle.boundingBox();
  if (!toggleBox) throw new Error('audio toggle has no clickable bounds');
  // A direct mouse gesture remains trusted but does not wait on the game's fullscreen promise.
  await page.mouse.click(toggleBox.x + toggleBox.width / 2, toggleBox.y + toggleBox.height / 2);
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
  if (binaryRequests.length !== 0) {
    fail('procedural runtime unexpectedly transferred MP3/GLB media', { binaryRequests, pageErrors });
  }

  // The game's existing first-gesture fullscreen behavior makes the desktop page's
  // window bounds immutable in Chromium. Use an independent portrait page instead.
  const mobilePage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobilePage.goto(gameUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await mobilePage.waitForFunction(() => Boolean(window.__boat && window.__audio), null, { timeout: 120_000 });
  const mobileLayout = await mobilePage.evaluate(() => {
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
  await mobilePage.close();
  if (!mobileLayout.ok) fail('mobile audio control overlaps the gameplay HUD', { mobileLayout });

  if (!process.exitCode) {
    console.log(JSON.stringify({
      ok: true,
      beforeGesture,
      transitions,
      binaryAssetRequests: binaryRequests.length,
      mobileLayout,
      localFallback: true,
    }));
  }
} finally {
  await browser.close();
}

if (process.exitCode) process.exit(process.exitCode);
