# Living Pets — Design

This document describes what the code on `main` (`76cbef0`, M22) actually does.
Items marked **planned** come from comments or commit messages, not running
features. Numbers come from `packages/sim/src/ruleset.ts` (`RULESET_V1`) unless
noted.

## Vision and pillars

1. **Creatures live on their own.** Every creature picks its own goals each
   time its action slot frees up. Nothing in the client writes needs, genes, or
   location (`apps/sim-host/src/influence.ts` header).
2. **The player influences, not controls.** Five verbs, three accepted per
   rolling 24 hours, applied by the kernel on the next tick.
3. **Time keeps passing.** Closing the game is not a pause. On the next launch
   the host replays the owed ticks with the same `step()` (offline catch-up).
4. **Deterministic and replayable.** The kernel is pure: no `Date.now`, no
   `Math.random` (enforced in `eslint.config.js`). Randomness is a pure function
   of `(seed, tick, domain, subject, salt)` (`packages/sim/src/rng.ts`).
5. **Chain at the edge.** Boing NFT minting happens only in the host after a
   durable commit, never inside `step()`, and is off by default.

## Architecture

```mermaid
flowchart LR
  subgraph Client["apps/client (React + R3F + Zustand)"]
    UI["HUD: ClockControls, InfluencePanel, InspectionPanel"]
    View["WorldCanvas: terrain, flora, creature tokens"]
    Store["worldViewStore"]
  end
  subgraph Contract["packages/contract"]
    IPC["ClientToHost / HostToClient / QueryResult"]
  end
  subgraph Host["apps/sim-host (single writer)"]
    RT["HostRuntime: clock, catch-up, influence gate"]
    Sess["HostSession + dirty set"]
    Mint["Mint edge: Boing NFT client"]
    MP["SharedWorldHost + ws server (M22)"]
  end
  subgraph Kernel["packages/sim (pure)"]
    Step["step(): influences, territories, creatures, births, decay"]
  end
  subgraph Persist["Persistence"]
    PG[("Postgres via Prisma (packages/db)")]
    IDB[("IndexedDB (BrowserWorldRepository)")]
  end
  Chain[("Boing testnet")]

  UI -- "commands / queries" --> IPC
  IPC --> RT
  RT -- "snapshot / patch / clock / catchup" --> Store
  Store --> View
  RT --> Sess --> Step
  Sess -- "commit (desktop)" --> PG
  Sess -- "commit (browser)" --> IDB
  Sess -- "after BIRTH commit" --> Mint --> Chain
  MP --> RT
```

Transports for the same contract:

- **Electron:** `ipcMain` channels in `apps/desktop/src/ipc-channels.ts`, with
  the preload bridge `apps/desktop/src/preload.ts` and the client side in
  `apps/client/src/api/electron-ipc.ts`.
- **Browser:** a dedicated Web Worker
  (`apps/sim-host/src/browser/host-worker.ts`) over `postMessage`, client side
  `apps/client/src/api/browser-host-ipc.ts`.
- **In-memory:** `apps/client/src/api/memory-ipc.ts`, used by client tests.
- **WebSocket:** `apps/sim-host/src/multiplayer/ws-server.ts` (no client yet).

Package boundaries are lint-enforced. The renderer may import only
`@boing-pets/contract`, and `npm run client:check-bundle` confirms that sim and
db code end up only in the host-worker chunk.

## Core loop (as implemented)

1. Boot: load the world from the repository, or `createWorld(seed)` and persist
   it (`apps/sim-host/src/session.ts` `bootSession`).
2. Catch-up: if wall time is ahead of `world.clockAtMs`, run the owed ticks and
   emit a `CatchupReport` (`apps/sim-host/src/catchup.ts`).
3. Live: the clock accumulates wall time × scale and steps one tick per
   `msPerTick`. It commits every 10 ticks or 30 s of wall time
   (`apps/sim-host/src/clock.ts`).
4. The client renders snapshots and patches. The player inspects a creature
   (`query.creature`, `query.family`, `query.lineage`, `query.events`) and may
   submit an influence.
5. Quit: stamp `clockAtMs = now` and persist. Time after exit is owed on next
   launch.

## Simulation model (`packages/sim`)

### Time

- 1 tick = 10 sim minutes; 144 ticks = 1 sim day.
- `msPerTick` = 60,000, so at 1× one tick passes per real minute. Scales are
  `1, 4, 16, 64` (`packages/contract/src/enums.ts` `TIME_SCALES`). The browser
  build starts at 64×.

### Tick order (`kernel/step.ts`)

1. `applyInfluences`: pending influences whose `issuedAtTick == tick`, by
   ascending id.
2. `aggregateTerritories`: effective food and danger (base plus active
   modifiers, clamped 0–1000) and living population.
3. For each living creature, in ascending id:
   - Old age: dies once lived ticks ≥ `baseLifespanDays × 144 × (500 + geneStrength) / 1000`,
     which is 0.5× to 1.5× the species lifespan.
   - Need drift, then health drift.
   - Death from drift: hunger ≥ 1000 → `STARVATION`, thirst ≥ 1000 →
     `THIRST`, health ≤ 0 → `ILLNESS`.
   - Resolve the action that ends this tick (or finish a relocate).
   - If the action slot is empty, choose a goal and start an action.
4. `resolveBirths`: mothers whose gestation ends this tick give birth.
5. `decayQuietRelationships`, then `lastTick += 1`.

### Needs (`kernel/needs.ts`, all 0–1000)

| Need       | Per-tick drift                                                                                                           |
| ---------- | ------------------------------------------------------------------------------------------------------------------------ |
| hunger     | +4 (+2 while nursing)                                                                                                    |
| thirst     | +7 (+3 while nursing)                                                                                                    |
| fatigue    | +3 awake, −12 resting, +1 nursing                                                                                        |
| discomfort | +1, +2 per head over territory capacity, +2 if danger > 500, −6 resting                                                  |
| unsafety   | moves toward territory danger (halved while resting): +8 up, −4 down (−12 resting)                                       |
| loneliness | +2, unless approaching someone; −20 while nursing beside the mother                                                      |
| health     | −40 if hunger or thirst > 950, else −15 if > 800; −5 if fatigue > 900; +5 when hunger and thirst < 400 and fatigue < 500 |

### Goal-picking AI (`ai/utility.ts`, `ai/actions.ts`)

Each eligible goal gets four terms (0–1000), and the score is
`(50·need + 20·personality + 15·relationship + 15·memory) / 100`. Highest
score wins. Ties go to higher need, then higher personality, then lower goal
ordinal. `IDLE` is never scored.

| Goal                | Eligible when                                 | Action(s) started                                                                                                          |
| ------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `FIND_FOOD`         | always                                        | `CONTEST` a rival (aggression and food gates), else `COOPERATE_FORAGE` with a trusted partner if food ≥ 500, else `FORAGE` |
| `DRINK_WATER`       | always                                        | `DRINK` (2 ticks, −600 thirst)                                                                                             |
| `SEEK_SHELTER`      | always                                        | `RELOCATE` (flee) if unsafety > 700 or danger > 650 and a safer link exists, else `REST` (8–24 ticks)                      |
| `SOCIALIZE`         | another creature shares the territory         | `APPROACH` the best social target                                                                                          |
| `EXPLORE`           | always                                        | `RELOCATE` to an explore destination, else `WANDER`                                                                        |
| `FIND_MATE`         | a legal partner exists                        | `COURT`                                                                                                                    |
| `PROTECT_OFFSPRING` | own juvenile in this or an adjacent territory | `GUARD` the youngest here, else relocate toward them                                                                       |

Newborns start with `NURSE`. A losing `CONTEST` can kill with cause `INJURY`.

### Memories (`memories/`)

- Kinds: conversation, gift, rescue, parent death, first child, threat, mate,
  discovery, migration, conflict, cooperation (`MemoryKind`).
- Strength decays with a half-life of 2,880 ticks (20 days) for minor memories
  and 43,200 ticks (300 days) for major ones (importance ≥ 25).
- The utility memory term uses the 32 strongest ("hot") memories. Repeat
  memories are throttled (144 ticks; 72 for conflict).

### Relationships (`relationships/`)

- Per-pair friendship, romance, conflict, avoidance, trust, cooperation, and
  score. Pairs are created on first `APPROACH` or at birth (parent–child).
- Deltas come from socialize, snub, contest, cooperate-forage, gift, rescue,
  court accept/reject, and guard.
- Quiet relationships decay once per sim day.

### Genetics, courtship, and birth (`genetics/inherit.ts`, `kernel/birth.ts`)

- Genes: strength, speed, intelligence, curiosity, sociability. Traits:
  curiosity, aggression, loyalty, sociability, bravery, risk-taking.
- Legal partners: opposite gender, same territory, both mature, not gestating,
  past cooldown, healthy and fed enough (health ≥ 600, hunger and thirst ≤ 500),
  and low conflict. Cross-species fertility is `0` in v1, so only same-species
  pairs can breed.
- Mutations: a roll from 0–999; below 2 is rare (±80–160), below 17 is minor
  (±40).
- Litter size 1. Gestation is the species `gestationDays`. Cooldowns are 48
  ticks for males and postpartum.
- A child joins the **mother's lineage** at generation max(parents) + 1
  (`family/lineage.ts`). Extinction is computed (no living members), never
  stored (`packages/db/src/family.ts`).

### Migration and discovery

- `RELOCATE` travels territory links (meadow↔thicket 6 ticks, thicket↔ridge
  8 ticks).
- Migration reasons are `FLEE`, `SETTLE`, and `PROTECT`, and each writes a
  `MIGRATION` memory and event.
- Each lineage records one `DISCOVERY` per territory it reaches.

### Offline catch-up (`catchup/run.ts`, `apps/sim-host/src/catchup.ts`)

- Owed ticks = ⌊(now − clockAt) / msPerTick⌋.
- The same `step()` runs N times, committing every 500 ticks.
- A `CatchupReport` ranks notable events (rare-mutation births, deaths in
  favored lineages, and so on) via `catchupEventRank`.
- Influence submits are rejected with `catching_up` while catch-up runs.
- The client stores `world.catchup` in `worldViewStore.lastCatchup`, but no
  HUD component displays it yet.

### Determinism

- RNG is splitmix64 / FNV-1a over `(seed, tick, domain, subjectId, salt)`. The
  domains are worldgen, name, genetics, personality, forage, and contest.
- Integer math only (`assertInteger`), and every iteration order is fixed.
- `canonicalHash` (SHA-256 over canonical JSON, `hash.ts`) pins the seed-1
  founder world in `packages/sim/test/determinism.test.ts`.
  `catchup-equivalence.test.ts` checks that catch-up equals live stepping.

## World and species

`worldgen/create-world.ts` builds one world, "Living World":

| Territory | Food | Danger | Capacity |
| --------- | ---- | ------ | -------- |
| Meadow    | 700  | 200    | 40       |
| Thicket   | 500  | 450    | 30       |
| Ridge     | 350  | 700    | 20       |

There are 4 founders per species (alternating female/male), for 12 total. Each
founder starts its own lineage in its home territory.

| Sim species (`id`, slug) | Home    | Maturity / lifespan / gestation / juvenile (days) | Base curiosity, aggression, loyalty, sociability, bravery, risk | Client skin (`species-skins.ts`)     |
| ------------------------ | ------- | ------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------ |
| 1 `fernfox`              | meadow  | 90 / 900 / 18 / 16                                | 700, 350, 500, 600, 550, 650                                    | Fire fox (`FireFoxMesh.tsx`)         |
| 2 `mossback`             | thicket | 140 / 1400 / 30 / 28                              | 300, 250, 750, 400, 400, 200                                    | Moss stag (`MossStagMesh.tsx`)       |
| 3 `pebblehare`           | ridge   | 70 / 700 / 14 / 12                                | 550, 200, 400, 500, 300, 500                                    | Lantern moth (`LanternMothMesh.tsx`) |

All species are `HERBIVORE`. Skins are view-only: the kernel knows Fernfox,
Mossback, and Pebblehare, and the client maps them to the fire fox, moss stag,
and lantern moth meshes.

## Player influences

`packages/contract` `InfluenceKind`, applied in `kernel/influences.ts`:

| Verb               | Effect                                                                                  |
| ------------------ | --------------------------------------------------------------------------------------- |
| `NAME_CREATURE`    | Sets the name and `nameGivenByPlayer = true`.                                           |
| `NAME_LINEAGE`     | Renames the lineage.                                                                    |
| `FAVOR_BLOODLINE`  | `lineage.playerFavor += 100` (max 1000). Today it only affects catch-up report ranking. |
| `ENRICH_TERRITORY` | `FOOD` modifier +150 for 5 days (720 ticks).                                            |
| `CALM_TERRITORY`   | `DANGER` modifier −100 for 5 days.                                                      |

- **Rate limit** (`apps/sim-host/src/influence.ts`): 3 accepted per rolling
  24 h of wall time (`INFLUENCE_RATE_LIMIT`, `INFLUENCE_RATE_WINDOW_MS`), per
  gate. Single-player uses one `"local"` gate, multiplayer one gate per account
  id.
- The accept log persists in `host-meta.json` (desktop) or in the repository
  (browser).
- Accepted influences are queued for `lastTick + 1`.

## Time controls (`apps/sim-host/src/clock.ts`, `hud/ClockControls.tsx`)

- **Pause:** freezes stepping. While paused, `clockAt` snaps forward (at most
  every 10 s), so paused time is discarded rather than owed.
- **Resume:** continues without replaying the paused gap.
- **Scale:** 1×, 4×, 16×, or 64×. The contents of a tick do not change with
  scale.

## Persistence

- `WorldRepository` (`apps/sim-host/src/persist/repository.ts`) commits atomic
  batches with explicit kernel-assigned ids and no DB sequences.
- Only dirty rows are written (`persist/dirty.ts`). Every living creature is
  dirty each tick, because its needs drift.
- **Desktop:** `PrismaWorldRepository` writes to embedded Postgres, one
  transaction per commit. The schema is in `packages/db/prisma/schema.prisma`,
  with 3 migrations, and `CURRENT_SCHEMA_VERSION = 1`. Load refuses newer
  schemas (`SchemaTooNewError`).
- **Browser:** `BrowserWorldRepository` uses the same commit semantics over
  IndexedDB.
- **Tests:** `MemoryWorldRepository`.
- **Single writer:** `HostRuntime` either steps or handles a command, never
  both at once. On a crash, in-memory state is discarded and the next boot
  reloads the last successful commit. Re-running reaches the same hash as a
  clean run (`apps/sim-host/test/crash-redo.test.ts`).

## Client and view architecture (`apps/client/src`)

- `state/worldViewStore.ts` mirrors host `WorldView` and applies
  `world.patch`. `state/uiStore.ts` holds selection, pause, and scale.
- `view/world/*` turns the 3-node territory graph into one continuous night
  landscape: terrain, water, flora, sky, and glow points. It is deterministic
  from the seed and graph, and is never saved or fed back to the sim.
- `view/motion/*` maps the sim goal/action to a presentation behavior
  (forage, drink, rest, social, court, and so on) and to waypoints from
  deterministic anchors. Creatures free-roam visually across regions, while
  their sim location stays the territory id.
- `view/creatures/*`: procedural meshes and materials for the three skins. The
  repo has no model or texture assets.
- HUD: `InspectionPanel` (creature, family, top memories), `InfluencePanel`
  (all five verbs), and `ClockControls`.

## Multiplayer host seam (M22)

- `createSharedWorldHost` (`multiplayer/shared-world-host.ts`) wraps one
  `HostRuntime`. Clients `join` with an `accountId`, receive a snapshot and
  clock, and send commands and queries scoped to their account.
- `ws-protocol.ts` defines `join | command | query | leave` messages from the
  client and `host | query-result | query-error | fatal` messages from the
  server. `ws-server.ts` defaults to `127.0.0.1` and an ephemeral port.
- Auth is a placeholder (`multiplayer/account.ts`: "Real auth lands later").
- Clock commands from any client affect the shared world.
- No production entrypoint or client transport exists yet.

## On-chain integration (Boing testnet, `apps/sim-host/src/boing/`)

- **Off by default.** It runs only when `LIVING_PETS_BOING_MINTING` is truthy.
  Otherwise `DisabledBoingNftClient` makes no network calls and writes no link
  rows. The browser build never enables it.
- **M19:** `SdkBoingNftClient` uses `@boing-network/boing-sdk` reference NFT
  collection and multi-token templates. It has `probe()` and `plan*Deploy()`
  helpers, but nothing in the app calls them. Collections must already be
  deployed and configured by env.
- **M20, creature NFT at birth:** after a durable `BIRTH` commit (founders at
  worldgen and live births), `enqueueBirthMintsAfterCommit` queues one
  `UNIQUE_CREATURE` mint per child. Status moves `PENDING → SUBMITTED →
CONFIRMED`, or `FAILED`, which can be retried. Links persist in
  `CreatureNftLink`. A missing collection marks the mint `FAILED`. Mint
  failures never throw into the tick or commit path.
- **M21, asset taxonomy** (`taxonomy.ts`): `UNIQUE_LINEAGE_ARTIFACT` (unique
  NFT) and `COMPRESSED_ITEM` (multi-token, fungible-like), persisted in
  `AssetMintLink`. The mint edge exposes `queueLineageArtifactMint` and
  `queueCompressedItemMint`, but no game system calls them yet. Items and
  artifacts are **planned** (the comments mention keepsakes, potions, and gear).
- **Recipient:** `LIVING_PETS_BOING_NFT_RECIPIENT_HEX`, or else the address
  derived from `BOING_SECRET_HEX`, which means the operator.

## Trust and security model

- The host is the only writer and authority. Clients get derived views and can
  only submit the five validated verbs (`assertValidSubmit`).
- The kernel has no I/O, wall clock, or randomness source, so a world is
  reproducible from its seed plus its influence log.
- The signing key comes only from the environment. A browser build has no
  `process.env`, so it cannot mint. The bundle check blocks `DATABASE_URL` and
  Prisma.
- Desktop: the host connects to embedded Postgres at `127.0.0.1` with a fixed
  local password in `apps/desktop/src/main.ts`. The Electron window has `contextIsolation: true`,
  `nodeIntegration: false`, and `sandbox: false`.
- Multiplayer has no real identity yet: account ids are self-asserted, so
  per-account rate limits can be bypassed by choosing a new id.

## Milestone history (from `git log`)

Before M1, the Nov 14–15 commits extended the old Boing Pets "Yard" game
(Quarry gather loop, vault mint, vinyl accessories). Then `b116e6a` removed it.

| M   | Commit(s)            | Summary                                                                |
| --- | -------------------- | ---------------------------------------------------------------------- |
| M1  | `4d36b59`, `b116e6a` | Contract and sim skeleton; old pasture app removed.                    |
| M2  | `25d27dc`            | Prisma schema and SQL checks.                                          |
| M3  | `4f8b21d`            | Deterministic worldgen and canonical founder hash.                     |
| M4  | `3451aed`            | Tick drift, death, starvation event.                                   |
| M5  | `545c5f6`            | Relocate travel, migration, one discovery per lineage.                 |
| M6  | `20999ff`            | Utility AI scoring, tie-break, action table.                           |
| M7  | `c88d84e`            | Memory decay, throttles, memory utility term.                          |
| M8  | `4e1b8cf`            | Relationship create, deltas, daily decay.                              |
| M9  | `5b388af`            | Genetics, court, gestation, birth.                                     |
| M10 | `57ae6f4`            | Family SQL, maternal lineage, computed extinction.                     |
| M11 | `1deaf4e`            | Load, dirty save, explicit ids, crash redo.                            |
| M12 | `9137ff6`            | Offline catch-up and `CatchupReport`.                                  |
| M13 | `b9bbc8c`            | Pause and time scale on the host clock (inferred; branch tip differs). |
| M14 | `c6abd8b`            | Five influence verbs and host rate limit.                              |
| M15 | `24c80c0`            | React shell, Zustand, IPC, R3F territory tokens.                       |
| M16 | `8d2710c`, `3beabe1` | Inspection HUD, host queries, selection and name picker (inferred).    |
| M17 | `3627566`            | Scale rehearsal: 5,000 creatures.                                      |
| M18 | `14010db`            | Electron shell and local Postgres cold boot.                           |
| M19 | `9e6184a` (#63)      | Boing NFT client at the host edge.                                     |
| M20 | `f5deeb9` (#65)      | Creature NFT mint at birth.                                            |
| M21 | `6cfcd75` (#66)      | Asset mint taxonomy.                                                   |
| M22 | `76cbef0` (#68)      | Multiplayer host seam.                                                 |

Unnumbered work between M18 and M22:

- `f195897`: FORAGE/DRINK resolution.
- Visual creature skins and atmosphere (#52).
- Vercel client build (#53).
- Open night map, sim-driven motion, realistic materials, free-roam (#58).
- GUARD fix and MIGRATION memories (#59).
- Pause, scale, and influence HUD (#60).
- Browser persistence across refresh (#62).
- Camera reset fix (#64).

## Open questions / next steps

From the Nov 20, 2026 local audit:

1. Fix `apps/desktop/src/migrate.ts` on Windows (spawn with a shell, or call
   the Prisma CLI entry with `node`), and add a Windows CI job.
2. Upgrade Prisma 6 → 7 to clear the high-severity `npm audit` findings.
3. Multiplayer: real auth, a WebSocket `maxPayload`, a client transport, and a
   decision on who may pause or rescale a shared world.
4. Minting: decide whether players get their own recipient addresses, separate
   the signing key per collection, and choose a collection-deploy workflow.
5. Give `FAVOR_BLOODLINE` a sim effect, or document it as cosmetic/ranking
   only.
6. Show `CatchupReport` in the HUD (it is already stored in `worldViewStore`).
7. Decide whether sim species names (Fernfox/Mossback/Pebblehare) or skin names
   (fire fox/moss stag/lantern moth) are canonical.
   `apps/client/src/view/species-skins.ts` cites a `docs/art-direction.md` that
   is not in the repo.
8. Desktop packaging: the main process assumes a repo checkout (`REPO_ROOT`,
   `npx prisma`), uses a beta embedded Postgres, and runs with
   `sandbox: false`.
9. Split the 1.36 MB client chunk, and decide whether to ship source maps.
10. Clean leftovers from the old game in local checkouts (`playtest-artifacts/`,
    `scripts/`, `.dev.vars` are no longer in `.gitignore`).
