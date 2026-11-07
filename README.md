# Boing Pets

**A little bounce. A buddy for life.** A small, Boing-native virtual pet game: hatch a creature, say hello, feed it, and meet everyone on the public pasture.

Testnet only (6913). This is an MVP, not an NFT marketplace, financial product, or airdrop promise. No contracts, consensus changes, custody keys, or scheduled jobs. The public site is https://boing-pets.vercel.app. Pushing does not publish a new Vercel deployment until the GitHub project is connected.

## Run locally

Requires Node 24 LTS and npm. In this directory:

```sh
npm ci
npm run build
npm run db:local
npm run dev:api
```

Leave the API running. In another terminal:

```sh
npm run dev
```

Open **http://localhost:5177** (use this exact origin, not 127.0.0.1). Vite proxies `/api` to the local Worker on port 8787. Wrangler uses a **local** D1 database in `.wrangler/state`; no Cloudflare login, project, paid resource, or secrets are needed. Keep that directory to preserve your local pasture. A different local checkout has a different pasture.

`npm run verify` runs lint, strict TypeScript, production build, and core/proof tests. `npm run smoke:rpc` performs read-only testnet metadata and block/receipt checks. RPC outages do not break deterministic CI.

## Play

1. Open/unlock Boing Express and choose **Boing testnet 6913**. Get testnet BOING from https://boing.network/faucet.
2. Connect Express. The injected `window.boing` provider is preferred; the SDK's official **boing.express popup wallet** is the fallback. Allow popups. Keys never enter Pets.
3. **Hatch**: approve a tiny native self-transfer. After inclusion, confirm the pending transaction if needed. One permanent buddy per wallet; ten SVG species, colors, spots, and traits derive from the normalized wallet + hatch transaction hash.
4. **Daily hello** signs a server-generated, origin/account/chain/action/nonce/expiry-bound message. The server verifies Ed25519 over BLAKE3(UTF-8 message), matching current Express. No transaction fee.
5. **Feed** approves another tiny self-transfer and restores the belly. Feeding is capped at once per UTC day to prevent accidental repeat fees. Each action type is once/day; either care action counts for the streak, never twice on the same day.
6. The public pasture shows buddies, streaks, belly, joy and status. Yours is highlighted. Browse without connecting. Use Refresh to recompute time-dependent state.

Belly loses 25 points/day since hatch or last feed; joy loses 20/day since any care. After two days without feeding, a buddy is scruffy; after four, a stray. A hello cheers up a stray but only a feed restores its belly. No permanent death or deletion. Streaks count consecutive UTC calendar days; yesterday's streak remains visible until today is missed. This is a calendar-day ritual, not a rolling 24-hour timer.

## How it actually works

- **Frontend:** lightweight Vite + strict TypeScript, no framework/3D engine/heavy assets. Navy/blue and rounded typography match the Boing ecosystem. Responsive accessible controls, reduced-motion support, generated SVGs only.
- **Wallet:** published `@boing-network/boing-sdk` **0.5.40**, native `boing_requestAccounts`, `boing_sendTransaction`, `boing_signMessage`; 32-byte Ed25519 account ids, not EVM addresses. Extension account/chain changes disconnect; chain is checked before actions. The web fallback is pinned to testnet.
- **On-chain hatch/feed:** Boing's native Transfer payload has **no memo field**. Rather than invent an unsupported memo or deploy a new program, v1 uses an exact challenge-specific self-transfer of approximately **0.001 BOING** (less than 0.001001). The amount encodes a random per-action marker; Express displays the human-readable intent, which is **UI-only, not a signed memo**. Principal stays in the same wallet; only the network fee is spent. Users still need balance for amount plus fee. There is no treasury/sink recipient and no app fee.
- **Verification:** Worker checks the RPC's chain id, successful receipt, post-challenge block height, exact block receipt/id/index, transaction sender, self-recipient, and exact challenge amount. It does not trust a browser-supplied success flag or arbitrary transaction hash. Failed/unknown transactions never grant care. Pending ids are saved locally so users can retry confirmation without resending. Challenges expire after one hour; confirm within that window. If a transaction failed or its challenge expired, Forget pending record clears only the local recovery record (it does not cancel or refund any transaction).
- **Public state:** unique wallet, transaction, challenge, and `(owner, action, UTC day)` constraints. Hatch and its event commit in one transaction. Event-sourced state avoids lost-update races between feed/check-in. Repeated confirmation is idempotent; a hash cannot hatch/feed twice. Local development still uses the Worker and D1. Vercel uses Neon Postgres.
- **No cron:** status/decay/streaks derive lazily from timestamps on reads. No added Cloudflare trigger. Unconfirmed expired challenges are cleaned on challenge issuance. Confirmed challenge records remain as an audit trail. Gallery is paginated (24 pets/page).
- **Trust model:** Pets is a centralized off-chain care/index service backed by genuine testnet transactions, **not** a fully on-chain pet contract or transferable NFT. The pasture consists of submitted, verified claims; it is not an autonomous chain-wide scanner. No API means no pasture/care writes. The RPC is trusted for canonical inclusion; a malicious RPC or database operator is outside the v1 trust boundary. The Vercel app stores one shared pasture in Neon Postgres. A local Worker checkout keeps its own D1 file. No anti-Sybil guarantee; per-wallet challenge throttling is not a substitute for public edge rate limiting.

## API

- `GET /api/pasture?offset=0` → up to 24 pets, next offset, server time.
- `GET /api/pet?owner=0x...` → one pet or null.
- `POST /api/challenge` `{owner,action}` → one-hour challenge, exact signature message or native transaction request.
- `POST /api/confirm` `{id,signature}` for check-in, or `{id,tx_hash}` for hatch/feed.

Writes require the page's own origin and JSON bodies (4 KiB maximum), signatures or chain proofs. No private keys, sessions, cookies, client secrets, or wallet seed imports. Visitors connect a Boing wallet; the app does not use Cursor sign-in. Challenges are not authentication by themselves. Before a widely shared launch, add edge/IP abuse controls (including for reads and wallet-rotation attacks), audit economics/security, and test retention/backfill behavior.

## Vercel

The public app is a Vite client plus one Node.js function on Vercel Fluid Compute. `api/[...path].ts` serves the same care API. The pasture is Neon Postgres in `iad1`, provisioned by the Vercel Marketplace integration and reached with `@neondatabase/serverless`. `DATABASE_URL_UNPOOLED` is preferred so the driver is not pooled twice. The function migrates on startup. Hunger, joy, and streaks are still derived on read. There is no cron.

`RPC_URL` defaults to `https://testnet-rpc.boing.network` (chain 6913). Leave `APP_ORIGIN` unset so each deployment origin is taken from the request. Visitors connect a Boing wallet. The project is `nico-builds/boing-pets`.

`wrangler.jsonc` remains a local-only Worker configuration: placeholder D1 id, no routes, `workers_dev: false`, preview URLs disabled, and no cron. CI dry-runs that bundle and does not deploy it. Never deploy the placeholder config. To run the Node server on this machine without Neon: `PETS_DB=sqlite npm start` after `npm run build`.

## Planned Passport quests (documentation only)

- **Hatch a Boing Pet:** first successfully verified hatch transaction.
- **Seven-day care streak:** seven consecutive unique UTC care days (hatch/hello/feed), backed by this service's verified event history.

No changes to boing.network Passport or airdrop eligibility are made here. A future authenticated integration must verify provenance and resist replay/Sybil abuse before granting badges.

## Deferred

DEX-swap forage on boing.finance; live finance-indexer integration; Passport wiring; mainnet; naming/trading/transferring pets; NFTs or a dedicated pet VM program; permanent chain-wide indexing/backfill; production hardening/rate limiting. Pet naming is intentionally not user-generated yet, avoiding moderation and HTML injection concerns.

Next projects: [boing.wall](https://github.com/Boing-Network/boing.wall), [boing.kudos](https://github.com/Boing-Network/boing.kudos), [boing.names](https://github.com/Boing-Network/boing.names). Their implementations follow Pets.

## Verification notes

Local lint, separate browser/Worker typechecks, build, deterministic tests, local D1 migration and Worker dry-run are included. API tests use SQLite and in-process Postgres (PGlite) with a mocked testnet RPC; they never send chain transactions. Read-only checks against `https://testnet-rpc.boing.network` returned chain 6913 from this environment. A real Express hatch/feed still needs Nico's testnet wallet. Nothing was sent from a wallet.

Worker binding types are generated from config: run `npm run types:generate` after config changes. Observability is configured for a future approved deployment; production hardening remains deferred.
