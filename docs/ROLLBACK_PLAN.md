# Rollback Plan

## Immediate audio rollback

1. Set `VITE_ENABLE_AUDIO_SYSTEM=false` on the affected Static Site environment.
2. Rebuild and deploy the Static Site from the last approved source commit.
3. Confirm the speaker button is absent, no `AudioContext` is created, and Network shows no MP3 request.
4. Smoke-test walking, combat, monsters, boats, local fallback, remote save and realtime reconnect.

Do not delete or migrate `pirate-fruit:audio:v1`; keeping it allows a future safe re-enable with the player's settings intact. Do not delete local saves, remote saves, database rows or cargo/economy data. No server restart or database rollback is required for A1.

## Failure containment

`AudioManager` catches unlock, playback, suspend and resume failures. Audio hooks are read-only and all calls return without affecting gameplay. If a specific cue or music file fails, the game continues; procedural SFX are the fallback where available. If WebSocket or Server is unavailable, local observation continues to drive movement, area music and local events.

## Source rollback

If a code revert is required, revert the A1 commit in a new PR. Do not rewrite target-branch history and do not remove audio settings from players. Re-run the normal build-and-test and browser-smoke workflows before redeploying.
