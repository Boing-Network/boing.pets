# Gathering skills

Phase 1 (Quarry, off-chain) is in the tree behind `GATHER_QUARRY`, default **off**. Vault mint is behind `GATHER_MINT`, also default **off**. When that flag is on, `POST /api/gather/mint` queues one operator leg per item id. When it is off, the route stays 403 and does not move items. Migrations `0030_gathering_skills.sql` and `0031_market_listing_escrow.sql` are local/test only until a deploy is approved. Do not apply them remotely from an unapproved change, and do not deploy from this note. No cron. The Free plan is already at 5/5.

Player-facing copy says **character**, not pet. The hatch row stays in the `pets` table. Accent color is safety orange `#FF4D00`.

## Decisions

Owner calls, then the defaults used for everything they left open.

| #   | Call                                                                                                                    | Status             |
| --- | ----------------------------------------------------------------------------------------------------------------------- | ------------------ |
| 1   | Unlock cap 50. Prestige past 50 is a cosmetic count and opens nothing.                                                  | Owner              |
| 2   | Pack is 28 units (`sum(qty)`), not 28 item types.                                                                       | Decided by default |
| 3   | Cred is `floor(reward/8)` for the first 80 banked units per skill per UTC day, then items and XP only.                  | Owner              |
| 4   | Pickaxe tier stays a hard lock on top of level. The pick also keeps its success multiplier.                             | Owner              |
| 5   | When a skill flag is on, that family's old signed loop and mini-game both 409. Phase 1 retires mining only.             | Owner              |
| 6   | The vault banks the whole pack. No partial deposit in v1.                                                               | Decided by default |
| 7   | Mint is an explicit action at the Block Vault, in batches, one leg per item id. Banked items stay off-chain until then. | Owner              |
| 8   | A character can gather while a Dispatch run is out.                                                                     | Decided by default |
| 9   | Lot Greens stay a level-1 Plot bed and never mint. Plot itself is not in phase 1.                                       | Decided by default |
| 10  | Nodes are instanced per character.                                                                                      | Decided by default |
| 11  | Node life is 2–5 minutes of wall clock, not 8–24 ticks.                                                                 | Owner              |
| 12  | No daily item heat in phase 1. Ore supply may fall in price on testnet. Cred is the brake.                              | Decided by default |
| 13  | The vault is in The Yard only.                                                                                          | Decided by default |
| 14  | Dispatch loot does not grant Sweep XP.                                                                                  | Decided by default |

Marketplace rule, enforced: only minted items can be listed. Unminted banked items stay usable in craft, kitchen, housing, and care. `item_mint_balance.qty` is the listable amount. `assertListable` rejects a list with 409 `Only minted items can be listed` when that balance is short. Do not copy `inventory` into `item_mint_balance`. Stacks people already hold are banked, not minted.

The cutover:

- New listings set `marketplace_listings.escrow='minted'` (migration `0031_market_listing_escrow.sql`) and debit `item_mint_balance` on confirm. Cancel, expiry, and sale credit that same table.
- Rows that were already `open` default to `escrow='inventory'`. Cancel, expiry, and sale of those rows still credit `inventory`. Do not cancel them.
- A confirmed vault mint debits `inventory` when the row is queued and credits `item_mint_balance` when the receipt succeeds. A failed submit or receipt refunds the qty onto `inventory`.
- Wallet balances from the old withdraw flow stay where they are. `POST /api/items/deposit/confirm` credits `item_mint_balance`, not `inventory`, because those tokens were already minted. The on-chain status shows `minted_qty` beside the banked `offchain_qty`.
- `gather_mint_queue` is the batch queue. It does not reuse `operator_mint_queue.reward_id`, because that settler writes `adventure_rewards`. `nextOperatorNonce` takes the max nonce across withdrawals, `operator_mint_queue`, and `gather_mint_queue`.

## Summary

Four gathering skills, one per resource family the world already drops: **Quarry** (ores), **Line** (fish), **Plot** (crops, including off-chain Lot Greens), **Sweep** (treasure). Food, tools, cosmetics, furniture, race ribbons, cookbook defs, and Idle Adventure materials are not gathering skills.

Levels use the Old School RuneScape XP curve. Unlocks, tick speed, and drop weights stop at **50** (101,333 XP). XP past that still counts. Prestige is `virtualLevel - 50` and opens nothing. The toast is `QUARRY P1`.

A node runs on the Worker clock. Life is a hidden **2–5 minutes**. The client polls; the server grants only ticks the wall clock has earned. When the face dies, or the pack hits 28, the character clicks again or walks to the vault. Closing the tab does not earn past that one node. No cron and no Durable Object.

Banking at the Block Vault `(0, -8)` moves the pack into `inventory`. Ticks never mint. Mint, later, is a button on that vault: presets 10, 100, 1,000, and 10,000, plus a custom amount up to the banked qty and 10,000. One item id is one `mint(to, itemId, amount)` leg, so gas stays ~0.00084 BOING budgeted per leg, not per unit. Presets larger than the banked stack are disabled, not clamped. A `client_key` makes a double submit return the same queue row. States are `queued`, `submitted`, `minted`, and `failed` (failed refunds the qty to the bank).

Phase 1 is Quarry only. `GATHER_QUARRY=off` and `GATHER_MINT=off` in `wrangler.jsonc`. Set `GATHER_QUARRY` to `on` only after 0030 is applied. Set `GATHER_MINT` to `on` only after 0030 and 0031 are applied and the operator key (`MULTI_TOKEN_CONTRACT`, `MULTI_TOKEN_ADMIN_SECRET_KEY`) is configured. While `GATHER_MINT` is off, `POST /api/gather/mint` returns 403 and does not move items. Line, Plot, and Sweep wait.

## What the repo does today

Gathering is four stations in The Yard (`src/world/config/zones.ts`, zone `pasture`) plus a parallel signed-challenge API and a parallel mini-game API.

| Family   | Station                         | Items                                          | Today's gate                                                       | Where the stack goes          |
| -------- | ------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------ | ----------------------------- |
| Ores     | Crystal Quarry `pasture-mine`   | 5, `src/content/mining.ts`                     | 10 stamina / UTC day. Pick tier gates the pool. 8 swings / minute. | `inventory` + Cred on confirm |
| Fish     | Pond Pier `pasture-fish`        | 5, `src/content/fishing.ts`                    | 3 catches / UTC day. 8 casts / minute.                             | same                          |
| Crops    | Garden Beds `pasture-garden`    | 5 crops, plus `crop-forage` from the mini-game | 3 plots. Grow 30–180s. No harvest-per-day cap on the signed loop.  | same                          |
| Treasure | Treasure Dig `pasture-treasure` | 5, `src/content/treasure.ts`                   | 3 digs / UTC day.                                                  | same                          |

The mini-game path (`migrations/0020_activity_attempts.sql`, `ACTIVITY_ATTEMPT_DAILY_CAP = 3`) is a second door into the same items: server secret, 45s play window, claim signature, then the same inventory credit. Both doors write `inventory(owner, item_id, qty)` with no slot cap. Crafting, cooking, the market, housing, and withdraw all read that table. `inventory_acquisitions` is the audit trail (market hold, craft, drops). It is not a second balance.

On-chain items are optional. `src/content/onchainItems.ts` maps stacks onto the reference multi-token. Play stays off-chain. A withdraw debits `inventory` and the operator either transfers stock it already holds or mints the shortfall, qty 1–100, one item id per leg. Adventures are the exception: `creditRewards` in `worker/adventures.ts` inserts `inventory` **and** enqueues `operator_mint_queue`, so those rewards exist in both places. Gathering must not copy that. A banked ore is either in the game or in the wallet, not both.

Gas budget already in the repo (`src/market.ts`): a measured native transfer is 21,000 gas and 0.00021 BOING. The reserve uses 4× that, **0.00084 BOING per leg**. `docs/ONCHAIN-ITEMS.md` measures a multi-token mint or transfer at about 42,800 gas, which is about 0.000428 BOING at the same fee policy (`gas_used * 1e12 * 100 / 10000`). 0.00084 is the cap to plan against, not the expected fee. Mint calldata is `mint(to, itemId, amount)` for a single id. There is no multi-id mint. The operator nonce is shared with withdraws (`nextOperatorNonce` reads both tables). Settlement of submitted legs is lazy, on the next request, `LIMIT 8`, no cron.

Idle Adventures are the long absence: 45 minutes to 3 days, one `adventure_xp` counter, slots from completions, diminishing returns, 6 runs per location per day. Claiming settles the mint queue. Admin is `npm run admin:adventures` only.

Anti-abuse that this design keeps: per-IP buckets in `rate_limit_buckets` (120/min on `/api`, 30/min on `/api/pasture`), per-owner challenge ceilings, server-committed secrets the client does not roll, and a hatch check. World position is a signed optional sync (`player_positions`), not a proof that the character is standing on the pad. This design does not pretend otherwise.

`PlazaRoom` is the only Durable Object, and it is for presence. It is the wrong tool for a per-character timer.

## 1. Skills

Skill id is stable. The display name is the street name. Nodes are the items that already exist. No new item ids.

| Skill    | Name   | Station        | Nodes, in unlock order                                                                    |
| -------- | ------ | -------------- | ----------------------------------------------------------------------------------------- |
| `quarry` | Quarry | Crystal Quarry | Lot Pebble, Spark Ore, Emberite, Yard Crystal, Aetherite                                  |
| `line`   | Line   | Pond Pier      | Curb Minnow, Alleyfin, Copperfin, Night Koi, Starfin                                      |
| `plot`   | Plot   | Garden Beds    | Curb Sprout, Lot Greens (`crop-forage`), Lot Berry, Honeyroot, Nightbloom, Highrise Bloom |
| `sweep`  | Sweep  | Treasure Dig   | Alley Pebble, Map Scrap, Chain Bell, Flare Shard, Signal Bead                             |

Not skills: Kitchen food, pickaxes, cosmetics, furniture, `mat-scrap` / `mat-thread` / `mat-resin`, cookbook `recipe-*` rows, race ribbons. Those stay on the kitchen, the crafting station, Dispatch, the catalog, and the track.

### Curve

XP to reach a level is the OSRS total, and the skill stops at 50.

```
points = 0
for n in 1 .. level-1:
  points += floor(n + 300 * 2^(n/7))
xpToReach(level) = floor(points / 4)
```

| Level | XP to reach it |
| ----- | -------------- |
| 1     | 0              |
| 2     | 83             |
| 10    | 1,154          |
| 15    | 2,411          |
| 20    | 4,470          |
| 30    | 13,363         |
| 35    | 22,406         |
| 40    | 37,224         |
| 50    | 101,333        |

Level 99 on this curve is 13,034,431 XP, about 129× level 50. Unlocks stop at 50. The same curve keeps going, up to virtual level 120, and the extra levels are prestige. Prestige does not change tick speed, drop weights, or which ore the pick can reach. Level is derived from XP. It is not a column.

XP is paid on a **successful** tick only. A dry tick still consumes the node and gives nothing.

| Rarity   | XP  |
| -------- | --- |
| common   | 8   |
| uncommon | 16  |
| rare     | 28  |
| epic     | 48  |

Rough clock, if the character re-clicks every time a node dies: about 300 successes an hour at level 1 (assumptions in section 2). Pebbles are 8 XP, so the first hour is about 2,400 XP, which clears level 15. Chasing the best unlocked node, Quarry 50 is on the order of **8–14 hours** of node-time. Sitting on Lot Pebble the whole way is closer to **40 hours**, because 101,333 / 8 / 300 ≈ 42. That gap is the reason to unlock the next node. These are planning numbers. XP values live in content, not in D1, so they can move without a migration.

### What a level does

Three effects, and only these:

1. **The next node opens.** Below the level, that item is not in the pool (Quarry, Line, Sweep) or the bed cannot be worked (Plot).
2. **Ticks get shorter.** `tickMs(level) = max(2400, 4000 - floor((level - 1) * 1600 / 49))`. Level 1 is 4.0s. Level 50 is 2.4s. The floor stays at 2.4s so a click still has a human gap.
3. **Better odds on nodes already open.** For a rolled skill, each unlocked item's weight is multiplied by `1 + 0.01 * (level - minLevel)`, then each item's share is clamped to `min(0.50, 2 * baseShare)`, then the pool is renormalized. Epic share cannot run away. Plot does not roll: the character clicks a specific bed, and the level only decides which beds exist.

Quarry pool (base weights are the ones in `ORES`, already summing to 100):

| Level | Item         | Rarity   | XP  | Today's Cred | Cred once banked |
| ----- | ------------ | -------- | --- | ------------ | ---------------- |
| 1     | Lot Pebble   | common   | 8   | 4            | 1                |
| 1     | Spark Ore    | uncommon | 16  | 10           | 1                |
| 15    | Emberite     | rare     | 28  | 18           | 2                |
| 20    | Yard Crystal | rare     | 28  | 22           | 2                |
| 35    | Aetherite    | epic     | 48  | 36           | 4                |

Line:

| Level | Item        | XP  | Cred once banked |
| ----- | ----------- | --- | ---------------- |
| 1     | Curb Minnow | 8   | 1                |
| 8     | Alleyfin    | 16  | 1                |
| 16    | Copperfin   | 16  | 1                |
| 28    | Night Koi   | 28  | 2                |
| 42    | Starfin     | 48  | 4                |

Plot beds (the character picks the bed; yield is that crop, not a roll):

| Level | Bed            | XP  | Cred once banked | Chain              |
| ----- | -------------- | --- | ---------------- | ------------------ |
| 1     | Curb Sprout    | 8   | 1                | item 30            |
| 1     | Lot Greens     | 8   | 1                | never (no item id) |
| 10    | Lot Berry      | 16  | 1                | item 31            |
| 18    | Honeyroot      | 16  | 1                | item 33            |
| 30    | Nightbloom     | 28  | 2                | item 32            |
| 44    | Highrise Bloom | 48  | 3                | item 34            |

Sweep:

| Level | Item         | XP  | Cred once banked |
| ----- | ------------ | --- | ---------------- |
| 1     | Alley Pebble | 8   | 1                |
| 8     | Map Scrap    | 16  | 1                |
| 16    | Chain Bell   | 16  | 1                |
| 30    | Flare Shard  | 28  | 3                |
| 44    | Signal Bead  | 48  | 5                |

Cred column is `max(1, floor(rewardBoinglets / 8))`, paid at the vault, and only for the first 80 banked units of that skill that UTC day. Detail in section 6. Laces are not a gather reward.

Pickaxes stay a hard lock on top of level. An ore rolls only when `level >= minLevel` and `pickaxeTier >= minTier`. Wood (tier 1, free, off-chain, reserved id 60) reaches Lot Pebble and Spark Ore. Iron (tier 2) is required for Emberite and Yard Crystal. Crystal or better (tier 3) is required for Aetherite. The pick also multiplies face success by 1.00 / 1.08 / 1.15 / 1.22, then the chance is clamped at 0.72. A level-50 character with a wood pick still cannot pull Aetherite. Seeded XP does not waive the pick.

### Copy

Short, dry, on the station and in the toasts. No "buddy", no "little", no exclamation piles.

| Moment    | Quarry                                   | Line                         | Plot                        | Sweep                          |
| --------- | ---------------------------------------- | ---------------------------- | --------------------------- | ------------------------------ |
| Idle hint | Press E to work the face.                | Press E to hold the pier.    | Press E to run the beds.    | Press E to clear the block.    |
| Working   | On the face.                             | Line's in.                   | Hands in the bed.           | Sweeping.                      |
| Node dies | Face is dead. Hit it again.              | Line went slack. Cast again. | Bed's spent. Work it again. | Patch is cold. Sweep it again. |
| Pack full | Pack's full. Bank it at the Block Vault. | same                         | same                        | same                           |
| Level up  | `QUARRY 12` or `QUARRY P1`               | `LINE 12`                    | `PLOT 12`                   | `SWEEP 12`                     |

The level-up toast is the skill name, safety orange, and the new level. Nothing else.

## 2. AFK loop

The client does not report ticks, successes, or timestamps. It asks the server to settle, and the server decides what the clock has earned.

### Session

`POST /api/gather/start` with the social-session bearer (`requireSocialSession`, the same token the mini-games use). Body is `{ skill, nodeId }`. The Worker checks:

- the wallet has a hatch row
- the skill flag is on
- the node is unlocked at this level
- the pack has room
- this owner has no `running` session
- the previous session ended at least 1.5s ago

Then it inserts one row: `tickMs` from the level, a hidden life whose wall clock is uniform from **120s to 300s** (tick count is `round(lifeMs / tickMs)`, so a faster level does not shorten the AFK window), `seed` from `crypto.getRandomValues`, `startedAt = now`. The response does **not** return `depleteTicks` or the seed.

That is the AFK window: look away for two to five minutes, then click again. It is not an overnight. Lengthening the node does not raise the hourly ceiling. Items still come from tick rate times success (~300 an hour at level 1 if the character re-clicks every time). What changes is loot per unattended click. One node is at most one pack, because ~5 items a minute fills 28 units in about five minutes, and a closed tab cannot start the next node. Cred still stops at 80 units a day. Fewer clicks (about 12–30 an hour instead of one a minute) is the point. The item faucet does not grow with the AFK window.

### Settle

`POST /api/gather/settle` is idempotent.

```
due = min(depleteTicks, floor((now - startedAt) / tickMs))
newTicks = due - ticksSettled
```

`now` is the Worker clock. For each new tick index, roll with the existing `mulberry32` (`src/content/adventures.ts`) seeded from `seed` and the index:

- success chance starts at **0.35** on a node at its minimum level, plus 0.004 per level above that, cap **0.72**
- Quarry then applies the pickaxe multiplier, cap still 0.72
- success: +1 of the rolled item (or the Plot bed's crop) into the pack, +XP, stop the session as `packed` if the +1 would pass 28 and do not consume that tick
- failure: the tick counts, the pack and XP do not move

Write it as one D1 batch: conditional `UPDATE gather_sessions SET ticks_settled=? WHERE id=? AND ticks_settled=? AND status='running'`. If `writeChanges` is 0, re-read and grant nothing. Two overlapping polls cannot double-pay. That is the whole concurrency story. A Durable Object would serialize the same single-player row at a higher cost, and `PlazaRoom` has no business holding balances.

When `ticksSettled` reaches `depleteTicks`, status becomes `depleted`. The next resources require a new `start`. That click is the human cadence. A script can still send it. What it cannot do:

- claim ticks it did not wait for
- run two nodes at once
- keep earning after the hidden life ends, including across hours with the tab closed (the next settle pays at most the 24 ticks already rolled)
- invent the drop (the seed never left the server)
- spray settle: calls before the next tick is due return the same state; more than 40 settles/minute/owner is 429. The IP bucket of 120/min on `/api` still applies
- start again inside 1.5s of the last end

Bank is 10/minute/owner. Start while a session is `running` is 409.

This does not stop a bot that sits on the API and clicks when the status flips. Say that plainly. It stops the cheap versions: one request for a day's ore, a client-side timer, parallel characters on one wallet, and an unattended overnight on a gather node. Overnight stays Dispatch.

No cron. A `running` row that nobody polls simply sits. The next `status`, `settle`, `start`, `stop`, or `bank` computes `due` from `startedAt` and closes it at the cap. There is nothing to sweep.

Position is not a requirement in phase 1. Cloud-save is optional and costs a wallet signature, which would kill the AFK loop if we demanded it every node. The station check is the same trust level as today's "press E" pads. A later phase can require `player_positions` inside the station radius and younger than a few minutes, once a position heartbeat exists that is not a signature. Until then, do not describe the loop as location-proven.

### Why not a Durable Object

Justified later only if one physical face is shared by every character on the block and two hits must fight over the same remaining ticks. Phase 1–3 nodes are instanced per character, like a private rock. D1 plus the conditional update is enough. Do not add a DO class, and do not hang this off `PlazaRoom`.

## 3. Pack and bank

### Pack

28 **units**, not 28 item types. Lot Pebble × 7 is 7 of the 28. Stacks display as one row and still fill the pack, because a single ore id would never fill a 28-slot bag of stackables, and the walk to the vault would never happen.

The pack is `gather_backpack`. It is invisible to craft, kitchen, market, housing, and withdraw. Those keep reading `inventory`. Gathering stops on the tick that would make `sum(qty) > 28`. Status `packed`. The unused tick is not consumed, but the node is over: after banking, the character clicks the face again and gets a new roll. You cannot pause a lucky node, walk to the vault, and resume it.

### Block Vault

New station in The Yard only.

| Field    | Value                                       |
| -------- | ------------------------------------------- |
| id       | `pasture-bank`                              |
| label    | Block Vault                                 |
| kind     | `bank` (new union member on `WorldStation`) |
| position | `(0, -8)`                                   |
| radius   | 3.4                                         |
| hint     | Press E to bank.                            |

That spot sits on the north-south path, about 10 units south of the welcome pad and about 12 from the Market Stall `(12, -8)` and the kitchen `(-12, -8)`. It is a walk from the quarry, the pier, the beds, and the dig, and it is not on top of any of them. Landmark is a low dark vault with one `#FF4D00` stripe, not a cottage. Starter Town does not get a vault in phase 1.

`POST /api/gather/bank` in one `env.DB.batch`:

1. Read the pack. Empty pack returns 200 and writes nothing.
2. For each item id, `INSERT INTO inventory ... ON CONFLICT DO UPDATE SET qty=qty+excluded.qty`.
3. `inventory_acquisitions` with `source = 'gather_bank'`.
4. Delete the pack rows in the same batch, so a retry cannot credit twice.
5. Cred, if any, as one `ledger` row per item id, `currency = 'boinglets'`, `reason = 'gather_bank'`. The UI says Cred. The key does not change.
6. Party bonus once, on the Cred total just paid, through the existing `resolvePartyBonus` path and the existing 50 Cred/day cap. Not once per tick, or the cap dies on the first pebble.

Bank does not end a `running` session by itself. If the pack filled, the session is already `packed`. If the player banks early, `stop` first or bank rejects with 409 while `running`, so a settle cannot land in a pack the vault just emptied. Simplest rule: **bank requires no `running` session.** The panel sends `stop`, then `bank`.

### What hits the chain, and what does not

Banking is a D1 move into `inventory`. It does not mint. `POST /api/gather/mint` is 403 while `GATHER_MINT` is off, and the Block Vault shows the batch presets disabled with "Mint is closed."

When `GATHER_MINT` is on, the Block Vault calls `POST /api/gather/mint`. The player picks one banked item id and an amount:

- presets **10, 100, 1,000, 10,000**, plus a custom whole number
- a preset larger than the banked qty of that item is disabled
- custom amount must be `1 .. min(banked, 10000)`
- one item id per request, however large the amount (this is not the withdraw cap of 100). Delivery goes through `planOperatorDelivery`
- `client_key` is unique per owner; a repeat returns the existing row and does not debit twice
- queue states: `queued`, `submitted`, `minted`, `failed`
- `failed` refunds that qty onto `inventory` exactly once
- `minted` credits `item_mint_balance` and that qty has left the bank
- the debit of `inventory` and the queue insert are one transaction, and only after the operator config exists, the reserve check passes, and the leg is signed (and simulated when it is next in line). Missing operator config returns 503 and does not debit
- receipt settlement stays lazy on the next gather or items request, `LIMIT 8`, no cron
- admit the leg only when the mint operator's native balance covers pending legs × 0.00084 BOING plus the 0.01 floor. A short reserve returns 503 and does not debit
- a failed submit or a failed receipt refunds that qty onto `inventory` exactly once

Do not also leave the qty in `inventory`. Adventures currently credit a stack and mint a second copy. Vault mint will not. `planOperatorDelivery` spends one queue row on one item id. If the operator already holds some of that id, the row can contain a transfer leg plus a mint of the shortfall. The stored nonce is the highest leg, so the next operator action starts after it.

Unmapped ids never enter the queue: `crop-forage`, `tool-pick-wood`, `ribbon-*`, `recipe-*`, XP, levels, seeds, Cred, Laces.

Gas, 0.00084 BOING budgeted per leg (about 0.000428 expected at 42.8k gas):

| Batch                               | Legs   | Budget        |
| ----------------------------------- | ------ | ------------- |
| 10, 100, 1,000, or 10,000 of one id | 1      | 0.00084 BOING |
| Five ids, one batch each            | 5      | 0.0042 BOING  |
| One tx per unit of a 10,000 stack   | 10,000 | 8.4 BOING     |

A true multi-id mint would be a different contract and is out of scope. Listing reads `item_mint_balance`, not raw `inventory`. See the marketplace rule in Decisions.

## 4. Data model

`migrations/0030_gathering_skills.sql` creates the gather tables and the empty mint tables. `migrations/0031_market_listing_escrow.sql` adds `marketplace_listings.escrow` with default `inventory`. Apply both locally or in tests only until a deploy is approved. `deplete_ticks` is `BETWEEN 30 AND 140` so a 2.4s tick can still cover a 5 minute face. Quarry ticks do not write `gather_mint_queue` or `item_mint_balance`. The vault mint path does, and only when `GATHER_MINT` is on. The embedded sketch below matches 0030; the file wins if they drift.

```sql
CREATE TABLE IF NOT EXISTS gather_skills (
  owner TEXT NOT NULL,
  skill TEXT NOT NULL CHECK(skill IN ('quarry','line','plot','sweep')),
  xp INTEGER NOT NULL DEFAULT 0 CHECK(xp >= 0),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (owner, skill)
);

CREATE TABLE IF NOT EXISTS gather_sessions (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  skill TEXT NOT NULL CHECK(skill IN ('quarry','line','plot','sweep')),
  node_id TEXT NOT NULL,
  station_id TEXT NOT NULL,
  tick_ms INTEGER NOT NULL,
  deplete_ticks INTEGER NOT NULL CHECK(deplete_ticks BETWEEN 30 AND 140),
  ticks_settled INTEGER NOT NULL DEFAULT 0 CHECK(ticks_settled >= 0),
  seed TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('running','depleted','packed','stopped')),
  started_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS gather_sessions_owner
  ON gather_sessions(owner, started_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS gather_sessions_one_live
  ON gather_sessions(owner) WHERE status = 'running';

CREATE TABLE IF NOT EXISTS gather_backpack (
  owner TEXT NOT NULL,
  item_id TEXT NOT NULL,
  qty INTEGER NOT NULL CHECK(qty > 0),
  PRIMARY KEY (owner, item_id)
);

CREATE TABLE IF NOT EXISTS gather_daily (
  owner TEXT NOT NULL,
  skill TEXT NOT NULL,
  day_key TEXT NOT NULL,
  cred_items INTEGER NOT NULL DEFAULT 0 CHECK(cred_items >= 0),
  cred_paid INTEGER NOT NULL DEFAULT 0 CHECK(cred_paid >= 0),
  PRIMARY KEY (owner, skill, day_key)
);

CREATE TABLE IF NOT EXISTS gather_bank_log (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  item_id TEXT NOT NULL,
  qty INTEGER NOT NULL CHECK(qty > 0),
  cred INTEGER NOT NULL CHECK(cred >= 0),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS gather_bank_log_owner
  ON gather_bank_log(owner, created_at DESC);
```

`gather_skills.xp` is the only progression number. Level is computed. `gather_daily.day_key` uses the existing `d:${dayOf(now)}` shape. `cred_items` counts banked units that were allowed to pay Cred, capped at 80.

No new column on `inventory`. The vault writes the rows that are already there. `gather_mint_queue` is keyed by `(owner, client_key)`, not by an adventure reward id. `item_mint_balance` stays empty until a mint receipt lands. Do not backfill it from `inventory` or from open listings.

```sql
CREATE TABLE IF NOT EXISTS gather_mint_queue (
  id TEXT PRIMARY KEY,
  bank_log_id TEXT NOT NULL UNIQUE,
  owner TEXT NOT NULL,
  game_item_id TEXT NOT NULL,
  item_id INTEGER NOT NULL,
  qty INTEGER NOT NULL CHECK(qty > 0 AND qty <= 100),
  contract TEXT,
  admin_nonce INTEGER,
  signed_tx TEXT,
  tx_hash TEXT,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS gather_mint_queue_status
  ON gather_mint_queue(status, updated_at);
```

Columns mirror `operator_mint_queue` so the leg encoder can be shared. The debit stays on `inventory`, gated on this row, the same way `onchain_withdrawals` gates a refund.

## 5. Worker API and the HUD

All writes require the social session, and the session owner must be the hatch owner. No wallet signature per tick. Vault mint uses that same session.

| Method | Path                        | Role                                                                                                                                      |
| ------ | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/gather/status?owner=` | Skills, XP, derived level, pack, live session public fields, today's Cred count. Also settles a stale `running` row up to its cap.        |
| POST   | `/api/gather/start`         | Open a node.                                                                                                                              |
| POST   | `/api/gather/settle`        | Grant elapsed ticks. Safe to retry.                                                                                                       |
| POST   | `/api/gather/stop`          | Close `running` without granting past `now`.                                                                                              |
| POST   | `/api/gather/bank`          | Move the pack into `inventory`. Requires no `running` session.                                                                            |
| POST   | `/api/gather/mint`          | When `GATHER_MINT` is on, queue one item id. 403 and no balance move when the flag is off. 503 and no debit when the operator is missing. |

`status` and `settle` return `levelUps: [{ skill, level }]` when this call crossed one or more thresholds, so a backgrounded tab still toasts every level it actually gained. One node of commons is at most 24 × 8 = 192 XP, enough to cross level 2 and maybe 3, not enough to skip a tier.

Errors use the status codes the other activities use: 404 no character, 403 skill off or node locked, 409 pack full / already running / bank while running, 429 rate limit.

### HUD

Extend `WorldHud`. Do not send the player to `mining.html` for a skill that is on.

- **XP bar**, under the station prompt while a gather session is open. Track `#1a1a1a`, fill `#FF4D00`. Label is `QUARRY 12` and `2411 / 4470` style numbers (XP into this level, threshold of the next). At 50 the bar is full and the label is `QUARRY 50`.
- **Level-up toast**, top of the HUD, the same `QUARRY 12` string, orange, about 2.2s, stacked if a settle crossed two levels. `aria-live="polite"`.
- **Pack**, a HUD button always available in The Yard: `PACK 7/28`, opening a panel of stacks (icon from `itemIcons`, qty, name). When it hits 28, the quarry panel replaces the work line with "Pack's full. Bank it at the Block Vault."
- **Vault panel**, on `pasture-bank`: the pack, the Cred this deposit will actually pay (after the daily 80), and one Bank button. No partial deposit in v1. Mint presets and a custom amount call `/api/gather/mint` when `mintEnabled` is true. While the flag is off they stay disabled and the line is "Mint is closed."
- The client polls `settle` about once per `tickMs` while the panel is open, and once when the tab becomes visible. A slow poll does not lose ticks. The grant is the wall clock.

WASD movement is unchanged. E on a live gather station opens the panel in the world. Esc closes it and leaves the character where they stand. The 2D activity pages stay as fallbacks until that skill's flag retires them, the same way `/craft` is a fallback for the crafting station.

## 6. Economy, adventures, old saves, rollout

### What gets more plentiful

At the rates in section 2, a character who re-clicks for an hour takes on the order of **300** resources. Compare that with today:

| Loop     | Today, if you sit down                                                                                                                               | After this skill ships                                                                                                             |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Mining   | About 10 ores / day (stamina), Cred 4–36 each                                                                                                        | ~300 ores / hour, Cred on the first 80 only                                                                                        |
| Fishing  | 3 fish / day                                                                                                                                         | same jump, which is why Line is not in phase 1                                                                                     |
| Treasure | 3 digs / day                                                                                                                                         | same                                                                                                                               |
| Garden   | Uncapped, but a watered crop is 30–180s and a signature each step. A dedicated gardener can already approach a few hundred crops / day, at full Cred | Plot is a similar item rate with the Cred cap, so it is a Cred nerf and an attention nerf (click when the bed dies, no grow timer) |

Phase 1 turns the jump on for **ores only**. Fish, crops, and loot keep today's caps until their own flag. Craft stays 10/day. Cook stays 5/day. Those sinks will not eat 300 ore an hour. Ore prices on the testnet market should fall. That is accepted for phase 1 so we can watch one family before opening the others.

Cred brake, per skill, per UTC day:

- `cred = max(1, floor(rewardBoinglets / 8))` per banked unit
- first **80** units pay it (`gather_daily.cred_items`)
- after that, items and XP continue, Cred does not
- 80 Lot Pebbles pay 80 Cred. 80 Aetherite would pay 320, and a level-35 character is not banking 80 epics inside the weight table
- four skills fully Cred-capped on commons are 320 Cred/day, plus at most 50 more from the existing party bonus
- Laces do not move

Party bonus and the variety-day bonus key off the **bank**, once, with activity `quarry` / `line` / `plot` / `sweep` added to `PartyActivity`. A tick must not write `activity_day_log`. Variety day is "you worked this skill today", not "you received 300 pebbles".

### Idle Adventures

Leave them alone.

- `adventure_xp` is not Quarry XP. Do not add them, do not spend one to boost the other.
- A running adventure does not block a gather session, and a gather session does not block Dispatch. One is "send the character out for 45 minutes to 3 days". The other is "stand on the block for two to five minutes, then click".
- Adventure loot that overlaps Sweep (`loot-map-scrap`, `loot-sun-shard`, `loot-wind-bell`, `loot-comet-bead`) does not grant Sweep XP. Those stacks land in `inventory` as they do now, already banked, not in the pack.
- Do not add ores or fish to adventure tables to "use the new skills".
- Style luck, slots, pity, and the admin CLI stay as they are.
- Gather mints, if phase 3 exists, must take nonces from the same operator counter adventures use, or the two queues will collide.

### Existing characters

Do not touch `inventory` balances. Stacks people already hold are already banked. The pack starts empty.

Do not lock a node a character can already receive.

Quarry seed, once, when the flag turns on for that owner (lazy, on first `status`, not a batch job):

| Already true                                          | Starting XP              |
| ----------------------------------------------------- | ------------------------ |
| `discovery:ore:ore-aetherite` **or** pickaxe tier ≥ 3 | `xpToReach(35)` = 22,406 |
| `discovery:ore:ore-crystal` **or** pickaxe tier ≥ 2   | `xpToReach(20)` = 4,470  |
| `discovery:ore:ore-emberite` and nothing higher       | `xpToReach(15)` = 2,411  |
| otherwise                                             | 0                        |

Tier 2 today opens both Emberite and Yard Crystal. Seeding those owners at 20 keeps both. Discoveries live in `collection_unlocks`. There is no historical ore-count table; stamina rows are per day and undercount anyone who crafted or sold. Do not try to replay XP from `inventory.qty`.

Line, Plot, and Sweep, when their flags turn on: seed to the level of the best `discovery:fish:*`, `discovery:crop:*`, or `discovery:treasure:*` the character has, using the unlock table in section 1. No discovery means level 1, and the old endpoint stays up until that flag flips, so nobody loses Starfin in the gap. Lot Greens have no discovery row and are level 1 anyway.

While a skill flag is on, that family's old doors return 409 with one line of copy ("Work the face at the quarry."): `/api/mining/challenge`, `/api/mining/confirm`, and the mining mini-game start. Stamina stops mattering because the door is shut. The other families keep both of their old doors until their own flag.

### Phases

**Phase 1, shipped dark.** Quarry, 28-unit pack, Block Vault, XP bar, level and prestige toasts, pack chip, depleted prompt. `GATHER_QUARRY` default `off`. Old mining doors 409 when that flag is on. Migration 0030 present, not applied remotely. No cron, no DO.

**Phase 2.** Line, Plot, Sweep on the same tables, one flag each, with the discovery seed. Retire that family's old doors when its flag turns on.

**Phase 3, shipped dark.** Vault batch mint: one queue row per item id, `client_key` idempotency, queued / submitted / minted / failed-with-refund, shared operator nonce, reserve check, lazy receipts. New lists require `item_mint_balance` and set `escrow='minted'`. Open rows from before 0031 keep `escrow='inventory'`. `GATHER_MINT` default `off`. Still no cron.

**Phase 4, only if a shared face is actually wanted.** One rock, many characters. A DO only if a conditional D1 update loses. Still no cron.

## 7. Open questions

None. The table at the top is the decision list. The marketplace rule is enforced. Turn mint on with `GATHER_MINT=on` after 0030 and 0031 are applied and the operator key is set. Leave the var `off` until then. The route stays 403 and does not move items while it is off. Missing operator config returns 503 and does not debit.
