# Living Pets (boing.pets)

Living Pets is a deterministic creature-life simulation. Creatures in a small
world of territories eat, drink, rest, socialize, court, raise young, migrate,
remember, and die on their own. The player does not control them. The player
watches, inspects, and nudges the world through five rate-limited _influences_
(naming, favoring a bloodline, enriching or calming a territory).

The v1 world has seven territories (Meadow, Thicket, Ridge, Moonlit Glade,
Glowfen, Elder Grove, High Crags) and seven species, each with a procedural 3D
model: Fire Fox, Moss Stag, Lantern Moth, Glow Tortoise, Moon Hare, Crag Ram,
and Thistle Hog. The species table lives in
`packages/contract/src/species.ts`; see
[`docs/DESIGN.md`](docs/DESIGN.md#world-and-species) for biology and the map.

This repo replaced the earlier Boing Pets pasture game in November 2026
(`b116e6a` "Remove the pasture app and leave the M1 skeleton."). The design and
milestone history are in [`docs/DESIGN.md`](docs/DESIGN.md).

## Monorepo layout

npm workspaces, declared in the root `package.json`:

| Path                | Package                | What it is                                                                                                                                         |
| ------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/contract` | `@boing-pets/contract` | Shared enums, DTOs, `Ruleset` shape, and the host/client IPC message types (`src/ipc.ts`). No runtime deps.                                        |
| `packages/sim`      | `@boing-pets/sim`      | Pure, deterministic kernel: `step()`, worldgen, utility AI, needs, death, genetics, memories, relationships, catch-up loop. No I/O, no wall clock. |
| `packages/db`       | `@boing-pets/db`       | Prisma schema and migrations (`prisma/`), row mappers, family/lineage SQL, `CURRENT_SCHEMA_VERSION`.                                               |
| `apps/sim-host`     | `@boing-pets/sim-host` | The single-writer host: session boot, live clock, offline catch-up, influence gate, persistence repos, Boing mint edge, multiplayer seam.          |
| `apps/client`       | `@boing-pets/client`   | Vite + React 19 + react-three-fiber + Zustand renderer. Talks to a host only through contract IPC.                                                 |
| `apps/desktop`      | `@boing-pets/desktop`  | Electron 45 shell. Main process = sim host, backed by an embedded local Postgres.                                                                  |

Other top-level files: `eslint.config.js` (includes package-boundary and
determinism rules), `vercel.json`, `.github/workflows/ci.yml`.

## Prerequisites

- Node `>=22.12` (root `package.json` `engines`). CI uses Node 24.
- npm with workspaces. No npm version is pinned.
- **npm 11 install scripts:** npm 11 holds back install scripts until you
  approve them. On a fresh `npm ci` it reports pending scripts for
  `@embedded-postgres/<platform>`, `prisma`, `@prisma/client`,
  `@prisma/engines`, and `esbuild`. Review them with
  `npm approve-scripts --allow-scripts-pending`, or approve one at a time with
  `npm approve-scripts <pkg>`. (`npm run db:generate` still generates the
  Prisma client explicitly.)

## Install

```sh
npm ci
npm run db:generate   # Prisma client, needed before typecheck/tests
```

## Run

### Web client (browser host, no database)

```sh
npm run dev -w @boing-pets/client     # Vite on http://127.0.0.1:5173
```

Without an Electron bridge, `apps/client/src/main.tsx` starts the sim host in a
Web Worker (`apps/client/host-worker.ts` →
`apps/sim-host/src/browser/host-worker.ts`). It runs world seed `1` at time
scale `64×` and persists to IndexedDB (`BrowserWorldRepository`), so the world
survives refresh.

### Desktop (Electron + local Postgres)

```sh
npm run desktop:start   # client:build → desktop:build → electron .
```

`apps/desktop/src/main.ts` starts an embedded Postgres under Electron
`userData/living-pets/postgres`, runs `prisma migrate deploy`, boots the host,
and loads `apps/client/dist/index.html`. Set `LIVING_PETS_DEV_URL` to load a
running Vite dev server instead. The main process resolves the repo root from
its own path, so it expects to run from a repo checkout. No packaged installer
is configured.

> On Windows this currently fails at the migrate step. See
> [Known issues](#known-issues).

### Sim host

`@boing-pets/sim-host` is a library embedded by the desktop main process
(`createHostRuntime`), the browser worker, and the shared-world server below.

### Multiplayer (shared world)

`npm run mp:serve` starts one authoritative world behind a WebSocket server.
Every client sees the same creatures, positions and clock.

```bash
# terminal 1: the shared world (binds 127.0.0.1:8787, saves to .living-pets-mp/)
npm run mp:serve
# terminal 2: the client
npm run dev -w @boing-pets/client
```

The server prints two links:

- **player:** `http://127.0.0.1:5173/?mp=ws://127.0.0.1:8787`. Open it in as
  many tabs, browsers or machines as you like. Add `&name=Ada` to set a
  display name.
- **owner:** the same link plus `&owner=<key>`. Only the owner can pause or
  change the time scale; players see the buttons disabled. The client removes
  the key from the address bar after it joins.

Each browser keeps a signed session token in `localStorage`, so a reload or a
dropped connection rejoins as the same account (and the same role). The chip
next to the clock shows `Shared · Owner|Player · name`, or `reconnecting…`.

**Sign in with Boing.** Next to the chip, _Sign in with Boing_ connects Boing
Express (the extension, or the boing.express web wallet when the extension is
missing), asks it to sign a one-time sign-in message (no transaction, no fee),
and rejoins as that wallet; _Sign out_ goes back to a new guest. Guests can
keep playing without a wallet. Wallets in `LIVING_PETS_MP_OWNER_WALLETS` join
as owner; the owner key keeps working as a fallback.

**Other players** appear in the world as a floating marker with their name at
the point their camera is looking at (violet owner, gold wallet, blue guest).

Useful flags (or env vars): `--host`/`LIVING_PETS_MP_HOST`,
`--port`/`LIVING_PETS_MP_PORT`, `--data`/`LIVING_PETS_MP_DATA`,
`--seed`/`LIVING_PETS_MP_SEED`, `--scale`/`LIVING_PETS_MP_SCALE` (new worlds,
default 64×). Set `DATABASE_URL` to store the world in Postgres (run
`prisma migrate deploy` first) instead of the JSON file. To play across a LAN,
bind `--host 0.0.0.0` and open `?mp=ws://<your-ip>:8787` on the other machine;
the server warns, because traffic is unencrypted `ws://`. A built client can
default to a server with `VITE_LIVING_PETS_MP_URL`; `?mp=off` (or `local`,
`none`, `0`, `false`) then forces the single-player world for that visit.

Vercel hosts only the static client, so a Vercel deployment cannot run the
shared-world server. Production and previews default to the Fly.io server
below; point one at your own server with `?mp=wss://…` (browsers block
`ws://` from an `https://` page).

## Hosting on Fly.io

The shared-world server runs as one always-on Fly.io machine
(`fly.toml`, app `boing-living-pets`, region `iad`) with a small
self-managed Fly Postgres for the world. Vercel keeps hosting the client.

**What runs where**

| Piece                 | Fly resource                                                                  | Size                                 | Est. cost |
| --------------------- | ----------------------------------------------------------------------------- | ------------------------------------ | --------- |
| Server (`Dockerfile`) | Machine, always on (`auto_stop_machines = "off"`, `min_machines_running = 1`) | `shared-cpu-1x`, 512 MB              | ~$3.70/mo |
| World database        | Fly Postgres (unmanaged), single node, development config                     | `shared-cpu-1x`, 256 MB, 1 GB volume | ~$2/mo    |

About $6/month, plus outbound bandwidth beyond the free allowance. Exactly one
server machine must run: two would both write the same world. Deploy with
`--ha=false` (the npm script does) and keep `strategy = "rolling"`.

**First-time setup** (once; needs `fly auth login`):

```bash
fly apps create boing-living-pets
fly postgres create --name boing-living-pets-db --region iad \
  --initial-cluster-size 1 --vm-size shared-cpu-1x --vm-memory 256 --volume-size 1
fly postgres attach boing-living-pets-db -a boing-living-pets   # sets DATABASE_URL
```

Then generate and set the two secrets without printing them. The script
saves the owner key to `%USERPROFILE%\.boing\living-pets-owner.key` (outside
the repo, readable only by you) and pipes both values into
`fly secrets import`:

```powershell
pwsh deploy/fly/set-secrets.ps1 -Stage   # -Stage: applied on the next deploy
```

Secrets the server requires in production (it exits at boot if any is
missing):

- `LIVING_PETS_MP_OWNER_KEY`: owner key (≥24 chars). Keep a copy outside the
  repo; the owner link is `https://boing-pets.vercel.app/?owner=<key>`.
- `LIVING_PETS_MP_SECRET`: HMAC key for session tokens (≥32 chars). Rotating
  it signs everyone out (they rejoin as new guests).
- `DATABASE_URL`: set by `fly postgres attach`.

**Deploy, status, logs**

```bash
npm run fly:deploy    # fly deploy --ha=false; the release_command runs prisma migrate deploy
npm run fly:status
npm run fly:logs
curl https://boing-living-pets.fly.dev/healthz
```

`SIGTERM` (deploys, restarts) closes sockets with code 1012 so clients
reconnect, then saves the world before exit (`kill_timeout = 30s`).

**Connecting the Vercel site**

The Vercel project sets `VITE_LIVING_PETS_MP_URL=wss://boing-living-pets.fly.dev`
for Production and Preview, so https://boing-pets.vercel.app and every preview
join the shared world with no query parameter. Add `?owner=<key>` for the
owner controls, `?mp=off` for the single-player world, or `?mp=wss://…` for
another server. The variable is read at build time: after changing it,
redeploy. The server accepts WebSocket upgrades only from origins in
`LIVING_PETS_MP_ALLOWED_ORIGINS` (`fly.toml`): this project's previews
(`https://boing-pets-*-nico-builds.vercel.app`), `https://boing-pets.vercel.app`
and localhost. Clients without an `Origin` header (scripts) are allowed; tokens
and rate limits still apply.

**Run the production image locally**

```bash
docker build -t boing-living-pets .
docker run --rm -p 8080:8080 -e LIVING_PETS_MP_HOST=0.0.0.0 \
  -e DATABASE_URL=... -e LIVING_PETS_MP_OWNER_KEY=... -e LIVING_PETS_MP_SECRET=... \
  -e LIVING_PETS_MP_ALLOWED_ORIGINS=http://localhost:* boing-living-pets
```

## Environment variables

Names only. Never commit values.

| Variable                                                         | Read by                                      | Purpose                                                                                                                                                   |
| ---------------------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LIVING_PETS_BOING_MINTING`                                      | `apps/sim-host/src/boing/config.ts`          | `1`/`true`/`yes`/`on` enables the Boing mint edge (creature NFTs at birth; item/keepsake rewards to wallet players' own wallets). **Off by default.**     |
| `BOING_RPC_URL`                                                  | same                                         | RPC endpoint. Defaults to `https://testnet-rpc.boing.network/`. Chain id is fixed to testnet.                                                             |
| `BOING_SECRET_HEX`                                               | same                                         | 32-byte Ed25519 seed (0x-hex) that signs mint transactions. Needed only when minting.                                                                     |
| `LIVING_PETS_BOING_NFT_COLLECTION_HEX`                           | same                                         | Pre-deployed creature NFT collection AccountId.                                                                                                           |
| `LIVING_PETS_BOING_ARTIFACT_COLLECTION_HEX`                      | same                                         | Lineage-artifact NFT collection (falls back to the creature collection).                                                                                  |
| `LIVING_PETS_BOING_ITEM_COLLECTION_HEX`                          | same                                         | Multi-token collection for compressed items.                                                                                                              |
| `LIVING_PETS_BOING_NFT_RECIPIENT_HEX`                            | same                                         | Mint recipient. If unset, mints go to the address derived from `BOING_SECRET_HEX`.                                                                        |
| `LIVING_PETS_BOING_{NFT,ARTIFACT,ITEM}_COLLECTION_{NAME,SYMBOL}` | same                                         | Collection labels. Defaults: `Living Pets Creatures`/`LPET`, `…Lineage Artifacts`/`LPAR`, `…Items`/`LPIT`.                                                |
| `LIVING_PETS_PG_PORT`                                            | `apps/desktop/src/main.ts`, smoke scripts    | Embedded Postgres port. Default `55432` (app), `55433` (cold-boot smoke).                                                                                 |
| `LIVING_PETS_SMOKE_DATABASE_URL`                                 | `apps/desktop/scripts/smoke-cold-boot.mjs`   | Run the cold-boot smoke against this empty database instead of embedded Postgres (used by the Windows CI job).                                            |
| `LIVING_PETS_SEED`                                               | `apps/desktop/src/main.ts`                   | World seed for a new desktop world. Default `1`.                                                                                                          |
| `LIVING_PETS_DEV_URL`                                            | `apps/desktop/src/main.ts`                   | Load this URL in the Electron window instead of the built client.                                                                                         |
| `DATABASE_URL`                                                   | Prisma, `packages/db/scripts/check-sql.mjs`  | Set by the desktop main and smoke scripts after Postgres starts.                                                                                          |
| `LIVING_PETS_MP_HOST`, `_PORT`, `_DATA`, `_SEED`, `_SCALE`       | `apps/sim-host/src/multiplayer/serve.ts`     | Shared-world server bind address (default `127.0.0.1`), port (`8787`), data dir, new-world seed and scale.                                                |
| `LIVING_PETS_MP_OWNER_KEY`                                       | same                                         | Owner key (pause/rescale). Generated and printed when unset.                                                                                              |
| `LIVING_PETS_MP_SECRET`                                          | same                                         | HMAC key for session tokens. When unset, a random key is saved to `<data>/session-secret` (mode 0600).                                                    |
| `LIVING_PETS_MP_OWNER_WALLETS`                                   | same                                         | Comma-separated Boing account ids (`0x` + 64 hex) that join as owner after wallet sign-in. Not secret.                                                    |
| `LIVING_PETS_MP_CHAIN_ID`                                        | same                                         | Chain id bound into sign-in messages. Default `6913` (Boing testnet).                                                                                     |
| `PORT`                                                           | same                                         | Port when `--port`/`LIVING_PETS_MP_PORT` are unset (Fly sets `8080` in `fly.toml`).                                                                       |
| `LIVING_PETS_MP_ALLOWED_ORIGINS`                                 | same                                         | Comma-separated browser origins allowed to open the WebSocket (`*` = one run of letters, digits, dashes). Localhost is always allowed outside production. |
| `NODE_ENV`                                                       | same                                         | `production` requires the owner key, session secret, `DATABASE_URL` and an origin list from the environment.                                              |
| `VITE_LIVING_PETS_MP_URL`                                        | `apps/client/src/main.tsx` (build time)      | Default shared-world URL for a built client. `?mp=wss://…` overrides it; `?mp=off` forces single-player.                                                  |
| `SCALE_REHEARSAL`                                                | `apps/sim-host/test/scale-rehearsal.test.ts` | `1` runs the 5,000-creature rehearsal test (skipped otherwise).                                                                                           |

The browser worker reads mint config from `process.env` only if it exists, so
minting is always off in the web build.

## Testing and verification

| Command                       | What it does                                                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `npm run verify`              | Everything CI runs, in order (below).                                                                               |
| `npm run format:check`        | Prettier.                                                                                                           |
| `npm run lint`                | ESLint across all workspaces, `--max-warnings 0`.                                                                   |
| `npm run db:generate`         | Prisma client.                                                                                                      |
| `npm run typecheck`           | `tsc --noEmit` for every package and test tsconfig.                                                                 |
| `npm test`                    | `node --test` (via `tsx`) over `packages/sim`, `packages/db`, `apps/sim-host`, `apps/client`, `apps/desktop` tests. |
| `npm run client:build`        | Vite build to `apps/client/dist`.                                                                                   |
| `npm run client:check-bundle` | Fails if `DATABASE_URL`/`@prisma/client` appear in the dist, or sim/db code leaks into the renderer.                |
| `npm run desktop:build`       | esbuild of the Electron main and preload.                                                                           |
| `npm run desktop:smoke`       | Headless cold boot: Postgres → migrate → boot → reload persisted world. No window.                                  |
| `npm run db:validate`         | `prisma validate`.                                                                                                  |
| `npm run db:check`            | Applies migrations to `DATABASE_URL` and runs SQL checks.                                                           |
| `npm run scale-rehearsal`     | Runs the M17 rehearsal and writes `apps/sim-host/test/fixtures/scale-rehearsal-results.json`.                       |

## Deployment

- **Web:** Vercel builds the client only (`vercel.json`: `npm install`,
  `npm run client:build`, output `apps/client/dist`). The deployed site runs
  the browser-worker host with IndexedDB storage. There is no server.
- **Desktop:** run from source (`npm run desktop:start`). There is no
  installer or auto-update.
- **CI:** `.github/workflows/ci.yml` runs `npm ci` and `npm run verify` on
  `ubuntu-24.04`, plus typecheck, tests, the desktop build and the cold-boot
  smoke on `windows-latest`, for pushes to `main` and for PRs.
- **Shared world:** `npm run mp:serve` on any Node 24 machine. Put it behind a
  TLS proxy (`wss://`) before exposing it beyond your machine or LAN.

## Known issues

- **Prisma 6 audit findings.** `npm audit` reports high-severity advisories
  through `prisma@6.19.3` → `@prisma/config` (`effect`, `deepmerge-ts`). The
  fix needs Prisma 7 (a major upgrade). There are also moderate
  `typescript-eslint`/`minimatch` advisories.
- **Shared-world identity is a signed guest token, not a login.** Anyone who
  can reach the server can join as a new guest; per-account influence limits
  follow the token, so clearing storage gets a fresh allowance. The owner key
  is a shared secret in a URL. Wallet-signature login is a follow-up.
- **Shared-world bandwidth.** Needs drift every tick, so each live patch
  carries every creature row (tens of KB per tick, ~1 tick/s at 64×). A client
  that falls more than 4 MB behind is skipped and then sent a fresh snapshot.
- **Embedded Postgres is a beta build** (`embedded-postgres` `18.6.0-beta.19`).
  The Electron window uses `sandbox: false` (with `contextIsolation: true` and
  `nodeIntegration: false`).
- The client build emits a ~1.38 MB main chunk and ships source maps
  (`apps/client/vite.config.ts` `sourcemap: true`).

## Design

See [`docs/DESIGN.md`](docs/DESIGN.md).

## License

No `LICENSE` file is currently tracked in this repo.
