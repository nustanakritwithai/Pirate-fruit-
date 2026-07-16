# Phase S1 — Monorepo and Shared Boundary

S1 adds three workspace packages without changing gameplay behavior:

- `client/` remains the existing Vite + Three.js Static Site and keeps its standalone Render build contract.
- `shared/` contains browser-free IDs, player contracts, protocol versions, event envelopes, server schemas, and pure validation helpers.
- `server/` is a buildable Node/TypeScript skeleton that imports shared contracts but does not open ports or access the database yet.

The Client is deliberately not made dependent on the workspace package in S1. Render currently builds from `rootDir: client`; keeping that package standalone avoids changing the deployed Static Site before the deployment contract is handled explicitly. Client adoption of shared types is planned after the monorepo build/deployment contract is validated.

## Boundary rules

`shared/` must not import `three`, `window`, `document`, `localStorage`, DOM types, renderer, camera, or audio code.

S1 does not move Gameplay, change save behavior, or enable remote state. S2 introduces the server runtime; S3 introduces repository adapters.
