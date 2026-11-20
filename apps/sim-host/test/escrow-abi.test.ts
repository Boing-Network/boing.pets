import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  encodeReferenceOwnerOfCalldataHex,
  encodeReferenceTransferNftCalldataHex,
} from "@boing-network/boing-sdk";
import {
  ESCROW_DEFAULT_FEE_BPS,
  boingToWei,
  buildEscrowBuyTx,
  buildEscrowCancelTx,
  buildEscrowClaimTx,
  buildEscrowListTx,
  decodeEscrowConfig,
  decodeEscrowListing,
  escrowCalldata,
  escrowSplit,
  referenceNftCalldata,
  weiToBoing,
} from "@boing-pets/contract";

/** Golden vectors printed by the Rust builder (`dump-escrow vectors`). */
const V = JSON.parse(
  readFileSync(
    new URL("../../../contracts/escrow/abi-vectors.json", import.meta.url),
    "utf8",
  ),
) as Record<string, string>;
const COLL = V.collection!;
const ESCROW = V.escrow!;
const BUYER = V.buyer!;
const PRICE = BigInt(V.price!);
const hex = (s: string) => `0x${s}`;

test("escrow calldata matches the Rust builder byte for byte", () => {
  assert.equal(escrowCalldata.prepare(COLL, 7), hex(V.prepare!));
  assert.equal(escrowCalldata.list(COLL, 7, PRICE), hex(V.list!));
  assert.equal(escrowCalldata.list(COLL, 7, 0n, BUYER), hex(V.list_reserved!));
  assert.equal(escrowCalldata.cancel(COLL, 7), hex(V.cancel!));
  assert.equal(escrowCalldata.buy(COLL, 7), hex(V.buy!));
  assert.equal(escrowCalldata.claim(COLL, 7), hex(V.claim!));
  assert.equal(escrowCalldata.listing(COLL, 7), hex(V.listing!));
  assert.equal(escrowCalldata.setFee(250, ESCROW), hex(V.set_fee!));
  assert.equal(escrowCalldata.rescue(COLL, 7, BUYER), hex(V.rescue!));
  assert.equal(
    escrowCalldata.setCollection(COLL, true),
    hex(V.set_collection!),
  );
  assert.equal(escrowCalldata.config(), hex(V.config!));
  assert.equal(escrowCalldata.setAdmin(BUYER), hex(V.set_admin!));
  assert.equal(escrowCalldata.collection(COLL), hex(V.collection_lookup!));
  // Token ids as 32-byte hex words encode the same as numbers.
  assert.equal(
    escrowCalldata.buy(COLL, `0x${"00".repeat(31)}07`),
    escrowCalldata.buy(COLL, 7n),
  );
});

test("reference NFT calldata matches the SDK", () => {
  const token = `0x${"00".repeat(31)}07`;
  assert.equal(
    referenceNftCalldata.transfer(ESCROW, token),
    encodeReferenceTransferNftCalldataHex(ESCROW, token).toLowerCase(),
  );
  assert.equal(
    referenceNftCalldata.ownerOf(token),
    encodeReferenceOwnerOfCalldataHex(token).toLowerCase(),
  );
});

test("encoders refuse what the contract would fault on", () => {
  assert.throws(() => escrowCalldata.buy(COLL, 1n << 64n), /u64/);
  assert.throws(() => escrowCalldata.buy("0x1234", 1), /Boing account/);
  assert.throws(() => escrowCalldata.list(COLL, 1, 1n << 128n), /u128/);
  assert.throws(() => escrowCalldata.list(COLL, 1, -1n), /u128/);
  assert.throws(() => escrowCalldata.setFee(1001, ESCROW), /0\.\.1000/);
  assert.throws(() => escrowCalldata.setFee(2.5, ESCROW), /bps/);
  assert.doesNotThrow(() => escrowCalldata.setFee(1000, ESCROW));
});

test("fee split matches the contract: 2.5% floored, nothing lost", () => {
  const { feeWei, sellerWei } = escrowSplit(PRICE);
  assert.equal(feeWei.toString(), V.fee);
  assert.equal(sellerWei.toString(), V.seller_amount);
  assert.equal(ESCROW_DEFAULT_FEE_BPS, 250);
  for (const p of [0n, 1n, 39n, 40n, 399n, 7_000_000_003n, 10n ** 30n]) {
    const s = escrowSplit(p);
    assert.equal(s.feeWei + s.sellerWei, p);
    assert.equal(s.feeWei, (p * 250n) / 10_000n);
  }
  assert.deepEqual(escrowSplit(39n), { feeWei: 0n, sellerWei: 39n });
  assert.deepEqual(escrowSplit(40n), { feeWei: 1n, sellerWei: 39n });
  assert.equal(escrowSplit(100n, 1000).feeWei, 10n);
});

test("return decoders: listing and config", () => {
  const w = (h: string) => h.slice(2).padStart(64, "0");
  const listing = decodeEscrowListing(
    `0x${w(ESCROW)}${PRICE.toString(16).padStart(64, "0")}${w(BUYER)}`,
  );
  assert.deepEqual(listing, {
    sellerHex: ESCROW,
    priceWei: PRICE,
    buyerHex: BUYER,
  });
  assert.equal(decodeEscrowListing("0x"), null);
  assert.deepEqual(
    decodeEscrowConfig(`0x${w(BUYER)}${"fa".padStart(64, "0")}${w(ESCROW)}`),
    { adminHex: BUYER, feeBps: 250, feeToHex: ESCROW },
  );
});

test("wallet transactions for list, buy, adopt and cancel", () => {
  const SELLER = `0x${"a1".repeat(32)}`;
  const target = { escrowHex: ESCROW, collectionHex: COLL, tokenId: 7 };
  const list = buildEscrowListTx({
    ...target,
    sellerHex: SELLER,
    priceWei: PRICE,
  });
  assert.equal(list.type, "batch");
  if (list.type !== "batch") return;
  assert.deepEqual(
    list.calls.map((c) => [c.contract, c.calldata]),
    [
      [ESCROW, hex(V.prepare!)],
      [COLL, referenceNftCalldata.transfer(ESCROW, 7)],
      [ESCROW, hex(V.list!)],
    ],
    "prepare, transfer into escrow, list: one atomic batch",
  );
  assert.ok(
    list.calls.every((c) => c.value == null),
    "no value when listing",
  );
  assert.deepEqual(list.access_list.write, [SELLER, ESCROW, COLL]);

  const buy = buildEscrowBuyTx({
    ...target,
    buyerHex: BUYER,
    sellerHex: SELLER,
    feeToHex: SELLER,
    priceWei: PRICE,
  });
  assert.equal(buy.type, "contract_call");
  if (buy.type !== "contract_call") return;
  assert.equal(buy.calldata, hex(V.buy!));
  assert.equal(buy.value, PRICE.toString());
  assert.deepEqual(buy.access_list.read, [BUYER, ESCROW, COLL, SELLER]);

  const free = buildEscrowBuyTx({
    ...target,
    buyerHex: BUYER,
    sellerHex: SELLER,
    feeToHex: SELLER,
    priceWei: 0n,
  });
  assert.equal(free.type === "contract_call" && free.value, undefined);

  const claim = buildEscrowClaimTx({ ...target, playerHex: BUYER });
  assert.equal(claim.type === "contract_call" && claim.calldata, hex(V.claim!));
  assert.equal(claim.type === "contract_call" && claim.value, undefined);

  const cancel = buildEscrowCancelTx({
    ...target,
    senderHex: SELLER,
    sellerHex: SELLER,
  });
  assert.equal(
    cancel.type === "contract_call" && cancel.calldata,
    hex(V.cancel!),
  );
  assert.throws(
    () => buildEscrowListTx({ ...target, sellerHex: "nope", priceWei: 1n }),
    /Boing account/,
  );
});

test("BOING amounts", () => {
  assert.equal(boingToWei("1.5"), PRICE);
  assert.equal(boingToWei("abc"), null);
  assert.equal(boingToWei("1.0000000000000000001"), null);
  assert.equal(weiToBoing(PRICE), "1.5");
  assert.equal(weiToBoing(0n), "0");
});
