/**
 * LPIT item market: TS encoders against the Rust golden vectors, the
 * reconcile plan (lock, fills, return, backing, idempotency, conservation),
 * the runtime item service end to end, and the read-only listing index.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  encodeMultiTokenBalanceOfCalldata,
  encodeMultiTokenTransferCalldata,
} from "@boing-network/boing-sdk";
import {
  ItemSlug,
  LPIT_ITEM_IDS,
  buildItemBuyTx,
  buildItemCancelTx,
  buildItemListTx,
  decodeItemEscrowConfig,
  decodeItemEscrowFill,
  decodeItemEscrowListing,
  escrowSplit,
  itemEscrowCalldata,
  itemTotalWei,
  lpitItemSlug,
  multiTokenCalldata,
  type InventoryView,
} from "@boing-pets/contract";
import { CompressedItemKind } from "../src/boing/taxonomy";
import {
  itemEscrowAccount,
  itemLockKey,
  planItemEscrowReconcile,
  type ChainItemListing,
} from "../src/items/escrow-reconcile";
import { balanceOf } from "../src/items/inventory";
import type { InventoryLotRow } from "../src/items/types";
import { createItemListingIndex } from "../src/market/item-listings";
import type { ReadCall } from "../src/market/listings";
import { MemoryWorldRepository } from "../src/persist/memory-repository";
import { createHostRuntime } from "../src/runtime/host-runtime";

const V = JSON.parse(
  readFileSync(
    new URL("../../../contracts/escrow/item-abi-vectors.json", import.meta.url),
    "utf8",
  ),
) as Record<string, string>;
const COLL = V.collection!;
const ESCROW = V.escrow!;
const BUYER = V.buyer!;
const UNIT = BigInt(V.unit_price!);
const hex = (s: string) => `0x${s}`;

const SELLER_HEX = `0x${"a1".repeat(32)}`;
const BUYER_HEX = `0x${"b0".repeat(32)}`;
const CAROL_HEX = `0x${"ca".repeat(32)}`;
const SELLER = `w:${"a1".repeat(32)}`;
const BUYER_ACCT = `w:${"b0".repeat(32)}`;
const CAROL = `w:${"ca".repeat(32)}`;

test("item escrow calldata matches the Rust builder byte for byte", () => {
  assert.equal(itemEscrowCalldata.prepare(COLL, 2), hex(V.prepare!));
  assert.equal(itemEscrowCalldata.list(COLL, 2, 3, UNIT), hex(V.list!));
  assert.equal(itemEscrowCalldata.buy(7, 3), hex(V.buy!));
  assert.equal(itemEscrowCalldata.cancel(7), hex(V.cancel!));
  assert.equal(itemEscrowCalldata.listing(7), hex(V.listing!));
  assert.equal(itemEscrowCalldata.fill(7, 1), hex(V.fill!));
  assert.equal(itemEscrowCalldata.setFee(250, ESCROW), hex(V.set_fee!));
  assert.equal(itemEscrowCalldata.rescue(COLL, 2, 3, BUYER), hex(V.rescue!));
  assert.equal(
    itemEscrowCalldata.setCollection(COLL, true),
    hex(V.set_collection!),
  );
  assert.equal(itemEscrowCalldata.config(), hex(V.config!));
  assert.equal(itemEscrowCalldata.setAdmin(BUYER), hex(V.set_admin!));
  assert.equal(itemEscrowCalldata.held(COLL, 2), hex(V.held!));
  assert.throws(() => itemEscrowCalldata.list(COLL, 2, 0, UNIT), /positive/);
  assert.throws(() => itemEscrowCalldata.list(COLL, 2, 1, 0n), /positive/);
  assert.throws(() => itemEscrowCalldata.buy(1, 0), /positive/);
  assert.throws(() => itemEscrowCalldata.buy(2n ** 64n, 1), /u64/);
});

test("multi-token calldata matches the SDK", () => {
  const sdk = (v: string | Uint8Array) =>
    typeof v === "string"
      ? v.toLowerCase()
      : `0x${Buffer.from(v).toString("hex")}`;
  assert.equal(
    multiTokenCalldata.balanceOf(SELLER_HEX, 2),
    sdk(encodeMultiTokenBalanceOfCalldata(SELLER_HEX, 2n)),
  );
  assert.equal(
    multiTokenCalldata.transfer(ESCROW, 2, 3),
    sdk(encodeMultiTokenTransferCalldata(ESCROW, 2n, 3n)),
  );
});

test("fee split and totals match the Rust vectors; LPIT ids match the taxonomy", () => {
  const total = itemTotalWei(UNIT, 3);
  assert.equal(total, BigInt(V.total!));
  const split = escrowSplit(total, 250);
  assert.equal(split.feeWei, BigInt(V.fee!));
  assert.equal(split.sellerWei, BigInt(V.seller_amount!));
  assert.throws(() => itemTotalWei(UNIT, 0));
  for (const kind of Object.values(CompressedItemKind)) {
    assert.equal(LPIT_ITEM_IDS[kind.slug], kind.itemKindId);
    assert.equal(lpitItemSlug(kind.itemKindId), kind.slug);
  }
  assert.equal(lpitItemSlug(99), null);
});

test("decoders read listing, fill and config words", () => {
  const w = (n: bigint | number) => BigInt(n).toString(16).padStart(64, "0");
  const listing = `0x${SELLER_HEX.slice(2)}${COLL.slice(2)}${w(2)}${w(UNIT)}${w(5)}${w(3)}${w(1)}${w(2)}`;
  assert.deepEqual(decodeItemEscrowListing(4, listing), {
    id: 4,
    sellerHex: SELLER_HEX,
    collectionHex: COLL,
    itemId: 2,
    unitPriceWei: UNIT,
    listed: 5,
    remaining: 3,
    open: true,
    fills: 2,
  });
  assert.equal(decodeItemEscrowListing(4, `0x${"0".repeat(512)}`), null);
  assert.deepEqual(decodeItemEscrowFill(`0x${BUYER_HEX.slice(2)}${w(2)}`), {
    buyerHex: BUYER_HEX,
    qty: 2,
  });
  assert.equal(decodeItemEscrowFill(`0x${"0".repeat(128)}`), null);
  assert.deepEqual(
    decodeItemEscrowConfig(
      `0x${SELLER_HEX.slice(2)}${w(250)}${SELLER_HEX.slice(2)}${w(9)}`,
    ),
    { adminHex: SELLER_HEX, feeBps: 250, feeToHex: SELLER_HEX, lastId: 9 },
  );
});

test("wallet transactions: list is one atomic batch, buy carries qty × price", () => {
  const list = buildItemListTx({
    itemEscrowHex: ESCROW,
    collectionHex: COLL,
    sellerHex: SELLER_HEX,
    itemId: 2,
    qty: 3,
    unitPriceWei: UNIT,
    itemName: "Calm Potion",
  });
  assert.equal(list.type, "batch");
  assert.ok(list.type === "batch");
  assert.deepEqual(
    list.calls.map((c) => [c.contract, c.calldata]),
    [
      [ESCROW, hex(V.prepare!)],
      [COLL, multiTokenCalldata.transfer(ESCROW, 2, 3)],
      [ESCROW, hex(V.list!)],
    ],
  );
  assert.deepEqual(
    list.access_list.write.sort(),
    [COLL, ESCROW, SELLER_HEX].sort(),
  );
  const buy = buildItemBuyTx({
    itemEscrowHex: ESCROW,
    collectionHex: COLL,
    buyerHex: BUYER,
    sellerHex: SELLER_HEX,
    feeToHex: SELLER_HEX,
    listingId: 7,
    qty: 3,
    unitPriceWei: UNIT,
  });
  assert.ok(buy.type === "contract_call");
  assert.equal(buy.calldata, hex(V.buy!));
  assert.equal(buy.value, V.total);
  const cancel = buildItemCancelTx({
    itemEscrowHex: ESCROW,
    collectionHex: COLL,
    senderHex: SELLER_HEX,
    sellerHex: SELLER_HEX,
    listingId: 7,
  });
  assert.ok(cancel.type === "contract_call");
  assert.equal(cancel.calldata, hex(V.cancel!));
  assert.equal(cancel.value, undefined);
});

// -- reconcile plan ---------------------------------------------------------------

function lpitLot(
  id: number,
  accountId: string,
  slug: string,
  remaining: number,
): InventoryLotRow {
  return {
    id,
    worldId: 1,
    accountId,
    sourceKey: `mint:${id}`,
    itemSlug: slug,
    amount: remaining,
    remaining,
    gainedTick: 0,
    spoilsAtTick: null,
    createdAtMs: 0,
    updatedAtMs: 0,
  };
}

function listing(p: Partial<ChainItemListing>): ChainItemListing {
  return {
    id: 1,
    sellerHex: SELLER_HEX,
    itemId: 2,
    listed: 3,
    remaining: 3,
    open: true,
    fillCount: 0,
    fills: [],
    ...p,
  };
}

function run(lots: InventoryLotRow[], listings: ChainItemListing[]) {
  const plan = planItemEscrowReconcile({
    lots,
    worldId: 1,
    escrowHex: ESCROW,
    listings,
    tick: 10,
    nowMs: 5,
  });
  const byKey = new Map(lots.map((l) => [l.sourceKey, l]));
  for (const row of plan.changed) byKey.set(row.sourceKey, row);
  return { ...plan, lots: [...byKey.values()] };
}

const total = (lots: InventoryLotRow[], slug: string) =>
  lots
    .filter((l) => l.itemSlug === slug)
    .reduce((sum, l) => sum + l.remaining, 0);

test("reconcile: a listing locks the seller's units; fills credit buyers; cancel returns the rest", () => {
  const calm = ItemSlug.POTION_CALM;
  const start = [lpitLot(1, SELLER, calm, 2), lpitLot(2, SELLER, calm, 2)];

  // Listed 3: the seller keeps 1 usable, the lock holds 3.
  const a = run(start, [listing({})]);
  assert.equal(balanceOf(a.lots, SELLER, calm, 10), 1);
  const lock = a.lots.find((l) => l.sourceKey === itemLockKey(ESCROW, 1));
  assert.equal(lock?.accountId, itemEscrowAccount(ESCROW, 1));
  assert.equal(lock?.amount, 3);
  assert.deepEqual(a.status.get(1), { backed: 3, reconciled: true });
  assert.equal(total(a.lots, calm), 4, "units are conserved");

  // Replaying the same chain state changes nothing.
  assert.equal(run(a.lots, [listing({})]).changed.length, 0);

  // Bob buys 2, then the seller cancels the last one.
  const fills = [{ buyerHex: BUYER_HEX, qty: 2 }];
  const b = run(a.lots, [listing({ remaining: 1, fillCount: 1, fills })]);
  assert.equal(balanceOf(b.lots, BUYER_ACCT, calm, 10), 2);
  assert.deepEqual(b.status.get(1), { backed: 1, reconciled: true });
  const c = run(b.lots, [
    listing({ remaining: 1, open: false, fillCount: 1, fills }),
  ]);
  assert.equal(balanceOf(c.lots, SELLER, calm, 10), 2, "1 kept + 1 returned");
  assert.equal(balanceOf(c.lots, BUYER_ACCT, calm, 10), 2);
  assert.equal(c.status.get(1)?.backed, 0);
  assert.equal(total(c.lots, calm), 4);
  assert.equal(
    run(c.lots, [listing({ remaining: 1, open: false, fillCount: 1, fills })])
      .changed.length,
    0,
    "idempotent after close",
  );
});

test("reconcile: listing already-used tokens is only partly backed and buyers get only backed units", () => {
  const calm = ItemSlug.POTION_CALM;
  // On chain the seller had 3, but used 2 in the world: 1 usable.
  const start = [lpitLot(1, SELLER, calm, 1)];
  const a = run(start, [listing({ listed: 3, remaining: 3 })]);
  assert.deepEqual(a.status.get(1), { backed: 1, reconciled: true });
  assert.equal(balanceOf(a.lots, SELLER, calm, 10), 0);
  // Someone buys all 3 on chain anyway: only 1 usable unit moves.
  const fills = [
    { buyerHex: BUYER_HEX, qty: 2 },
    { buyerHex: CAROL_HEX, qty: 1 },
  ];
  const b = run(a.lots, [
    listing({ listed: 3, remaining: 0, open: false, fillCount: 2, fills }),
  ]);
  assert.equal(balanceOf(b.lots, BUYER_ACCT, calm, 10), 1);
  assert.equal(balanceOf(b.lots, CAROL, calm, 10), 0);
  assert.equal(total(b.lots, calm), 1, "no units are created");
});

test("reconcile: a listing seen only after it closed applies lock, fills and return in order", () => {
  const vit = ItemSlug.POTION_VITALITY;
  const start = [lpitLot(1, SELLER, vit, 5)];
  const fills = [{ buyerHex: BUYER_HEX, qty: 1 }];
  const a = run(start, [
    listing({
      itemId: 1,
      listed: 4,
      remaining: 3,
      open: false,
      fillCount: 1,
      fills,
    }),
  ]);
  assert.equal(balanceOf(a.lots, SELLER, vit, 10), 1 + 3);
  assert.equal(balanceOf(a.lots, BUYER_ACCT, vit, 10), 1);
  assert.equal(total(a.lots, vit), 5);
  // Missing fills: no return until every fill is known.
  const b = run(start, [
    listing({ itemId: 1, listed: 4, remaining: 3, open: false, fillCount: 1 }),
  ]);
  assert.equal(b.status.get(1)?.reconciled, false);
  assert.equal(balanceOf(b.lots, SELLER, vit, 10), 1);
  // Unknown item ids are ignored.
  const c = run(start, [listing({ itemId: 42 })]);
  assert.equal(c.changed.length, 0);
});

// -- runtime + index -----------------------------------------------------------------

test("item service: listed units leave the bag and bought units arrive, through the runtime", async () => {
  const repository = new MemoryWorldRepository();
  const runtime = createHostRuntime({
    repository,
    seed: 1,
    nowMs: () => 1_000_000,
    autoFrame: false,
    emit: () => {},
  });
  await runtime.start();
  const worldId = runtime.session.snapshot.world.id;
  await repository.commitItems({
    upsertLots: [{ ...lpitLot(1, SELLER, ItemSlug.RATIONS, 2), worldId }],
    insertInfluenceAccounts: [],
  });
  const items = runtime.items!;
  const bag = async (accountId: string) => {
    const r = await runtime.handleQuery(
      { message: "query.inventory", body: {} },
      { accountId },
    );
    return (
      (r.body as InventoryView).items.find((i) => i.slug === ItemSlug.RATIONS)
        ?.count ?? 0
    );
  };
  const reconcile = (l: ChainItemListing) =>
    items.reconcileItemEscrow({
      worldId,
      tick: runtime.session.snapshot.world.lastTick,
      escrowHex: ESCROW,
      listings: [l],
      nowMs: 2,
    });
  const [first, second] = await Promise.all([
    reconcile(listing({ itemId: 3, listed: 2, remaining: 2 })),
    reconcile(listing({ itemId: 3, listed: 2, remaining: 2 })),
  ]);
  assert.equal(first.get(1)?.backed, 2);
  assert.equal(second.get(1)?.backed, 2, "serialized: the second is a replay");
  assert.equal(await bag(SELLER), 0);
  await reconcile(
    listing({
      itemId: 3,
      listed: 2,
      remaining: 0,
      open: false,
      fillCount: 1,
      fills: [{ buyerHex: BUYER_HEX, qty: 2 }],
    }),
  );
  assert.equal(await bag(BUYER_ACCT), 2);
  assert.equal(
    await items.usableUnits(worldId, BUYER_ACCT, ItemSlug.RATIONS, 0),
    2,
  );
});

test("item index: reads config, listings and new fills in batches, then reconciles", async () => {
  const w = (n: bigint | number) => BigInt(n).toString(16).padStart(64, "0");
  const chain = {
    lastId: 2,
    listings: new Map([
      [1, { remaining: 1, open: true, fills: 1 }],
      [2, { remaining: 0, open: false, fills: 1 }],
    ]),
  };
  const calls: ReadCall[][] = [];
  const reconciled: ChainItemListing[][] = [];
  const index = createItemListingIndex({
    itemEscrowHex: ESCROW,
    collectionHex: COLL,
    nowMs: () => 77,
    read: async (batch) => {
      calls.push(batch);
      return batch.map((c) => {
        if (c.calldataHex === itemEscrowCalldata.config()) {
          return `0x${SELLER_HEX.slice(2)}${w(250)}${SELLER_HEX.slice(2)}${w(chain.lastId)}`;
        }
        for (const [id, l] of chain.listings) {
          if (c.calldataHex === itemEscrowCalldata.listing(id)) {
            return `0x${SELLER_HEX.slice(2)}${COLL.slice(2)}${w(2)}${w(UNIT)}${w(2)}${w(l.remaining)}${w(l.open ? 1 : 0)}${w(l.fills)}`;
          }
          if (c.calldataHex === itemEscrowCalldata.fill(id, 0)) {
            return `0x${BUYER_HEX.slice(2)}${w(id === 1 ? 1 : 2)}`;
          }
        }
        if (c.calldataHex === multiTokenCalldata.balanceOf(SELLER_HEX, 2)) {
          return `0x${w(4)}`;
        }
        if (c.contractHex === COLL) return `0x${w(0)}`;
        return null;
      });
    },
    reconcile: async (listings) => {
      reconciled.push([...listings]);
      return new Map(
        listings.map((l) => [l.id, { backed: l.remaining, reconciled: true }]),
      );
    },
    usable: async (_wallet, slug) => (slug === ItemSlug.POTION_CALM ? 3 : 0),
  });
  await index.refresh();
  assert.equal(calls.length, 3, "config, listings, fills");
  assert.equal(calls[2]!.length, 2, "one new fill per listing");
  assert.equal(reconciled[0]!.length, 2);
  assert.deepEqual(reconciled[0]![1]!.fills, [{ buyerHex: BUYER_HEX, qty: 2 }]);
  const res = await index.response(SELLER_HEX);
  assert.equal(res.feeBps, 250);
  assert.equal(res.refreshedAtMs, 77);
  assert.deepEqual(
    res.listings.map((l) => [l.id, l.name, l.remaining, l.backed]),
    [[1, "Calm Potion", 1, 1]],
    "closed listings are not served",
  );
  const calm = res.wallet?.holdings.find((h) => h.itemId === 2);
  assert.deepEqual(
    calm && [calm.chain, calm.usable, calm.tradable, calm.listed],
    [4, 3, 3, 1],
  );

  // Next refresh: listing 2 is done (closed + reconciled), fill 0 of 1 cached.
  calls.length = 0;
  await index.refresh();
  assert.equal(calls[1]!.length, 1, "only the open listing is read");
  assert.equal(calls[2]!.length, 0, "no fills re-read");

  // A failed read keeps the last good view and reports why.
  const failing = createItemListingIndex({
    itemEscrowHex: ESCROW,
    collectionHex: COLL,
    read: async (batch) => batch.map(() => null),
    reconcile: async () => new Map(),
    usable: async () => 0,
  });
  await failing.refresh();
  assert.match(
    (await failing.response(null)).error ?? "",
    /config read failed/,
  );
});
