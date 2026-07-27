# Audio System — Phase A1

## Scope and safety boundary

Audio is a client-side presentation system guarded by `VITE_ENABLE_AUDIO_SYSTEM`. Its default is `false`. Audio reads gameplay state and authoritative events, but it never computes damage, movement, rewards, monster state, boat state, save data, or realtime messages. Every public audio call catches failure so an unavailable `AudioContext` cannot block game startup.

Audio settings use the isolated local key `pirate-fruit:audio:v1`. They are not part of local gameplay saves, remote saves, PostgreSQL, or reconciliation.

## Procedural Pirate Fantasy palette

The score is an original, code-authored maritime adventure palette. Sailing uses two alternating 6/8 arrangements built from Dorian/minor-pentatonic scale degrees, low hull-like pulse, sparse deck percussion and fantasy bell accents. Island exploration uses a slower major-pentatonic pattern with wider rests. Combat and boss states reuse the active area score with ducking only. Sustained low-frequency tension oscillators are deliberately avoided because they reproduce as hum or buzz on small mobile speakers.

Signature SFX combine a small number of oscillator/noise layers: cannon body plus filtered blast, sword whoosh, magic rise, coins, level-up, wind and waves. The noise table is generated in memory only after audio unlock. It is never serialized, fetched or cached by the host. Scheduling uses a 320 ms look-ahead and short-lived nodes; the sequencer does not preload audio, decode buffers or run an AudioWorklet.

## Runtime structure

- `AudioManager`: lifecycle, buses, settings, dedupe, visibility handling and safe failure boundary.
- `BrowserAudioBackend`: Web Audio graph, scheduled procedural music layers, voice priority and spatial panners.
- `MusicStateMachine`: pure priority resolution and stable transitions.
- `AudioRuntimeBridge`: read-only polling bridge for movement, combat and boat state.
- `AudioRegistry`: data-driven procedural fallback definitions for all A1 cue categories.
- `AudioSettingsUI`: keyboard-accessible desktop/mobile control panel.

The buses are `master`, `music`, `ambience`, `sfx`, and `ui`. Master, music, ambience, SFX and UI levels are stored independently. Muting sets only the master output to zero and preserves the individual values. The master output passes through a 36 Hz high-pass and a conservative dynamics limiter to prevent sub-bass rumble and summed procedural peaks from distorting phone speakers.

## Autoplay and loading

Construction creates no `AudioContext`, media element or network request. The first `pointerdown`, `touchend` or `keydown` calls `unlock()`. The lightweight gesture hook remains active so a later gesture can recover an AudioContext suspended by an app switch, screen lock, phone call or browser memory pressure; a context that is already running returns immediately. Procedural music scheduling begins only after unlock and a resolved music state, keeping initial audio transfer at zero before the gesture.

Music is synthesized in short scheduled layers. A crossfade briefly overlaps the old and new procedural layers, then stops and disconnects the old layer.

## Music priority

| Priority | State | Behavior |
|---:|---|---|
| 1 | death | Fade music out, play death cue |
| 2 | boss | Keep location music and apply stronger ducking |
| 3 | combat | Keep location music and apply lighter ducking |
| 4 | sailing/on boat | Alternate sailing A/B playlist |
| 5 | island/on foot | Loop island music |
| 6 | loading/unknown | Silence |

Crossfades are clamped to 1.5–2.5 seconds (default 1.8 seconds). Repeating the same state does not restart a track. Sailing advances only when the active track ends. Death clears the base track; respawn resolves the current location again.

## SFX and spatial audio

The registry covers UI, player, combat, monster, boat, rewards and world cues. A cue can later point to a licensed file without changing gameplay hooks; A1 uses procedural recipes when no file exists.

Monster, cannon, boat impact/sinking, projectile and world cues are spatial. Music and UI are always non-positional. Each spatial cue has maximum distance, rolloff and interest range. Mobile uses a smaller interest range and a 10-voice global cap; desktop uses 22 voices. Higher-priority death, sinking and guard-break cues can replace lower-priority footsteps or ambience.

Authoritative realtime callbacks pass a stable event identity to `AudioManager`. Seen identities are retained for 15 seconds with a bounded 512-entry cache, preventing reconnect/replay from producing duplicate sound. Local mode uses the same manager and does not depend on HTTP or WebSocket availability.

## Procedural-only asset policy

Production must not add MP3, GLB or base64-embedded audio. New score layers, SFX, characters, monsters, boats, buildings and effects should be authored from Web Audio or Three.js primitives. The build gate rejects MP3 and GLB output. This palette adds zero audio-file transfer; its only bandwidth cost is the small compressed JavaScript delta containing note and synthesis definitions.

The procedural conversion reduced the production directory from 25,559,187 bytes to 4,465,313 bytes: 21,093,874 bytes (82.5%) removed. The remaining transfer is primarily the 2.80 MB JPG texture set plus roughly 0.42 MB of gzipped JavaScript on a cold load.

## Test surface

Unit tests cover state priority, stable transitions, gesture unlock, island/sailing crossfades, replay dedupe, local settings persistence, visibility suspend/resume, death/respawn and the false-flag inert path. Music and SFX are synthesized with Web Audio nodes; there are no media URLs. Browser smoke checks zero MP3 requests both before and after unlock, island/sailing/island states, dedupe and a 390×844 UI collision probe. The build gate requires zero MP3, zero GLB and rejects base64 audio in JavaScript.
