# Audio Asset Sources and Licenses

No audio was downloaded from an external asset site in Phase A1. Procedural SFX are generated at runtime from project code and have no third-party sample dependency.

## Music supplied by the project owner

| Production asset | Supplied source filename | Duration | Original | Production | Source/license status |
|---|---|---:|---:|---:|---|
| `sailing-moon-treasure-a.mp3` | `สมบัติจันทราโจรสลัด (1).mp3` | 133.512 s | 3,205,014 B; ~192 kbps; 48 kHz | 1,869,575 B; 112 kbps; 44.1 kHz | User-provided for Pirate Fruit; no external download |
| `sailing-moon-treasure-b.mp3` | `สมบัติจันทราโจรสลัด.mp3` | 202.824 s | 4,686,246 B; ~185 kbps; 48 kHz | 2,840,181 B; 112 kbps; 44.1 kHz | User-provided for Pirate Fruit; no external download |
| `island-devil-fruit-fury.mp3` | `ผลปีศาจเดือด (1).mp3` | 75.648 s | 1,838,568 B; ~194 kbps; 48 kHz | 1,059,518 B; 112 kbps; 44.1 kHz | User-provided for Pirate Fruit; no external download |

Production copies are stereo MP3, loudness-normalized toward -16 LUFS with a -2.5 dB processing ceiling (verified encoded true peak no higher than -1.5 dBFS), stripped of source metadata, resampled to 44.1 kHz and encoded at 112 kbps. The supplied originals remain outside the repository and production build.

Before a public commercial release, the project owner should retain authorship or license evidence for these three supplied tracks. This manifest records provenance but does not create rights that were not already granted.

## Size report

- Original total: 9,729,828 bytes (9.73 MB / 9.28 MiB).
- Production total: 5,769,274 bytes (5.77 MB / 5.50 MiB).
- Reduction: 3,960,554 bytes, approximately 40.7%.
- Initial transfer before unlock: 0 bytes by design and browser-smoke gate.
- Runtime transfer: only the active location track; a second track is requested transiently during crossfade/playlist change.
