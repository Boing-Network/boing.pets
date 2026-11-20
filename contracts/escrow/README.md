# Living Pets escrow contract

Boing VM bytecode for the marketplace escrow, built by a small Rust assembler
(`src/lib.rs`) and tested on the `boing-execution` interpreter pinned to
`Boing-Network/boing.network@f55e602`. **Not deployed.** Deploying needs
Nico's sign-off.

## Interface

Calldata: selector in the last byte of word 0, then 32-byte words. Token ids
must fit in a u64 (the escrow keys listings by `index << 64 | token`).

| Sel  | Name             | Words                                    | Who                       |
| ---- | ---------------- | ---------------------------------------- | ------------------------- |
| 0x4b | `prepare`        | collection, token                        | current owner (batched)   |
| 0x40 | `list`           | collection, token, price, buyer (or 0)   | pending seller (batched)  |
| 0x41 | `cancel`         | collection, token                        | seller or admin           |
| 0x42 | `buy`            | collection, token (+ value = price)      | anyone, or reserved buyer |
| 0x43 | `claim`          | collection, token                        | reserved buyer, price 0   |
| 0x44 | `listing`        | collection, token → seller, price, buyer | read                      |
| 0x45 | `set_fee`        | bps (≤ 1000), fee account                | admin                     |
| 0x46 | `rescue`         | collection, token, to                    | admin, unlisted only      |
| 0x47 | `set_collection` | collection, allowed                      | admin                     |
| 0x48 | `config`         | → admin, fee bps, fee account            | read                      |
| 0x49 | `set_admin`      | admin                                    | admin                     |
| 0x4a | `collection`     | collection → index, allowed              | read                      |

Listing is one atomic batch:
`[escrow.prepare, collection.transfer_nft(escrow), escrow.list]`. `prepare`
records the caller as pending seller while `owner_of` still says the caller
holds the token; `list` then requires the escrow to hold it and the caller to
be that pending seller. A token sent to the escrow any other way can never be
listed; only the admin can `rescue` it.

Settlement (`buy`, `claim`) clears the listing before any outgoing call,
moves the NFT and checks `owner_of`, then pays with `NATIVE_TRANSFER`: the fee
(`price × bps / 10000`, floored) to the fee account and the rest to the
seller. Defaults: admin = fee account = operator `0xc8b3…f6f8`, 250 bps.
Every failed check faults, which reverts the whole transaction and its value.

## Build and test

Windows Application Control blocks cargo build scripts on nkc-desktop, so run
cargo in WSL there (CI runs it on Ubuntu):

```sh
cargo test --manifest-path contracts/escrow/Cargo.toml
cargo run --manifest-path contracts/escrow/Cargo.toml --bin dump-escrow > contracts/escrow/escrow.bytecode.json
cargo run --manifest-path contracts/escrow/Cargo.toml --bin dump-escrow vectors > contracts/escrow/abi-vectors.json
```

`escrow.bytecode.json` (deploy artifact) and `abi-vectors.json` (golden
calldata the TS encoders in `packages/contract/src/escrow.ts` are tested
against) are committed; tests fail if either drifts from the builder.

## Gas and cost (interpreter, testnet fee = gas × 10⁻⁸ BOING)

| Step                        | Gas     | Fee (BOING) |
| --------------------------- | ------- | ----------- |
| deploy (testnet simulation) | 200,000 | 0.002       |
| list (3-step batch)         | 184,528 | ~0.0018     |
| buy                         | 110,073 | ~0.0011     |
| claim (adopt)               | 96,096  | ~0.0010     |
| cancel                      | 95,903  | ~0.0010     |

## Deploy (after sign-off only)

1. Deploy `escrow.bytecode.json` with the operator key, purpose `dapp`.
2. `set_collection` for the creature (`0x9aeb…1701`) and lineage
   (`0x95cf…dcea`) collections.
3. Set `LIVING_PETS_ESCROW_HEX` on Fly (stdin), redeploy; the listing index
   and the market's Adopt/List/Buy/Cancel turn on.
