# Market and cosmetic drops plan

Design only. This document does not authorize a migration, a deploy, or a
mainnet change. Any later implementation stays on **testnet BOING** and the
existing off-chain Boinglets ledger until a separate go-ahead.

Related: `docs/PHASE4.md`, `docs/PHASE4-SPARKLES.md`, `docs/ONCHAIN-ITEMS.md`,
`docs/ROADMAP.md`. Cosmetic item ids 70-76 in `src/content/onchainItems.ts`
must never be renumbered.

Owner intent this plan answers: implement an RNG table for acquiring these
cosmetics, then (later) a player market that can sit beside the catalog
already shipped in Phase 4.

## 1. Market model options

| Option                                           | What it is                                                                                                                                                                                                                        | Pros                                                                                                                          | Cons                                                                                                                            |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| A. Keep the off-chain Boinglets book             | Extend today's catalog + player listings priced in Boinglets. Fees already sink 5% to `boing-pets-sink`.                                                                                                                          | Already live, simple UX, no gas, no wallet friction for items that still live in D1 inventory.                                | Listings are not portable on-chain; dispute/audit story is app-level.                                                           |
| B. On-chain ERC-1155 order book in testnet BOING | Players withdraw 70-76, then list and fill in a testnet-BOING book.                                                                                                                                                               | Matches "real" item ownership; transferable; easier to audit fills.                                                           | High friction for casual players; needs escrow, approvals, indexer; testnet BOING has no real value, so liquidity will be thin. |
| C. Hybrid (recommended)                          | Keep in-game Boinglets listings for inventory that has not been withdrawn. Add an optional testnet-BOING book later, only for withdrawn 1155 balances. RNG drops always grant off-chain inventory first; withdraw stays optional. | Meets current players where they are; leaves a path for on-chain trading without forcing it; preserves the 5% Boinglets sink. | Two books to document and police; must block listing the same stack in both places.                                             |
| D. Auctions                                      | Timed English or Dutch auctions in Boinglets (or BOING).                                                                                                                                                                          | Price discovery for rare frames.                                                                                              | More UI and expiry jobs; overkill while supply is tiny.                                                                         |
| E. Direct escrow only                            | Peer-to-peer escrow, no public book.                                                                                                                                                                                              | Simple anti-wash if both sides confirm.                                                                                       | Poor discovery; already wanted as a later polish, not the primary market.                                                       |

**Recommendation: C.** Do not introduce Stripe or mainnet assets in this work.
Do not move the live `LISTING_FEE_BPS = 500` (5%) fee. Sparkles stays a
testnet faucet premium until the Sparkles checkout decision in
`PHASE4-SPARKLES.md`.

## 2. Listing rules, fees, limits, and anti-wash

Start from the Phase 4 rules already in `src/economy.ts` / `worker/economy.ts`
and tighten them when player-to-player volume grows.

### Keep

- Cosmetics and furniture from the code-defined catalog only (ids 70-76 and
  any later catalog cosmetics). No gameplay advantage items.
- Seller must own the stack; quantity 1-20; price 5-100,000 Boinglets.
- Cannot buy your own listing.
- Successful sale takes `LISTING_FEE_BPS = 500` (5%) to `boing-pets-sink`.
- Equipped items cannot be listed. Furniture placed on a home plot cannot be
  listed until picked up (open decision if a "placed but listed" lock is
  better).

### Add

- Max **8** open listings per owner.
- Listing expiry of **7 days** (see open decisions for 14). The roadmap already
  wanted decay jobs; cancel and refund the hold on expiry.
- Minimum hold after a catalog buy or a drop grant before the same item can be
  listed: **1 UTC day** (or 2 hours if that feels too harsh in playtest).
- Velocity cap: at most **10** listing opens and **10** fills per owner per
  UTC day.
- No immediate sell-back: a buyer cannot list the same item back to the
  previous seller for **2 hours**.
- A withdrawn 1155 balance cannot also be listed on the Boinglets book (and
  the later on-chain book is the only book for withdrawn items).

### Anti-wash, honestly scoped

One-wallet-one-pet makes linked-wallet detection weak. The fee, own-list ban,
hold, velocity caps, and no immediate sell-back are the practical controls.
Server-side flags (same-item round trips, tight price loops) can hide a
listing and queue a manual review; they should not silently confiscate items.

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

### Sources and expected drops per week

Exact sources are an open decision. A concrete default to plan around:

- One roll opportunity per care type per owner per UTC day.
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
clips the tail. Sparkles-catalog items 72 and 74 appearing on this table is
an open decision; the numbers above assume they do, so a dedicated player
does not _need_ the Sparkles faucet to complete a collection, but the odds
stay low.

## 4. Migrations, endpoints, UI, and implementation order

### Migrations (propose 0025+, do not apply in this change)

- `drop_rolls`: audit log described above.
- `drop_pity`: per-owner counters and last-premium / last-drop timestamps.
- Optional listing upgrades: `expires_at`, hold/velocity helpers, unique
  open-listing cap enforceable in SQL.

No remote migration is part of this plan's delivery.

### Endpoints (additive)

- `GET /api/drops/table` ? public odds, pity rules, caps, table version.
- `POST /api/drops/challenge` + `POST /api/drops/confirm` ? signed, same
  pattern as economy confirm, used when a source is not already inside an
  existing care confirm.
- `GET /api/drops/history?owner=` ? that owner's rolls only.
- Existing `GET /api/marketplace` and economy confirm stay; list/buy gain
  the new rule checks.

If a drop is awarded inside an existing care confirm, still write `drop_rolls`
and return the grant in that confirm response so the client can show a reveal.

### UI

- Collection log (owned, equipped, withdrawn, drop history).
- Reveal modal on a hit (item art, tier, pity teaser only if we decide to
  show pity).
- Market panel: expiry countdown, open-listing cap, hold-time hint, unchanged
  5% fee copy.
- Later: a withdrawn-item BOING book, clearly labeled testnet.

### Implementation order

1. Pure RNG module + pity/caps + golden-vector tests (no API yet).
2. Migrations locally, then endpoints and audit rows. Stop before any remote
   migration until approved.
3. Reveal UI + collection log, fixture-only E2E (do not mutate the real
   player's inventory).
4. Listing-rule upgrades (cap, expiry, holds, velocity, sell-back).
5. Optional testnet-BOING book for withdrawn 1155s, behind a flag, after the
   in-game loop feels fair.

## 5. Open decisions

1. **Drop sources.** Daily care lottery as sketched, or also login streaks,
   pasture events, or a crafted "mystery box" sink?
2. **Sparkles items on the table.** Should `hat-stardust` (72) and
   `frame-aurora` (74) drop from the free table, or stay Sparkles-catalog
   exclusive?
3. **Pity visibility.** Show a pity meter, a soft hint, or nothing?
4. **Player-market currency.** Boinglets only for now (recommended), or also
   price some listings in testnet BOING / Sparkles?
5. **Expiry length.** 7 days vs 14 days.
6. **Placed furniture.** Must pick up before listing, or allow a locked
   "listed in place" state?
7. **Exact wash thresholds.** 1 UTC day vs 2 hour hold; the 8 / 10 / 2-hour
   numbers above are starting points and should be retuned after a playtest.

Nothing in this document should be taken as permission to apply a remote
migration, change `MULTI_TOKEN_CONTRACT`, or deploy.
