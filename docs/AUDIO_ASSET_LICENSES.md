# Audio Asset Sources and Licenses

Audio Phase A1 is procedural-only. Music, ambience and SFX are generated at runtime with Web Audio oscillators and gain envelopes. The production repository and build contain no MP3, WAV, OGG, sampled audio or base64-embedded audio, so there is no third-party audio asset dependency or runtime audio transfer.

The Pirate Fantasy palette, including its scale-degree patterns, rhythms and synthesis recipes, is original project code. It does not transcribe or sample a commercial pirate-film/game score. Filtered noise is generated deterministically in the browser after unlock and is not an external recording.

The three tracks supplied by the project owner were evaluated and optimized during development, then removed from the repository and production build at the owner's request. The supplied originals remain outside the repository and are not required to build or run the game.

## Production size report

- Audio media files: 0.
- Audio media bytes: 0.
- Audio transfer before unlock: 0 bytes.
- Audio transfer after unlock: 0 bytes.
- Procedural definitions ship as a small part of the JavaScript bundle.
