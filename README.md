# Living Pets (boing.pets)

Living Pets is a deterministic creature-life simulation. Creatures in a small
world of territories eat, drink, rest, socialize, court, raise young, migrate,
remember, and die on their own. The player does not control them. The player
watches, inspects, and nudges the world through five rate-limited _influences_
(naming, favoring a bloodline, enriching or calming a territory).

The world has seven territories (Meadow, Thicket, Ridge, Moonlit Glade,
Glowfen, Elder Grove, High Crags) and 35 species, five per territory, each
starting from two founders (one female, one male): Fire Fox, Barrow Badger,
Field Nightjar, Clover Vole and Amber Kestrel (Meadow); Moss Stag, Shade
Lynx, Dusk Raccoon, Thorn Porcupine and Briar Weasel (Thicket); Lantern Moth,
Slate Marmot, Gloam Bat, Ledge Goat and Mist Swift (Ridge); Moon Hare, Silver
Deer, Dew Shrew, Opal Dormouse and Hush Owl (Moonlit Glade); Glow Tortoise,
Reed Heron, Ember Newt, Lumen Frog and Reed Muskrat (Glowfen); Thistle Hog,
Hollow Squirrel, Ash Wolf, Elder Bear and Acorn Jay (Elder Grove); Crag Ram,
Stone Pika, Crag Owl, Rime Cat and Gale Chough (High Crags). Each has its own
diet, needs, habitat and gait. The species table lives in
`packages/contract/src/species.ts`; see
[`docs/DESIGN.md`](docs/DESIGN.md#world-and-species) for biology, balance, the
map, and how new species are introduced into an existing world.

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
npm run dev -w @boing-pets/client     # Vite: http://127.0.0.1:5173/world/ (game)
```

Without an Electron bridge, `apps/client/src/main.tsx` starts the sim host in a
Web Worker (`apps/client/host-worker.ts` →
`apps/sim-host/src/browser/host-worker.ts`). It runs world seed `1` at time
scale `64×` and persists to IndexedDB (`BrowserWorldRepository`), so the world
survives refresh.

### Site pages

The site has three pages, each with the same Home · Play · Marketplace nav:

| Path       | Page                                                | Source                                         |
| ---------- | --------------------------------------------------- | ---------------------------------------------- |
| `/`        | Marketing page (static, no 3D)                      | `apps/client/index.html`, `src/welcome/`       |
| `/world/`  | The game (shared world by default; `?mp=off` local) | `apps/client/world/index.html`, `src/main.tsx` |
| `/market/` | Marketplace                                         | `apps/client/market/index.html`, `src/market/` |

Redirects (`vercel.json`, mirrored by an inline script on `/`): `/welcome` →
`/`, `/game` and `/world` → `/world/`, and old game links on `/` with a game
param (`mp`, `owner`, `name`, `debug`, `bestiary`, `pose`) → `/world/` with
the same query, so `/?owner=<key>` still works.

The marketing page shows the world, a species gallery built
from `SPECIES_CATALOG`, how the game works, and Play now links to `/world/`. Its
source is `apps/client/index.html` and `apps/client/src/welcome/`; the
renders live in `apps/client/public/media/` (WebP, about 400 kB in total). A
new species needs a render at `public/media/species/<slug>.webp`, for example
cropped from the dev bestiary (`/world/?bestiary=<slug>`).

### Desktop (Electron + local Postgres)

```sh
npm run desktop:start   # client:build → desktop:build → electron .
```

`apps/desktop/src/main.ts` starts an embedded Postgres under Electron
`userData/living-pets/postgres`, runs `prisma migrate deploy`, boots the host,
and loads `apps/client/dist/world/index.html`. Set `LIVING_PETS_DEV_URL` to load a
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

- **player:** `http://127.0.0.1:5173/world/?mp=ws://127.0.0.1:8787`. Open it in as
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

## Creature rendering

Creatures are procedural: no model or texture files. Each of the 35 species
has its own body built from code (`apps/client/src/view/creatures/anatomy/`).
They share one material, lit by the world's moonlight and fog, have soft
ground contact shadows and breathing, gait and look-at animation. Far away,
each species is drawn as one instanced mesh. To see every species under the
world lighting, open the dev bestiary:

```sh
npm run dev -w @boing-pets/client
# http://127.0.0.1:5173/world/?bestiary        all species
# http://127.0.0.1:5173/world/?bestiary=fire-fox one species, close up
```

See [Creature rendering in the design doc](docs/DESIGN.md#creature-rendering)
for details.

## Marketplace

`/market/` lists every creature, lineage and item NFT with its live status
in the world (activity, territory, health, living lineage members), mint
state, owner and any listing. It reads the shared-world server's read-only
`GET /market/v1/catalog`, which sends CORS headers only to origins in
`LIVING_PETS_MP_ALLOWED_ORIGINS` (requests without an `Origin` are served,
other browser origins get 403). Use `?server=http://127.0.0.1:8787` to point
the page at a local `npm run mp:serve`.

**Ownership rule.** Every NFT is minted to the operator wallet, which holds
it until a player adopts or claims it. Every hand-over (operator to player,
player to player) goes through the escrow contract in
[`contracts/escrow`](contracts/escrow/README.md), one wallet transaction each:

- **List**: one atomic batch `[escrow.prepare, collection.transfer_nft(escrow), escrow.list]`.
- **Buy**: `buy` with exactly the price attached; the escrow sends the NFT to
  the buyer, 2.5% (250 bps, admin-adjustable, capped at 10%) to the operator
  and the rest to the seller.
- **Adopt**: the operator lists at price 0 reserved for the player; the
  player sends `claim`.
- **Cancel**: the seller (or admin) takes the NFT back.

| Variable                   | Where                                | Meaning                                                             |
| -------------------------- | ------------------------------------ | ------------------------------------------------------------------- |
| `LIVING_PETS_OPERATOR_HEX` | `apps/sim-host/src/market/config.ts` | Operator wallet (`0x` + 64 hex). Unset: the catalog is browse-only. |
| `LIVING_PETS_ESCROW_HEX`   | same                                 | Deployed escrow contract. Trading turns on only when both are set.  |
| `BOING_RPC_URL`            | `apps/sim-host/src/boing/config.ts`  | RPC the listing index reads (default public testnet).               |

With the escrow set, the server reads the contract every 30 s (read-only
`boing_simulateContractCall` in JSON-RPC batches: the escrow's `config`, and
`listing` plus the collection's `owner_of` for every minted token), serves
the result at `GET /market/v1/listings` and folds listings and real on-chain
owners into the catalog. The page builds each transaction and Boing Express
signs it; no signing key is read by the marketplace code. The escrow is not
deployed yet: `LIVING_PETS_ESCROW_HEX` stays unset until it is signed off.

### Genesis mint

The founders of the shared world (every creature with no parents, generation 0) are the genesis set. With `LIVING_PETS_BOING_MINTING` and `LIVING_PETS_BOING_GENESIS_MINT` on, the Fly server mints each one into the creature collection on boot, owned by the operator wallet, one transaction at a time, waiting for each receipt. Each `creature_nft_link` row gets `genesis = true` and the mint tx hash, and the token's on-chain metadata hash is the SHA-256 of `{v, game, genesis: true, worldId, creatureId, name, species}`. The run is idempotent: confirmed rows are skipped, a token already owned on chain is recorded without minting again, and failures are retried on the next boot (the regular birth-mint drain leaves genesis rows alone). Collections on testnet 6913:

- creatures (LPET): `0x9aebaf44c0151b58be361aa1b4e4d02dbe9922e6f33c7ef3bdb2fb5832b51701`
- lineage artifacts (LPAR): `0x95cf68bc73ec4d842ba2c5765eccd424aa2d7fe913627fa70efeb321cb2cdcea`

The operator seed is the `BOING_SECRET_HEX` Fly secret (set it from stdin; never commit or log it).

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
  repo; the owner link is `https://boing-pets.vercel.app/world/?owner=<key>`.
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

## Database backups

The shared world's Postgres (`boing-living-pets-db`, self-managed Fly
Postgres) is backed up by a separate, service-less Fly app,
`boing-living-pets-backup` (`deploy/backup/`):

- **nightly-backup** (scheduled machine, `--schedule daily`): `backup.sh`
  opens one `REPEATABLE READ` transaction, records every table's row count in
  it, and runs `pg_dump --format=custom --snapshot=…` from the same snapshot.
  It checks the archive with `pg_restore --list`, uploads
  `pg/boing_living_pets/<UTC stamp>.dump` (sha256 in the object metadata)
  and `<stamp>.counts.tsv` to the private Tigris bucket
  `boing-living-pets-backups`, then deletes dumps older than
  `BACKUP_RETENTION_DAYS` (14), always keeping the newest `BACKUP_KEEP_MIN` (3).
- **weekly-restore-check** (`--schedule weekly`): `restore-check.sh`
  restores the newest dump into a throwaway database (`restore_check_<stamp>`)
  on the same cluster, compares its row counts with the recorded ones, logs
  `RESTORE CHECK PASSED`/`FAILED`, and drops the throwaway database. The live
  database is only read.

Fly picks the time of day for `daily`/`weekly` schedules. Secrets on the
backup app: `DATABASE_URL` (from `fly postgres attach … --database-user
boing_backup`) and the Tigris `AWS_*`/`BUCKET_NAME` set by `fly storage create`.

Cost: the machines run for about 10 s a day and are billed for their
146 MB rootfs while stopped (about $0.04/month for both); the dumps (about
60 KB each, 14 kept) sit inside Tigris's free 5 GB. Expect well under
$0.10/month.

```bash
npm run backup:now     # take a backup now (one-off machine, removed after)
npm run backup:check   # restore the newest backup into a throwaway DB and compare
npm run backup:logs    # look for "done key=…" and "RESTORE CHECK PASSED"
npm run backup:image   # rebuild after editing deploy/backup, then point the
                       # scheduled machines at it:
fly machine list -a boing-living-pets-backup
fly machine update <id> --image registry.fly.io/boing-living-pets-backup:latest --skip-start -a boing-living-pets-backup
```

**Restoring for real**

1. Stop writes: `fly scale count 0 -a boing-living-pets` (the server saves on
   `SIGTERM`; skip this only when restoring somewhere else).
2. Pick a key (`latest` also works):
   `fly machine run registry.fly.io/boing-living-pets-backup:latest list-backups.sh -a boing-living-pets-backup --restart no --rm`,
   then `npm run backup:logs`.
3. Restore into a fresh, empty database on the cluster (safest), then point
   the app at it:
   ```bash
   fly postgres connect -a boing-living-pets-db   # create database boing_living_pets_restored;
   fly machine run registry.fly.io/boing-living-pets-backup:latest restore.sh <key|latest> \
     --env TARGET_DB_NAME=boing_living_pets_restored \
     -a boing-living-pets-backup --restart no --rm
   npm run backup:logs                            # "restored <key>"
   ```
   Then point the app at it: in `fly postgres connect`, rename the databases
   (`alter database boing_living_pets rename to boing_living_pets_old;
alter database boing_living_pets_restored rename to boing_living_pets;`),
   so no secret changes. `restore.sh` checks the sha256 first and restores in
   one transaction. It refuses to target the live database unless
   `RESTORE_INTO_LIVE=yes` (with `RESTORE_CLEAN=1` to drop objects first).
4. `fly scale count 1 -a boing-living-pets`, then check
   `curl https://boing-living-pets.fly.dev/healthz`.

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
| `LIVING_PETS_ITEM_REWARD_AUTOMINT`                               | `apps/sim-host/src/multiplayer/serve.ts`     | `1` mints item rewards to the wallet at once. Default: rewards stay off chain until the keeper mints them from the marketplace.                           |
| `LIVING_PETS_ITEM_MINT_FEE`                                      | `apps/sim-host/src/market/mint-payment.ts`   | Player fee per mint-on-demand request, in BOING, paid to `LIVING_PETS_OPERATOR_HEX` and verified on chain. Default `0.0005`.                              |
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

- **Shared-world identity is a signed guest token, not a login.** Anyone who
  can reach the server can join as a new guest; per-account influence limits
  follow the token, so clearing storage gets a fresh allowance. The owner key
  is a shared secret in a URL. Wallet-signature login is a follow-up.
- **Shared-world bandwidth.** Needs drift every tick, so each live patch
  still touches every creature, but only its changed fields (about 6 KB per
  tick for 28 creatures, plus a full snapshot keyframe every 60 ticks). A
  client that falls more than 4 MB behind is skipped and then sent a fresh
  snapshot.
- **Embedded Postgres is a beta build** (`embedded-postgres` `18.6.0-beta.19`).
  The Electron window uses `sandbox: false` (with `contextIsolation: true` and
  `nodeIntegration: false`).
- **Prisma 7 uses a root `effect` override.** `prisma@7.10.1` pins
  `effect@3.20.0` (GHSA-7589-6fvf-x4pw); the root and `deploy/fly`
  `package.json` override it to `^3.22.1`. Drop the override once Prisma ships
  a fixed pin.
- The client build splits `react`, `r3f`, `three` and the lazy `WorldCanvas`
  into separate chunks; only `index` + `react` (~246 kB, ~78 kB gzip) load
  before the HUD paints. Source maps are built `hidden` and moved to
  `apps/client/sourcemaps/` (git-ignored), so they are not served.

## Design

See [`docs/DESIGN.md`](docs/DESIGN.md).

## License

No `LICENSE` file is currently tracked in this repo.
