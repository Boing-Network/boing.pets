# On-chain items (inventory stacks as Boing game items)

Optional, off by default. When enabled, a player can withdraw a stackable inventory item
from the off-chain inventory into a **Boing reference multi-token v1** contract (ERC-1155-style
shared item types, see boing.network `docs/BOING-REFERENCE-MULTI-TOKEN.md`). Every copy of an
item type is the same, so a stack of 40 Spark Ore is one balance, not 40 NFTs. Withdrawn items
show up in Boing Express (wallet **Items** section) and on Boing Observer
(`/items/<contract>/<item id>`). Pets stay unique NFTs and are not listed here. Species and
discovery collection entries, and cookbook recipe defs, are achievements or recipes rather
than tradable stacks and stay off-chain.

## Item ids (permanent: never renumber or reuse)

Source of truth: `src/content/onchainItems.ts` (calldata, storage keys, and storage-word
parsing use `@boing-network/boing-sdk`). Gaps between bands are reserved for future items in
that category. Ids 50-52 and 60 are reserved permanently and must never be reused.

| Inventory id        | On-chain id | Category | Name                        |
| ------------------- | ----------- | -------- | --------------------------- |
| `ore-pebble`        | 1           | ore      | Pasture Pebble              |
| `ore-spark`         | 2           | ore      | Spark Ore                   |
| `ore-crystal`       | 3           | ore      | Boing Crystal               |
| `fish-ripple`       | 10          | fish     | Ripple Minnow               |
| `fish-boingfin`     | 11          | fish     | Boingfin                    |
| `fish-moonkoi`      | 12          | fish     | Moon Koi                    |
| `loot-pebble`       | 20          | treasure | Lucky Pebble                |
| `loot-map-scrap`    | 21          | treasure | Map Scrap                   |
| `loot-sun-shard`    | 22          | treasure | Sun Shard                   |
| `crop-sprout`       | 30          | crop     | Bounce Sprout               |
| `crop-berry`        | 31          | crop     | Pasture Berry               |
| `crop-moonbloom`    | 32          | crop     | Moonbloom                   |
| `food-sprout-salad` | 40          | food     | Sprout Salad                |
| `food-berry-glaze`  | 41          | food     | Berry Glaze Fish            |
| `food-moon-feast`   | 42          | food     | Moon Feast                  |
| _(reserved)_        | 50?52       | ?        | Race ribbons stay off-chain |
| _(reserved)_        | 60          | ?        | Wood Pick stays off-chain   |
| `tool-pick-iron`    | 61          | material | Iron Pick                   |
| `tool-pick-crystal` | 62          | material | Crystal Pick                |
| `hat-ribbon`        | 70          | cosmetic | Pasture Ribbon              |
| `hat-antenna`       | 71          | cosmetic | Glow Antenna                |
| `hat-stardust`      | 72          | cosmetic | Stardust Halo               |
| `frame-gold`        | 73          | cosmetic | Gold Card Frame             |
| `frame-aurora`      | 74          | cosmetic | Aurora Frame                |
| `furn-cushion`      | 75          | cosmetic | Bounce Cushion              |
| `furn-lamp`         | 76          | cosmetic | Meadow Lamp                 |

Cooked dishes (`food-*`) are the tradable recipe outputs; `recipe-*` ids are cookbook defs
only. Race ribbons (`ribbon-gold`, `ribbon-silver`, `ribbon-bronze`) stay off-chain
achievements so placements cannot be bought; ids 50?52 are reserved and will not be reused.
The starter Wood Pick (`tool-pick-wood`) also stays off-chain: every player starts with a
free one, so withdrawing it would let anyone mint unlimited copies. Id 60 is reserved and
will not be reused. Withdrawal of an equipped cosmetic or a furniture item sitting on a
home plot is rejected until it is unequipped or picked up.

## Flow

1. `POST /api/items/withdraw/challenge` `{owner, game_item_id, qty}` (qty 1..100, must be in
   inventory) → a message naming origin, chain, owner, contract, item, quantity, nonce, expiry.
2. The player signs it in Express (`boing_signMessage`, no fee).
3. `POST /api/items/withdraw/confirm` `{id, signature}`. The Worker:
   - verifies the signature and that the operator key is the contract's on-chain `admin`;
   - reads the operator's on-chain balance of that item id and reuses it when possible:
     - `operator_balance >= qty`: sign and submit a `transfer(player, item_id, qty)` from
       the operator (no mint);
     - `operator_balance == 0`: keep the existing admin-mint path for the full amount;
     - `0 < operator_balance < qty`: transfer `operator_balance` and mint only
       `(qty - operator_balance)` on consecutive operator nonces;
   - simulates the first leg when it is next in line;
   - in one D1 batch, records the signed tx(s) and debits the inventory (only if the stack
     still covers `qty`), then submits the tx(s). The existing `onchain_withdrawals` row
     stores one or two legs as JSON in `signed_tx` (legacy rows remain a raw signed hex)
     and the highest nonce used in `admin_nonce`, so a concurrent withdrawal cannot steal
     the second nonce of a split. No new D1 migration is required.
4. `GET /api/items/onchain?owner=0x…` returns the mapping, in-game and in-wallet quantities
   (read from contract storage) and recent withdrawals. It also settles in-flight
   withdrawals: every leg has a successful receipt → `minted`; a failed receipt, or the
   operator nonce moving past a leg with no receipt, refunds only the undelivered quantity
   exactly once (`refunded` if nothing landed, `minted` with an error if a subset did).
   Unresolved legs are resubmitted (same signed bytes) at most once a minute.

A definitive RPC rejection at submit refunds immediately when no leg has been submitted
yet. Concurrent withdrawals take distinct nonces (unique index on in-flight
`(contract, admin_nonce)`). No cron is used.

## Deposits (wallet to in-game)

v1 of the reference multi-token has no burn and no operator-approval, so a deposit is a
player-signed ransfer of the item to the Pets operator account (the contract dmin).
o == 0 faults. After Express includes the transfer:

1. POST /api/items/deposit/prepare {owner, game_item_id, qty} (qty 1..100) returns an
   Express contract_call object ( ransfer(operator, item_id, qty)). The player signs and
   submits it with oing_sendTransaction.
2. POST /api/items/deposit/confirm {owner, tx_hash}. The Worker:
   - rate-limits to 5 confirms per wallet per minute;
   - loads the receipt and the including block;
   - checks the sender is owner, the call targets this deployment's contract, the tx
     succeeded, and exactly one transfer log moves a mapped item from the owner to the
     operator;
   - credits the off-chain inventory and writes an audit row keyed by x_hash.

A second confirm of the same tx hash returns 409 and does not credit again. Pending
transactions return 425 so the client can retry. GET /api/items/onchain?owner=0x... also
lists recent deposits. No cron is used.

## Enable it

1. Deploy a reference multi-token v1 contract with the operator account as deployer (it becomes
   `admin`), e.g. with the boing CLI: `boing items deploy` (see the boing.network doc). Fund the
   operator with testnet BOING for fees (faucet).
2. Optionally set item metadata hashes with `boing items set-metadata` for each mapped id.
   Do not set metadata on reserved ids 50?52 or 60.
3. Configure the Worker:
   ```sh
   npx wrangler d1 migrations apply boing-pets --remote   # adds 0022_onchain_items
   npx wrangler secret put MULTI_TOKEN_ADMIN_SECRET_KEY    # 32-byte Ed25519 seed, hex
   ```
   and add `"MULTI_TOKEN_CONTRACT": "0x…"` to `vars` in `wrangler.jsonc` (then
   `npm run types:generate`), then deploy.

With either value missing or malformed, `GET /api/items/onchain` answers `{enabled:false}`, the
withdraw routes return 503, and the mining page hides the panel. If the operator key is not the
contract admin, withdrawals pause with 503 and no inventory is touched.

## Trust and limits

- The operator key is a hot testnet key held as a Worker secret; it can mint any quantity of any
  item id in that contract. Use a dedicated contract and a low-balance key; rotate with
  `transfer_admin`.
- Withdrawals are capped at 100 per request and 5 withdrawal challenges per wallet per minute.
- Gas: one transfer or mint ≈ 42.8k gas on testnet. A split withdrawal submits two txs.
