# Operations Runbook

## Audio A1 rollout

Production must remain `VITE_ENABLE_AUDIO_SYSTEM=false` until the Draft PR, CI and an approved staging/mobile verification are complete. Do not modify any existing Render flags while evaluating this phase.

### Pre-deploy gates

1. Confirm target SHA and PR base are the approved branch.
2. Run `npm ci`, `npm run build`, `npm run verify:audio-assets`, `npm test`, and `npm run test:extended`.
3. Confirm `client/dist/assets/` contains three ASCII MP3 names with content hashes.
4. Confirm built JavaScript contains no `data:audio/...;base64` payload.
5. Confirm the false-flag build has no audio button, no `AudioContext`, and no MP3 request.

### Staging-only verification

Set `VITE_ENABLE_AUDIO_SYSTEM=true` only on a non-production Static Site and rebuild.

1. Open DevTools Network, filter `mp3`, reload without touching the page: transfer must remain zero.
2. Tap once. The audio button must stop pulsing and island music should fade in.
3. Board a boat: sailing music must crossfade in within 1.5–2.5 seconds.
4. Leave the boat: island music must crossfade back without restarting on repeated state ticks.
5. Trigger combat, death and respawn. Confirm music ducks/fades and returns to the correct area.
6. Disconnect WebSocket or let the Render service sleep. Local movement, music and procedural SFX must continue.
7. Reconnect/resync. Confirm no duplicate music or repeated authoritative cannon/death sound.

### Mobile verification (Chrome Android)

1. Clear Network log and reload on mobile data or throttled Fast 3G; verify no MP3 before tapping.
2. Tap the speaker button, adjust master/music/SFX/ambience, mute, reload and confirm persistence.
3. Verify the panel does not cover HP/Energy, quest tracker, stats, inventory, joystick or combat buttons in portrait and landscape.
4. Background the browser for 10 seconds and return. Audio should resume only after a safe browser resume; gameplay must not jump or fail.
5. Sail long enough to change playlist tracks and observe memory. Only current/crossfading streams should remain; voice cap is 10 on touch/mobile devices.

### Monitoring

Audio warnings are prefixed `[audio]` and must remain non-fatal. Track MP3 transfer, JS bundle change, memory during sailing crossfade and reports of locked audio. An audio failure is not permission to alter combat, monster, boat or server authority.

## Existing server operations

Audio A1 adds no server endpoint, database migration, secret, cookie, WebSocket frame or PostgreSQL field. Existing Client/Server/PostgreSQL recovery procedures remain unchanged.
