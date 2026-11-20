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

`@boing-pets/sim-host` is a library, not a standalone server. It is embedded by
the desktop main process (`createHostRuntime`) and the browser worker. There is
no `npm` script that starts a headless host.

### Multiplayer (host seam only)

`apps/sim-host/src/multiplayer/` exports `createSharedWorldHost` and
`listenSharedWorldWs`: one `HostRuntime` shared by many clients over
WebSocket (`ws`). Nothing in the repo calls them outside
`apps/sim-host/test/multiplayer-host-seam.test.ts`, and the client has no
WebSocket transport yet. Use it from code:

```ts
import {
  createSharedWorldHost,
  listenSharedWorldWs,
} from "@boing-pets/sim-host";
```

## Environment variables

Names only. Never commit values.

| Variable                                                         | Read by                                      | Purpose                                                                                                    |
| ---------------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `LIVING_PETS_BOING_MINTING`                                      | `apps/sim-host/src/boing/config.ts`          | `1`/`true`/`yes`/`on` enables the Boing mint edge. **Off by default.**                                     |
| `BOING_RPC_URL`                                                  | same                                         | RPC endpoint. Defaults to `https://testnet-rpc.boing.network/`. Chain id is fixed to testnet.              |
| `BOING_SECRET_HEX`                                               | same                                         | 32-byte Ed25519 seed (0x-hex) that signs mint transactions. Needed only when minting.                      |
| `LIVING_PETS_BOING_NFT_COLLECTION_HEX`                           | same                                         | Pre-deployed creature NFT collection AccountId.                                                            |
| `LIVING_PETS_BOING_ARTIFACT_COLLECTION_HEX`                      | same                                         | Lineage-artifact NFT collection (falls back to the creature collection).                                   |
| `LIVING_PETS_BOING_ITEM_COLLECTION_HEX`                          | same                                         | Multi-token collection for compressed items.                                                               |
| `LIVING_PETS_BOING_NFT_RECIPIENT_HEX`                            | same                                         | Mint recipient. If unset, mints go to the address derived from `BOING_SECRET_HEX`.                         |
| `LIVING_PETS_BOING_{NFT,ARTIFACT,ITEM}_COLLECTION_{NAME,SYMBOL}` | same                                         | Collection labels. Defaults: `Living Pets Creatures`/`LPET`, `…Lineage Artifacts`/`LPAR`, `…Items`/`LPIT`. |
| `LIVING_PETS_PG_PORT`                                            | `apps/desktop/src/main.ts`, smoke scripts    | Embedded Postgres port. Default `55432` (app), `55433` (cold-boot smoke).                                  |
| `LIVING_PETS_SEED`                                               | `apps/desktop/src/main.ts`                   | World seed for a new desktop world. Default `1`.                                                           |
| `LIVING_PETS_DEV_URL`                                            | `apps/desktop/src/main.ts`                   | Load this URL in the Electron window instead of the built client.                                          |
| `DATABASE_URL`                                                   | Prisma, `packages/db/scripts/check-sql.mjs`  | Set by the desktop main and smoke scripts after Postgres starts.                                           |
| `SCALE_REHEARSAL`                                                | `apps/sim-host/test/scale-rehearsal.test.ts` | `1` runs the 5,000-creature rehearsal test (skipped otherwise).                                            |

The browser worker reads mint config from `process.env` only if it exists, so
minting is always off in the web build.

## Testing and verification

| Command                       | What it does                                                                                         |
| ----------------------------- | ---------------------------------------------------------------------------------------------------- |
| `npm run verify`              | Everything CI runs, in order (below).                                                                |
| `npm run format:check`        | Prettier.                                                                                            |
| `npm run lint`                | ESLint across all workspaces, `--max-warnings 0`.                                                    |
| `npm run db:generate`         | Prisma client.                                                                                       |
| `npm run typecheck`           | `tsc --noEmit` for every package and test tsconfig.                                                  |
| `npm test`                    | `node --test` (via `tsx`) over `packages/sim`, `packages/db`, `apps/sim-host`, `apps/client` tests.  |
| `npm run client:build`        | Vite build to `apps/client/dist`.                                                                    |
| `npm run client:check-bundle` | Fails if `DATABASE_URL`/`@prisma/client` appear in the dist, or sim/db code leaks into the renderer. |
| `npm run desktop:build`       | esbuild of the Electron main and preload.                                                            |
| `npm run desktop:smoke`       | Headless cold boot: Postgres → migrate → boot → reload persisted world. No window.                   |
| `npm run db:validate`         | `prisma validate`.                                                                                   |
| `npm run db:check`            | Applies migrations to `DATABASE_URL` and runs SQL checks.                                            |
| `npm run scale-rehearsal`     | Runs the M17 rehearsal and writes `apps/sim-host/test/fixtures/scale-rehearsal-results.json`.        |

## Deployment

- **Web:** Vercel builds the client only (`vercel.json`: `npm install`,
  `npm run client:build`, output `apps/client/dist`). The deployed site runs
  the browser-worker host with IndexedDB storage. There is no server.
- **Desktop:** run from source (`npm run desktop:start`). There is no
  installer or auto-update.
- **CI:** `.github/workflows/ci.yml` runs `npm ci` and `npm run verify` on
  `ubuntu-24.04` for pushes to `main` and for PRs.

## Known issues

- **Windows desktop migrate fails.** `apps/desktop/src/migrate.ts` calls
  `spawnSync("npx", …)` without `shell: true`. On Windows `npx` is `npx.cmd`,
  so the spawn fails (`status` is `null`) and both `npm run desktop:smoke` and
  `npm run desktop:start` stop with `prisma migrate deploy exited null`.
- **CI is Ubuntu-only**, so the Windows failure above is not caught.
- **Prisma 6 audit findings.** `npm audit` reports high-severity advisories
  through `prisma@6.19.3` → `@prisma/config` (`effect`, `deepmerge-ts`). The
  fix needs Prisma 7 (a major upgrade). There are also moderate
  `typescript-eslint`/`minimatch` advisories.
- **Multiplayer auth is a placeholder.** `apps/sim-host/src/multiplayer/account.ts`
  accepts any id matching `^[a-zA-Z0-9_.:@-]{1,64}$`, and rate limits are per
  account id. `listenSharedWorldWs` binds to `127.0.0.1` by default and sets no
  WebSocket `maxPayload`. Any joined client can send clock commands (pause,
  time scale) for the shared world.
- **Embedded Postgres is a beta build** (`embedded-postgres` `18.6.0-beta.19`).
  The Electron window uses `sandbox: false` (with `contextIsolation: true` and
  `nodeIntegration: false`).
- The client build emits a ~1.38 MB main chunk and ships source maps
  (`apps/client/vite.config.ts` `sourcemap: true`).

## Design

See [`docs/DESIGN.md`](docs/DESIGN.md).

## License

No `LICENSE` file is currently tracked in this repo.
