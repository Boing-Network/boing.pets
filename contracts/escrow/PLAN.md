# Living Pets escrow contract: plan

Status: design only. Nothing here is deployed. `LIVING_PETS_ESCROW_HEX` stays
unset until the contract below is deployed, tested on testnet and signed off.

## What Boing gives us (testnet 6913, SDK 0.5.41)

- **Boing VM only.** No Solidity/EVM. Contracts are raw Boing VM bytecode.
  Toolchain: `tools/boing-vm-assemble.mjs` (mnemonics to hex) and the Rust
  builders in `crates/boing-execution` (how the reference NFT, fungible and
  wBOING templates are written), both in `Boing-Network/boing.network`.
- **Nested `CALL` (0xf1)**: the callee sees `CALLER` = the calling contract,
  return data is copied into memory, and a callee fault reverts the whole tx.
  So the escrow can call the NFT collection as an owner.
- **Native value** (from block 1150): `ContractCallWithValue` carries BOING;
  `CALLVALUE` (0x34), `SELFBALANCE` (0x47) and `NATIVE_TRANSFER` (0xf2, pays
  out, never runs recipient code, so no re-entrancy through payouts).
  Nested `CALL` cannot carry value.
- **Atomic batches**: `buildBatchTransaction` runs several calls under one
  signature, all-or-nothing.
- **Deploys** go through the Quality Gate (`boing_qaCheck`), purpose category
  required; deploys cannot carry value.

## Does the collection need approve / transfer_from?

The reference NFT collection (`boing.reference_nft_collection`, our creature
`0x9aeb…1701` and lineage `0x95cf…dcea` collections) has only `owner_of` (0x03),
`transfer_nft` (0x04, caller must be the owner), `set_metadata_hash` (0x05)
and admin-only `mint_batch` (0x06). **There is no approve / transfer_from.**

We do not need to redeploy the collections for that: the escrow takes
custody instead of an allowance. The seller moves the token to the escrow and
registers the listing in **one atomic batch**:

```
Batch [ ContractCall(collection, transfer_nft(to = ESCROW, token)),
        ContractCall(ESCROW, list(collection, token, price, buyer?)) ]
```

`list` checks `owner_of(token) == ADDRESS` with a nested `CALL`, so a listing
can only exist for a token the escrow really holds, and the batch makes the
lister the account that sent it. A token transferred to the escrow outside a
batch is stranded; only the admin can return it (`rescue`, below).

## Contract interface (selector in the last byte of word 0, 32-byte words)

| Sel  | Name             | Words                           | Who                                   | Effect                                                                                                                                                                         |
| ---- | ---------------- | ------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0x40 | `list`           | collection, token, price, buyer | holder (batched after `transfer_nft`) | Requires escrow owns token and no open listing. Stores seller = `CALLER`, price (wei), optional reserved buyer (0 = anyone). Log `LP_ESCROW_LIST`.                             |
| 0x41 | `cancel`         | collection, token               | seller or admin                       | `CALL collection.transfer_nft(seller, token)`, clears listing. Log `LP_ESCROW_CANCEL`.                                                                                         |
| 0x42 | `buy`            | collection, token               | anyone / reserved buyer, with value   | Requires `CALLVALUE == price`. Clears listing, `CALL transfer_nft(CALLER, token)`, `NATIVE_TRANSFER(seller, price - fee)`, `NATIVE_TRANSFER(feeTo, fee)`. Log `LP_ESCROW_BUY`. |
| 0x43 | `claim`          | collection, token               | reserved buyer, no value              | For price 0 reserved listings: adopt/claim of an operator-held creature. Same as `buy` without payment.                                                                        |
| 0x44 | `listing`        | collection, token               | read                                  | Returns seller, price, buyer (simulate only).                                                                                                                                  |
| 0x45 | `set_fee`        | bps, feeTo                      | admin                                 | Market fee, capped (for example 500 bps).                                                                                                                                      |
| 0x46 | `rescue`         | collection, token, to           | admin                                 | Return a token that has no listing (stranded transfer). Never touches listed tokens.                                                                                           |
| 0x47 | `set_collection` | collection, allowed             | admin                                 | Allow-list of our collections (creatures, lineage artifacts). `list` rejects others.                                                                                           |

Storage: listing slots keyed by `BLAKE3(collection ‖ token)` xor a per-field
tag (seller, price, buyer); admin slot initialised on the first call (lazy
admin, like the reference NFT), so the deployer must touch it right after
deploy, as we did for the lineage collection. Any failed check faults (invalid
jump), which reverts the whole tx including attached value.

**Adoption under the ownership rule** (operator owns until a player adopts or
claims): the operator lists the creature with `price = 0` (or an adoption
price) and `buyer = player`, the player sends `claim` (or `buy`), and the
token moves operator, then escrow, then player, all on chain.

## Tests

1. **Unit, local VM**: a small Rust test crate pinned to a
   `boing.network` git rev that loads our bytecode into the
   `boing-execution` interpreter with a reference NFT collection: list, buy
   (exact value, wrong value faults), cancel, reserved buyer, claim at 0,
   fee split and cap, rescue cannot touch listed tokens, list of a token the
   escrow does not hold faults, non-allow-listed collection faults, admin
   lazy-init, a failing step reverts value.
2. **TS encoders** in `apps/sim-host/src/market/escrow.ts` (calldata for each
   selector plus batch builders), unit-tested with `node:test`; they replace
   today's custodial `WalletCall` plans.
3. **Testnet simulation** before deploy: `boing_qaCheck` (must be `allow`),
   simulate deploy, then deploy to a throwaway instance and run the full
   list, buy, cancel, claim flow with two funded test wallets, checking
   `owner_of` and balances after each step.

## Deploy path

1. PR on this branch: bytecode source (`contracts/escrow/escrow.asm` or the
   Rust builder), tests, encoders, CI.
2. Report back with gas numbers and the throwaway-instance tx evidence.
   **No production deploy without sign-off.**
3. After sign-off: deploy with the operator key, touch to set admin,
   `set_collection` for the two collections, `set_fee`; then set
   `LIVING_PETS_ESCROW_HEX` on Fly and enable list/buy/claim in the market UI.

## Open questions

- Purpose category the Quality Gate expects for an escrow (`dapp` vs `nft`).
- Whether the reference NFT `transfer_nft` faults or silently stops when the
  caller is not the owner (the escrow should check `owner_of` after the
  nested call either way).
- Fee recipient (operator or a treasury account) and the fee rate.
