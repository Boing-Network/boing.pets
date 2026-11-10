# On-chain items (mined ore → Boing game items)

Optional, off by default. When enabled, a player can withdraw mined ore from the off-chain
inventory into a **Boing reference multi-token v1** contract (ERC-1155-style shared item types,
see boing.network `docs/BOING-REFERENCE-MULTI-TOKEN.md`). Every copy of an ore is the same item
type, so a stack of 40 Spark Ore is one balance, not 40 NFTs. Withdrawn items show up in Boing
Express (wallet **Items** section) and on Boing Observer (`/items/<contract>/<item id>`).

## Item ids (permanent: never renumber or reuse)

| Inventory id  | On-chain item id | Name           |
| ------------- | ---------------- | -------------- |
| `ore-pebble`  | 1                | Pasture Pebble |
| `ore-spark`   | 2                | Spark Ore      |
| `ore-crystal` | 3                | Boing Crystal  |

Source of truth: `src/content/onchainItems.ts`. Calldata, storage keys, and storage-word parsing use the published Boing SDK. To add a resource, append a new row with the
next unused id.

## Flow

1. `POST /api/items/withdraw/challenge` `{owner, game_item_id, qty}` (qty 1..100, must be in
   inventory) → a message naming origin, chain, owner, contract, item, quantity, nonce, expiry.
2. The player signs it in Express (`boing_signMessage`, no fee).
3. `POST /api/items/withdraw/confirm` `{id, signature}`. The Worker:
   - verifies the signature and that the operator key is the contract's on-chain `admin`;
   - signs `mint(owner, item_id, qty)` with the operator key on the next operator nonce and
     simulates it (when it is next in line);
   - in one D1 batch, records the signed tx and debits the inventory (only if the stack still
     covers `qty`), then submits the tx.
4. `GET /api/items/onchain?owner=0x…` returns the mapping, in-game and in-wallet quantities
   (read from contract storage) and recent withdrawals. It also settles in-flight mints:
   successful receipt → `minted`; failed receipt, or the operator nonce moving past the tx with
   no receipt → `refunded` (the stack is credited back exactly once). Unresolved mints are
   resubmitted (same signed bytes) at most once a minute.

A definitive RPC rejection at submit refunds immediately. Concurrent withdrawals take distinct
nonces (unique index on in-flight `(contract, admin_nonce)`). No cron is used.

Deposits (on-chain → in-game) are not implemented: once withdrawn, items are ordinary wallet
assets the player can send with Express.

## Enable it

1. Deploy a reference multi-token v1 contract with the operator account as deployer (it becomes
   `admin`), e.g. with the boing CLI: `boing items deploy` (see the boing.network doc). Fund the
   operator with testnet BOING for fees (faucet).
2. Optionally set item metadata hashes: `set_item_metadata(1..3, hash)`.
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
- Mints are capped at 100 per withdrawal and 5 withdrawal challenges per wallet per minute.
- Gas: one mint ≈ 42.8k gas on testnet.
