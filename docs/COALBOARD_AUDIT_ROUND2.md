# CoalBoard Audit Report — Pirate Fruit (Round 2)

| Field | Value |
|-------|-------|
| Date | 2026-08-05 13:15 UTC |
| Rigor | `high` (4 lenses: empirical, formal, show-me, adversary) |
| Target | Full repo `/workspace` (568 tracked files) |
| Production HEAD | `e77d86d` (PR #138 merged, live on Render) |
| Prior audit | Round 1 standard rigor → issues #128–#137 (fixed & deployed) |
| CoalBoard version | v2.0.0 |

## Executive summary

Round-1 fixes (#128–#137) are **deployed and verified live** (`commitSha` matches, `/ready` database OK). Round 2 at **high rigor** found **2 new HIGH**, **5 MEDIUM**, and several LOW/hardening items — mostly gaps left by partial application of round-1 fixes, a new CVE in `@fastify/rate-limit`, and missing production config.

**Judge verdict:** Production is materially safer than pre-#138, but **not** at the security posture implied by `SECURITY_MODEL.md` and operator comments. Recommend a focused hotfix PR before the next feature work.

---

## CRITICAL

### C1 — Trade coin ledger bypass when `ENABLE_TRADE_SERVER` without `ENABLE_PROGRESSION_SERVER`

- **Lens:** adversary
- **Status:** Latent (not exploitable on current `render.yaml` which sets both `true`)
- **Evidence:** `environment.ts` blocks `ENABLE_PVP` without progression authority but **not** `ENABLE_TRADE_SERVER`. When `preserveServerProgression=false`, `POST /api/player/save` can overwrite `characters.coins` from client documents (`playerSaveRepository.ts` persist path).
- **Fix:** Add env validation: `ENABLE_TRADE_SERVER && !ENABLE_PROGRESSION_SERVER` → startup error (mirror PvP rule).

---

## HIGH

### H1 — `@fastify/rate-limit@11.1.0` CVE-2026-15144 (IPv6 bucket bypass)

- **Lens:** empirical
- **Evidence:** Installed `11.1.0`; advisory GHSA-grpc-p53c-r64v; patched in `11.2.0`. Production uses `trustProxy` + global rate limit on guest/trade/shop/quest routes. `npm audit` does **not** flag this yet.
- **Fix:** Bump to `^11.2.0`, redeploy.

### H2 — `STRICT_ORIGIN_MODE` incomplete: 2/9 surfaces + not enabled in production

- **Lenses:** empirical, formal, show-me, adversary (converged)
- **Evidence:**
  - Code default `false`; `render.yaml` never sets it (PR #138 checklist item unchecked).
  - Live: `curl` without `Origin` → `201` guest session + CSRF token on production.
  - `isTrustedOrigin()` only used in `sessionRoutes.ts` + `playerSaveRoutes.ts`. Trade, quest, monster, shop, progression, character routes, and **`/ws` WebSocket** still use `origin && !allowedOrigins()` — missing Origin always trusted.
- **Fix:** (1) Set `STRICT_ORIGIN_MODE=true` in `render.yaml` if headless access not needed. (2) Replace all inline origin checks with `isTrustedOrigin()`. (3) Update `SECURITY_MODEL.md` until uniform.

### H3 — Trade `preparedMutation` can return aborted PG connection to pool

- **Lens:** formal
- **Evidence:** `tradeRepository.ts` — `settled=true` before `client.query(commit)`; failed commit + `rollback()` no-op leaves connection in aborted state in shared pool.
- **Fix:** Set `settled` only after success; `ROLLBACK` on failed commit; `client.release(err)` on unrecoverable state. Add regression test.

### H4 — WebSocket connection-flood DoS (200 global cap, no per-character limit)

- **Lens:** adversary
- **Evidence:** `RealtimeHub.register()` — one session can open many `/ws` connections until global 200; ping keeps alive past idle reaper.
- **Fix:** Per-`characterId` concurrent connection cap (e.g. 1–2); optional per-IP WS rate limit.

---

## MEDIUM

### M1 — `schema.ts` idempotency index drift vs migration 0009

- **Lens:** formal
- **Evidence:** DB index is `(character_id, operation, idempotency_key)`; `schema.ts` still declares old `(character_id, idempotency_key)`; `playerSaveService.ts:44` comment says global-per-character uniqueness.
- **Fix:** Align `schema.ts`, comment, and dedup query; add `ORDER BY created_at DESC LIMIT 1`.

### M2 — Transitive CVEs: `find-my-way`, `fast-uri` (fixable via `npm audit fix`)

- **Lens:** empirical
- **Fix:** `npm audit fix` (no `--force`), retest.

### M3 — No npm Dependabot / CI `npm audit` gate

- **Lens:** empirical, show-me
- **Fix:** Add `package-ecosystem: npm` to `dependabot.yml`; CI step `npm audit --omit=dev --audit-level=high`.

### M4 — Postgres integration tests skipped without `DATABASE_TEST_URL`

- **Lens:** show-me
- **Evidence:** 4 tests skipped in default `npm run test:server`; migration 0009 rollback only proven when Postgres provisioned manually.
- **Fix:** CI always sets `DATABASE_TEST_URL` (already in `server-foundation.yml` — verify job actually runs integration suites).

### M5 — Trade/economy ambiguous-commit desync window

- **Lens:** formal, adversary
- **Evidence:** `executeAtomic` persists economy before player `COMMIT`; ack-loss can desync stock vs coins.
- **Fix:** Re-query idempotency row before economy rollback; document residual risk.

### M6 — `TRUSTED_PROXY_CIDR=10.0.0.0/8` may be too broad on Render

- **Lens:** empirical, adversary
- **Evidence:** Render appends XFF; broad RFC1918 trust affects rate-limit key granularity.
- **Fix:** Document Render topology; consider `CF-Connecting-IP` or narrower CIDR.

---

## LOW

| ID | Finding | Fix |
|----|---------|-----|
| L1 | API lacks security headers (`@fastify/helmet`) | Add helmet or manual HSTS/nosniff |
| L2 | GitHub Actions no `permissions:` block | `permissions: contents: read` |
| L3 | Admin secret uses `===` not `timingSafeEqual` | Use constant-time compare |
| L4 | bodyLimit test only ~77 KB, no 413 negative test | Extend `playerSaveRoutes.test.ts` |
| L5 | No vitest coverage tooling | Add `@vitest/coverage-v8` |

---

## Verified clean (round-1 fixes holding)

- ✅ bodyLimit 300 KB per save route (#128) — code + production commit match
- ✅ trustProxy CIDR scoping (#132) — active in production
- ✅ Migration 0009 deployed — `/ready` database OK
- ✅ PvP requires progression authority at boot (#131) — runtime test exists in `realtimeHub.test.ts`
- ✅ GitHub Actions SHA-pinned (#136)
- ✅ Economy catch-up warning + rollback double-failure log (#133, #134) — tests pass
- ✅ `drizzle-orm` pinned 0.45.2 (#135)
- ✅ CORS allow-list — no wildcard reflection

---

## Recommended next actions (priority order)

1. Bump `@fastify/rate-limit` → 11.2.0 + `npm audit fix` → deploy
2. Wire `isTrustedOrigin()` to all mutation routes + `/ws`; set `STRICT_ORIGIN_MODE=true` in `render.yaml`
3. Block `ENABLE_TRADE_SERVER` without `ENABLE_PROGRESSION_SERVER`
4. Fix trade connection-pool rollback bug
5. Add per-character WebSocket connection cap
6. Align `schema.ts` with migration 0009

---

*Generated by CoalBoard v2.0.0 high-rigor audit. Staged fixes: none (report-only).*
