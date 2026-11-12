# Market and cosmetic drops plan

This revision records the day-one design: **player listings are priced in
testnet BOING from the start**, not in Boinglets first. The official shop
catalog stays on the off-chain Boinglets / Sparkles ledger. Implementation
was local-only until the 2026-11-10 go-ahead to apply remote migrations
0025 and 0026 and deploy the testnet market. This document still does not
authorize additional remote schema, a change to `MULTI_TOKEN_CONTRACT`, or
any mainnet change.

Related: `docs/PHASE4.md`, `docs/PHASE4-SPARKLES.md`, `docs/ONCHAIN-ITEMS.md`,
`docs/ROADMAP.md`. Cosmetic item ids 70-76 in `src/content/onchainItems.ts`
must never be renumbered.

Owner intent this plan answers: implement an RNG table for acquiring these
cosmetics, and a player market that sits beside the catalog already shipped
in Phase 4.

## 1. Settlement design (chosen)

Two options were on the table:

1. **Escrow to the operator**, with an atomic, server-verified native BOING
   payment.
2. **An on-chain swap**, if the BPET / dedicated multi-token contract can
   exchange inventory for BOING in one call.

**Choice: option 1.** The dedicated 6913 multi-token contract has no
inventory-for-BOING swap and no marketplace hook. Withdrawn 1155 balances
can move with the existing deposit/withdraw path, but listed inventory in
this market is still the off-chain D1 stack, and the native AMM is for
wBOING pools, not cosmetics or resources. An on-chain swap would be the
wrong tool and would not be atomic with the in-game hold.

How a fill works:

- The buyer signs an economy challenge, then sends one native
  `payload.Transfer` of the **full listing price** (18-decimal base units,
  `parseBoing` / `formatBoing`) to the Pets operator escrow
  (`0xc8b386c732a9f00c7ccd28aa4a8c377634057d6b5604099f4809a8fee58af6f8`).
- The worker verifies inclusion with `boing_getTransactionReceipt` and
  `boing_getBlockByHeight`, then checks sender, payee, and exact amount.
- On a valid receipt the item is released to the buyer in the same confirm,
  and 95% seller / 5% sink payouts are recorded as `pending` in
  `market_payouts`. Amounts are stored as TEXT bigint strings so they are
  not limited to 2^53.
- After a verified fill, the operator automatically sends 95% to the seller
  and 5% to the pasture treasury (`MARKET_SINK_ADDRESS`, the on-chain
  identity of `boing-pets-sink`) as native BOING transfers. Payouts are
  triggered inline with `ctx.waitUntil`, retried on later market requests,
  and can be force-retried by an operator-signed admin endpoint. There is
  **no new cron**. A payment whose challenge expires before confirm sits
  in escrow for a manual refund.

The official catalog, care-claim Boinglets, and the Sparkles faucet are
unchanged. `LISTING_FEE_BPS` stays **500 (5%)** and still sinks to
`boing-pets-sink`. Sparkles remains a testnet faucet premium until the
checkout decision in `PHASE4-SPARKLES.md`. Do not introduce Stripe or
mainnet assets in this work.

A later optional book for withdrawn 1155 balances can still be added, but
it is not day one.

## 2. Sellable set, fees, limits, and anti-wash

### Sellable

- Resources from the on-chain item table (ores, fish, loot, crops, cooked
  food, Iron Pick, Crystal Pick).
- Cosmetics and furniture (ids 70-76 and any later catalog cosmetics).

### Not sellable

- Pets.
- The Wood Pick (`tool-pick-wood`).
- Race ribbons 50-52 (`ribbon-gold`, `ribbon-silver`, `ribbon-bronze`).
- Equipped cosmetics (`pet_cosmetics`) and furniture placed on a home plot
  (`housing_placements`). Pick up or unequip first.

### Keep

- Seller must own the stack; cannot buy your own listing.
- Successful sale takes `LISTING_FEE_BPS = 500` (5%) to `boing-pets-sink`.

### Provisional limits (plan defaults, to retune after playtest)

These are implemented as defaults and must be labeled provisional in the
API and UI:

- Max **8** open listings per owner.
- Listing expiry of **7 days**. Cancel and refund the hold on expiry
  (lazy expiry on read/write; no new cron).
- Minimum hold after a catalog buy, market fill, or drop grant before the
  same item can be listed: **1 UTC day**.
- Velocity cap: at most **10** listing opens and **10** fills per owner per
  UTC day.
- No immediate sell-back: a buyer cannot list the same item back to the
  previous seller for **2 hours**.
- Quantity **1-20**.
- Price band **0.1-100,000** testnet BOING. The 0.1 minimum is a total
  listing price chosen so the 5% fee (0.005 BOING) is about 11.9 times
  the two payout network fees measured on official testnet on 2026-11-10
  (native Transfer `gas_used=21000`, `execution_gas_fee_bps=100`, fee
  0.00021 BOING each, 0.00042 BOING for seller + sink, payouts untipped).
  The 95/5 split is unchanged. Because 100% of the received price is
  paid out, this minimum does **not** replenish operator gas. The 5%
  lands on the pasture treasury; payout fees are subsidized from
  operator surplus. New purchases pause when that surplus would fall
  below a 0.01 BOING floor after budgeting 0.00084 BOING per pending or
  new payout leg (4x the measured fee). Do not seize seller proceeds or
  silently reduce payouts to pay gas.

### Anti-wash, honestly scoped

One-wallet-one-pet makes linked-wallet detection weak. The fee, own-list
ban, hold, velocity caps, and no immediate sell-back are the practical
controls. Server-side flags (same-item round trips, tight price loops) can
hide a listing and queue a manual review; they should not silently
confiscate items.

## 3. Cosmetic RNG drop table (ids 70-76)

Drops grant **off-chain inventory first**. Withdraw to the dedicated 1155
contract remains optional and uses the existing withdraw path.

This is a **two-step** table: a source event may or may not "hit" the table;
a hit then rolls one of the seven cosmetics.

### Tiers and odds, per hit

Odds are expressed per successful table hit and sum to 100%.

| Tier     | Item           | Id  | Odds |
| -------- | -------------- | --- | ---- |
| Common   | `hat-ribbon`   | 70  | 40%  |
| Uncommon | `hat-antenna`  | 71  | 22%  |
| Uncommon | `furn-cushion` | 75  | 18%  |
| Rare     | `furn-lamp`    | 76  | 10%  |
| Rare     | `frame-gold`   | 73  | 6%   |
| Premium  | `hat-stardust` | 72  | 2.8% |
| Premium  | `frame-aurora` | 74  | 1.2% |

Working fractions for an auditable integer roll, modulo 1000: 400, 220, 180,
100, 60, 28, 12.

### Pity

- After **40** dry hits with no rare or better, the next hit is at least rare
  (76 or 73, weighted 10:6).
- After **80** hits with no premium, the next hit is premium (72 or 74,
  weighted 28:12).
- Soft pity: from hit 30 without a rare+, slightly raise rare/premium weight;
  from hit 60 without a premium, slightly raise 72/74. Exact curve is an
  implementation detail and must be unit-tested.
- Pity counters are per owner, stored server-side, and reset when the
  corresponding tier actually drops (including a forced pity drop).

### Caps

- Max **1 premium** (72 or 74) per owner per UTC week.
- Max **5 cosmetic drops** (hits that grant an item) per owner per UTC day.
- If a roll would break a cap, downgrade to the next eligible lower tier and
  do not reset premium pity.

### Auditable RNG

Do not use `Math.random`. Follow the existing `traits()` pattern:

```
blake3("boing.pets:drop:v1:" + owner + ":" + source + ":" + day + ":" + nonce)
```

The worker derives a 32-bit integer, reduces modulo 1000, and writes an audit
row (`drop_rolls`) with owner, source, UTC day, nonce, raw digest (or its hex),
table version, pity state before/after, granted item id, and quantity (always
1 for v1). Players can later fetch their own history. Operators can recompute
the digest and prove the row.

### Sources (plan default, now implemented)

- One roll opportunity per care type per owner per UTC day.
- Sources: `feed`, `checkin`, `play`, `groom`. Hatch is not a source.
- Each opportunity has a **15% hit chance** to consult the table (this roll
  is also blake3-derived, not `Math.random`).
- A typical daily-care player doing 4 cares/day therefore gets about
  `4 * 7 * 0.15 = 4.2` table hits per week.

Expected grants per such player per week, before pity and caps (4.2 hits):

| Item           | Id  | Expected / week |
| -------------- | --- | --------------- |
| `hat-ribbon`   | 70  | 1.68            |
| `hat-antenna`  | 71  | 0.92            |
| `furn-cushion` | 75  | 0.76            |
| `furn-lamp`    | 76  | 0.42            |
| `frame-gold`   | 73  | 0.25            |
| `hat-stardust` | 72  | 0.12            |
| `frame-aurora` | 74  | 0.05            |

Pity slightly raises rare and premium counts; the weekly premium cap of 1
clips the tail. Sparkles-catalog items 72 and 74 appear on this table, so a
dedicated player does not _need_ the Sparkles faucet to complete a
collection, but the odds stay low.

A drop awarded inside an existing care confirm writes `drop_rolls` and is
returned on that confirm response so the client can show a reveal.

## 4. Migrations, endpoints, UI, and implementation order

### Migrations (`0025_market_boing_and_drops.sql`)

- Rebuild `marketplace_listings` with `price_boing TEXT`, nullable
  `price_boinglets`, `expires_at`, and an `expired` status. Legacy
  Boinglets-priced rows cannot be filled until they are relisted in BOING.
- `inventory_acquisitions`: hold and anti-wash provenance.
- `drop_rolls` and `drop_pity`.
- `market_payments` and `market_payouts`.

Apply this migration **locally only**. No remote migration is part of this
delivery. Do not deploy the market worker until that is separately
approved.

### Endpoints (additive)

- `GET /api/drops/table` ? public odds, pity rules, caps, table version.
- `GET /api/drops/history?owner=` ? that owner's rolls only.
- Existing `GET /api/marketplace` returns open listings plus
  `rules` (provisional caps and the escrow settlement summary).
- List/buy challenges use `price_boing`. A buy challenge includes the
  prepared escrow transfer; confirm requires the included `tx_hash`.

Dedicated `POST /api/drops/challenge` + `confirm` are reserved for a later
source that is not already inside a care confirm.

### UI

- Market panel: testnet BOING prices, list form, expiry, open-listing cap,
  hold-time hint, unchanged 5% fee copy, public drop table.
- Reveal notice on a care-confirm hit.
- Catalog remains Boinglets / Sparkles.

## 5. Open decisions, now listed as provisional

The following used the plan defaults and stay labeled provisional until a
playtest retune:

1. **Drop sources.** Daily care lottery as implemented (`feed`, `checkin`,
   `play`, `groom`, 15% hit). Login streaks, pasture events, or a crafted
   "mystery box" sink are not in v1.
2. **Sparkles items on the table.** `hat-stardust` (72) and `frame-aurora`
   (74) do drop from the free table, at the low odds above.
3. **Pity visibility.** The public table is shown; a personal pity meter is
   not shown in v1.
4. **Player-market currency.** Testnet BOING from day one (this revision).
   Catalog stays Boinglets / Sparkles.
5. **Expiry length.** 7 days (not 14).
6. **Placed furniture.** Must pick up before listing. No "listed in place"
   lock in v1.
7. **Exact wash thresholds.** 1 UTC day hold, 2-hour sell-back, 8 open
   listings, 10 opens and 10 fills per UTC day, and the 0.1-100,000 BOING
   price band. Retune after playtest.
8. **Escrow payouts.** Sent automatically after a fill. Status is
   pending, sent, confirmed, or failed. No new cron. The 5% treasury
   address is `MARKET_SINK_ADDRESS`.

The 2026-11-10 go-ahead covers applying remote migrations 0025 and 0026
and deploying this market. It does not authorize later schema, a change
to `MULTI_TOKEN_CONTRACT`, or mainnet.

## Market filters and item rarity

The Market Stall overlay and the `/market` desk share the same listing filters:
search (name or item id), category (ores, fish, loot, crops, food, tools,
cosmetics, furniture), rarity (common through legendary), price min/max, sort
(newest, ending soon, price, name), my listings, I can afford (when a buyer
balance is known), minimum quantity, and clear-all. `/api/marketplace` accepts
the same query params (`q`, `category`, `rarity`, `min_price`, `max_price`,
`sort`, `mine`, `affordable`, `min_qty`, `buyer_balance`, `owner`) and returns
enriched listings with `name`, `category`, and `rarity`.

Care-drop "premium" items are labeled **Legendary** in the rarity system. The
pity and weekly cap behavior is unchanged. The full item table, new drop
weights, and prepared (not broadcast) metadata live in `docs/ITEMS.md` and
`docs/metadata/items/`.
