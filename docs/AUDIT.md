# Boing Pets — Codebase Audit (v0.1 MVP)

Audit date: 2026-11-08. Scope: entire repository at `main` (`2975dd6`).

## Executive summary

Boing Pets is a **local-first Cloudflare Workers + Vite** testnet MVP: hatch one generative SVG pet per Boing wallet, care via verified self-transfers / Ed25519 check-ins, and browse a public pasture. It is intentionally small, secure-for-an-MVP, and **not** an MMO stack. The universe redesign must **extend this trust model and event-sourced care loop**, not throw them away.

---

## Current architecture diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ Browser (Vite :5177)                                            │
│  src/main.ts  → wallet (window.boing | Express popup)           │
│  src/core.ts  → traits, state, SVG, marker amounts (shared)     │
│  src/style.css → Boing navy/blue UI                             │
└───────────────────────────┬─────────────────────────────────────┘
                            │ /api/* (Vite proxy → :8787)
┌───────────────────────────▼─────────────────────────────────────┐
│ Cloudflare Worker (worker/index.ts)                             │
│  GET  /api/pasture | /api/pet                                   │
│  POST /api/challenge | /api/confirm                             │
│  Origin gate · body size limit · D1 batch writes                │
│  proof.ts → RPC receipt + block self-transfer verification         │
└───────────────┬─────────────────────────────┬───────────────────┘
                │ D1 binding `DB`              │ RPC_URL
                ▼                             ▼
        SQLite (local/.wrangler)     Boing testnet 6913
        pets · events · challenges
```

**Shared pure module:** `src/core.ts` is imported by both browser and Worker so care math and SVG stay consistent.

**Deployment posture:** `wrangler.jsonc` is placeholder-only (`workers_dev: false`, fake D1 id). CI dry-runs deploy; nothing auto-deploys.

---

## Existing game loops

| Loop | Trigger | Proof | Effect |
|------|---------|-------|--------|
| **Hatch** | Once per wallet | Tiny self-transfer (~0.001 BOING marker amount) + receipt proof | Creates pet; traits from `blake3(owner+tx)` |
| **Feed** | Once per UTC day | Same transfer proof | Restores belly; care day for streak |
| **Daily hello** | Once per UTC day | Ed25519 over `BLAKE3(UTF-8 message)` | Restores joy; care day for streak |
| **Decay** | Lazy on read | None (derived) | Hunger −25/day since feed; joy −20/day since care |
| **Status** | Lazy on read | Derived | bouncy → peckish → scruffy (≥2d) → stray (≥4d) |
| **Pasture browse** | Public GET | None | Paginated gallery (24/page) |

There is **no death, trade, naming, inventory, XP, multiplayer presence, or 3D world**.

---

## Existing pet systems

- **Identity:** one pet per wallet (`pets.owner` PK); hatch tx unique.
- **Appearance:** 10 species (`SPECIES`), hue/accent/spots/antenna from seed; SVG only.
- **Needs:** hunger + happiness only.
- **Care:** event-sourced (`events`); streaks = consecutive UTC calendar days with any care.
- **No personality, growth stages, skills, memory, housing, or avatars.**

---

## Database schema (D1 / SQLite)

```
challenges(id PK, owner, action∈{hatch,feed,checkin}, message, amount,
           created_at, expires_at, min_height)
pets(owner PK, hatch_tx UNIQUE, created_at)
events(id PK → challenges, owner → pets, action, tx_hash UNIQUE,
       created_at, day, UNIQUE(owner,action,day))
```

Indexes: challenge expiry/owner; events by owner+time; pets by recency.

**Design strengths:** atomic hatch+event batch; unique day/action; challenge id = event id (idempotent confirm); lazy cleanup of expired unconfirmed challenges.

---

## Frontend architecture

- Vanilla TypeScript SPA, no React/Three.js.
- Single HTML string mount in `#app`; imperative DOM updates.
- Wallet: `@boing-network/boing-sdk` 0.5.40; pending tx recovery via `localStorage`.
- Accessibility: meters, live region, reduced-motion CSS, semantic sections.
- Visual: Comfortaa + navy/blue Boing brand; generated SVG pets.

---

## Backend architecture

- Single Worker `fetch` handler; static assets via `ASSETS` binding when deployed.
- Challenge/confirm state machine; RPC capped (4 MiB, 15s timeout).
- No sessions, cookies, JWTs, or cron triggers.
- Trust: centralized care index backed by real testnet txs — **not** on-chain NFT custody.

---

## Technical debt report

| Item | Severity | Notes |
|------|----------|-------|
| Monolithic `main.ts` HTML string | Medium | Hard to extend UI; blocks componentization |
| Shared `core.ts` + dual tsconfigs | Low | Intentional; keep for domain purity |
| Placeholder D1 / no deploy path | Medium | Blocks shared pasture; by design for now |
| No rate limiting at edge | High (prod) | Documented; wallet throttle ≠ IP abuse protection |
| Pasture N+1 enrich queries | Medium | 24 pets × events query per page |
| Action CHECK enum in SQL | Medium | Extending care verbs needs careful migrations |
| No profile/inventory tables | Expected | Blocks economy/housing until Phase 1+ |
| Dark navy UI only | Low | Fine for brand; 3D worlds need art direction system |
| Test RPC probe flaky historically | Low | CI mocks RPC; smoke script is optional |

---

## Scalability concerns

- **D1 single-region SQLite:** fine for thousands of pets; not for millions of concurrent writers without sharding / Postgres.
- **Pasture enrichment:** O(page × events) — needs denormalized snapshot or capped recent-events query before growth.
- **No realtime layer:** multiplayer hubs need Durable Objects / Socket.io / separate realtime service.
- **Asset model:** SVG-only scales; 3D GLBs need CDN + LOD streaming (R2/S3).
- **Worker CPU limits:** AI pet memory / pathfinding cannot run unbounded on request path — queue or DO actors later.
- **One pet/wallet:** Sybil is cheap (many wallets); economy needs sinks + reputation before trade.

---

## Security concerns

| Risk | Status |
|------|--------|
| Client-trusted “success” flags | Mitigated — server verifies receipt+block |
| Signature replay | Mitigated — nonce/expiry/origin/chain in message |
| Double care / double hatch | Mitigated — UNIQUE constraints + batch |
| XSS via pet names | N/A — no UGC names yet |
| Origin spoofing | Partial — checks `Origin` header; needs CDN/WAF in prod |
| RPC malice | Accepted trust boundary (documented) |
| Challenge spam | Soft per-wallet 6/min; needs edge rate limits |
| Economy exploits | N/A until currency/trade |
| Pay-to-win | Intentionally avoided; keep that doctrine |

---

## Performance bottlenecks

1. Per-pet full event history on every enrich.
2. Gallery sort + offset pagination (deep offsets degrade).
3. Synchronous SVG string build (cheap today; 3D will dominate).
4. No CDN caching strategy for public pasture reads (`Cache-Control: no-store`).
5. Mobile 60→30 FPS targets irrelevant until WebGL exists.

---

## What to preserve (non-negotiable)

1. Event-sourced care + lazy decay (no cron dependency for core status).
2. Challenge → proof → confirm state machine.
3. Deterministic generative traits from wallet + hatch tx.
4. One permanent buddy per wallet (until multi-pet is explicitly designed).
5. No permanent pet deletion / death.
6. Testnet-only economics until product approval.
7. Shared pure domain module between client and server.

## What to evolve (incrementally)

1. Needs → full vitals + personality + growth.
2. Care verbs → play/groom (+ later activities).
3. Soft currency + achievements (still event-backed).
4. Frontend → componentized React only when 3D/world UI demands it.
5. D1 → Postgres when multiplayer + marketplace require it.
6. Worker → NestJS **only** if ops/team needs justify dual runtime — prefer Workers + Durable Objects first for Boing-native deploy.

---

## Recommended stack migration stance

| Layer | Now | Phase 1–2 | Phase 3–6 |
|-------|-----|-----------|-----------|
| Frontend | Vite + TS | Keep; optional React islands | Next.js + R3F when world ships |
| 3D | None | Prototype R3F scene in Vite | Full zones + LOD |
| API | Workers | Extend Workers | Workers + DO realtime; Nest only if needed |
| DB | D1 | Additive migrations | Postgres for economy/social; D1 or KV for edge cache |
| Realtime | None | Presence stub | Socket/DO rooms |
| Storage | None | R2 for GLB later | S3-compatible CDN |
| Deploy | Local | Approved preview Worker | Vercel (web) + CF (edge/API) |

**Do not rewrite to NestJS/Postgres/Next.js in Phase 1.** Preserve working hatch/feed/hello; add columns/tables and domain logic first.
