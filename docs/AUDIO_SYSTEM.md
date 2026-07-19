# Audio System — Phase A1

## Scope and safety boundary

Audio is a client-side presentation system guarded by `VITE_ENABLE_AUDIO_SYSTEM`. Its default is `false`. Audio reads gameplay state and authoritative events, but it never computes damage, movement, rewards, monster state, boat state, save data, or realtime messages. Every public audio call catches failure so an unavailable `AudioContext` cannot block game startup.

Audio settings use the isolated local key `pirate-fruit:audio:v1`. They are not part of local gameplay saves, remote saves, PostgreSQL, or reconciliation.

## Runtime structure

- `AudioManager`: lifecycle, buses, settings, dedupe, visibility handling and safe failure boundary.
- `BrowserAudioBackend`: Web Audio graph, two streaming music decks, procedural synthesis, voice priority and spatial panners.
- `MusicStateMachine`: pure priority resolution and stable transitions.
- `AudioRuntimeBridge`: read-only polling bridge for movement, combat and boat state.
- `AudioRegistry`: data-driven procedural fallback definitions for all A1 cue categories.
- `AudioSettingsUI`: keyboard-accessible desktop/mobile control panel.

The buses are `master`, `music`, `ambience`, `sfx`, and `ui`. Master, music, ambience, SFX and UI levels are stored independently. Muting sets only the master output to zero and preserves the individual values.

## Autoplay and loading

Construction creates no `AudioContext`, media element or network request. The first `pointerdown`, `touchend` or `keydown` calls `unlock()`. Music elements are created with `preload="none"`, and a music URL is assigned only after unlock and a resolved music state. This keeps initial audio transfer at zero before the gesture.

Music is streamed through two `HTMLAudioElement` sources routed into Web Audio. This avoids decoding all tracks into large PCM buffers on mobile. A crossfade briefly uses two streams, then clears the old element and URL.

## Music priority

| Priority | State | Behavior |
|---:|---|---|
| 1 | death | Fade music out, play death cue |
| 2 | boss | Keep location music, duck it and add procedural tension |
| 3 | combat | Keep location music, duck it and add lighter tension |
| 4 | sailing/on boat | Alternate sailing A/B playlist |
| 5 | island/on foot | Loop island music |
| 6 | loading/unknown | Silence |

Crossfades are clamped to 1.5–2.5 seconds (default 1.8 seconds). Repeating the same state does not restart a track. Sailing advances only when the active track ends. Death clears the base track; respawn resolves the current location again.

## SFX and spatial audio

The registry covers UI, player, combat, monster, boat, rewards and world cues. A cue can later point to a licensed file without changing gameplay hooks; A1 uses procedural recipes when no file exists.

Monster, cannon, boat impact/sinking, projectile and world cues are spatial. Music and UI are always non-positional. Each spatial cue has maximum distance, rolloff and interest range. Mobile uses a smaller interest range and a 10-voice global cap; desktop uses 22 voices. Higher-priority death, sinking and guard-break cues can replace lower-priority footsteps or ambience.

Authoritative realtime callbacks pass a stable event identity to `AudioManager`. Seen identities are retained for 15 seconds with a bounded 512-entry cache, preventing reconnect/replay from producing duplicate sound. Local mode uses the same manager and does not depend on HTTP or WebSocket availability.

## Adding a real SFX file

1. Confirm redistribution rights. Do not download an unverified asset.
2. Store the optimized production copy under `client/src/assets/audio/` with an ASCII name.
3. Add its source and license to `docs/AUDIO_ASSET_LICENSES.md`.
4. Add a static `new URL(..., import.meta.url)` entry so Vite emits a content hash.
5. Keep the procedural recipe as the error/offline fallback.
6. Run `npm run build && npm run verify:audio-assets && npm test`.

## Test surface

Unit tests cover state priority, stable transitions, gesture unlock, island/sailing crossfade requests, replay dedupe, local settings persistence, visibility suspend/resume, death/respawn and the false-flag inert path. Browser smoke checks zero pre-gesture MP3 requests, unlock, island/sailing/island states, dedupe and a 390×844 UI collision probe. The build gate verifies exactly three ASCII, content-hashed MP3 outputs and rejects base64 audio in JavaScript.
