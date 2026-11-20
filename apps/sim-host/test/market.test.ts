import assert from "node:assert/strict";
import { test } from "node:test";
import { createWorld } from "@boing-pets/sim";
import { NftMintStatus, type CreatureNftLinkRow } from "../src/boing/nft-link";
import { buildMarketCatalog } from "../src/market/catalog";
import { escrowInfo, readMarketConfig } from "../src/market/config";
import {
  createListingIndex,
  marketTokenKey,
  mintedTokens,
  rpcReadBatch,
  RPC_MAX_BATCH,
  type ReadCall,
} from "../src/market/listings";
import {
  decodeEscrowListing,
  escrowCalldata,
  referenceNftCalldata,
} from "@boing-pets/contract";
import { canAdopt, canList, resolveOwnership } from "../src/market/ownership";
import { readOnlyCors } from "../src/multiplayer/ws-server";

const OPERATOR = `0x${"d6".repeat(32)}`;
const ESCROW = `0x${"e5".repeat(32)}`;
const PLAYER = `0x${"a1".repeat(32)}`;
const COLLECTION = `0x${"c0".repeat(32)}`;

test("ownership: operator until adopted, escrow for every hand-over", () => {
  const base = { operatorHex: OPERATOR, escrowHex: ESCROW, inEscrow: false };
  assert.equal(
    resolveOwnership({ ...base, mint: "UNMINTED", holderHex: null }).ownership,
    "UNMINTED",
  );
  const held = resolveOwnership({
    ...base,
    mint: "CONFIRMED",
    holderHex: null,
  });
  assert.deepEqual(held, { ownership: "OPERATOR", ownerHex: OPERATOR });
  assert.equal(canAdopt(held), true);
  assert.equal(
    resolveOwnership({
      ...base,
      mint: "CONFIRMED",
      holderHex: null,
      inEscrow: true,
    }).ownership,
    "IN_ESCROW",
  );
  const mine = resolveOwnership({
    ...base,
    mint: "CONFIRMED",
    holderHex: PLAYER,
  });
  assert.equal(mine.ownership, "PLAYER");
  assert.equal(canList(mine, PLAYER.toUpperCase().replace("0X", "0x")), true);
  assert.equal(canList(mine, OPERATOR), false);
  assert.equal(canAdopt(mine), false);
});

test("config: browse-only until operator and escrow are both valid", () => {
  assert.equal(escrowInfo(readMarketConfig({})).mode, "DISABLED");
  const half = readMarketConfig({ LIVING_PETS_OPERATOR_HEX: OPERATOR });
  assert.equal(escrowInfo(half).mode, "DISABLED");
  const bad = readMarketConfig({
    LIVING_PETS_OPERATOR_HEX: "nope",
    LIVING_PETS_ESCROW_HEX: ESCROW,
  });
  assert.deepEqual(bad.invalid, ["LIVING_PETS_OPERATOR_HEX"]);
  assert.equal(escrowInfo(bad).mode, "DISABLED");
  const full = readMarketConfig({
    LIVING_PETS_OPERATOR_HEX: OPERATOR.toUpperCase().replace("0X", "0x"),
    LIVING_PETS_ESCROW_HEX: ESCROW,
  });
  assert.equal(full.operatorHex, OPERATOR);
  assert.equal(escrowInfo(full).mode, "CONTRACT");
  assert.equal(escrowInfo(full).feeBps, null);
  assert.equal(
    escrowInfo(full, {
      feeBps: 250,
      feeToHex: OPERATOR,
      refreshedAtMs: 5,
      error: null,
    }).feeBps,
    250,
  );
});

test("catalog: every creature and lineage with live status and genesis flag", () => {
  const { snapshot } = createWorld(1);
  const first = snapshot.creatures[0]!;
  const link: CreatureNftLinkRow = {
    id: first.id,
    worldId: snapshot.world.id,
    creatureId: first.id,
    birthEventId: null,
    collectionHex: COLLECTION,
    tokenIdHex: `0x${"00".repeat(31)}01`,
    chainId: "6913",
    templateArtifact: "t",
    templateVersion: "1",
    mintTxHex: "0xabc",
    status: NftMintStatus.CONFIRMED,
    lastError: null,
    createdAtMs: 0,
    updatedAtMs: 0,
  };
  const catalog = buildMarketCatalog({
    snapshot,
    creatureLinks: [link],
    assetLinks: [],
    config: readMarketConfig({ LIVING_PETS_OPERATOR_HEX: OPERATOR }),
    nowMs: 1,
  });
  const creatures = catalog.assets.filter((a) => a.kind === "CREATURE");
  const lineages = catalog.assets.filter((a) => a.kind === "LINEAGE");
  assert.equal(creatures.length, snapshot.creatures.length);
  assert.equal(lineages.length, snapshot.lineages.length);
  assert.equal(creatures.length, 42);
  assert.ok(
    creatures.every((a) => a.genesis),
    "fresh world: all founders",
  );
  assert.equal(new Set(creatures.map((a) => a.speciesSlug)).size, 21);
  const minted = creatures.find((a) => a.key === `creature:${first.id}`)!;
  assert.equal(minted.ownership, "OPERATOR");
  assert.equal(minted.ownerHex, OPERATOR);
  assert.equal(minted.mintTxHex, "0xabc");
  assert.ok(minted.live?.alive);
  assert.ok(minted.live?.territory);
  const other = creatures.find((a) => a.key !== minted.key)!;
  assert.equal(other.ownership, "UNMINTED");
  assert.ok(lineages.every((l) => (l.live?.livingMembers ?? 0) > 0));
  assert.equal(catalog.escrow.mode, "DISABLED");
  assert.doesNotThrow(() => JSON.stringify(catalog));
});

const word = (hex: string) => hex.slice(2).padStart(64, "0");

test("listing index: reads escrow listings and owners from contract state", async () => {
  const tokenIdHex = `0x${"00".repeat(31)}07`;
  const other = `0x${"00".repeat(31)}08`;
  const huge = `0x01${"00".repeat(31)}`;
  const rows = [
    { status: "CONFIRMED", collectionHex: COLLECTION, tokenIdHex },
    { status: "CONFIRMED", collectionHex: COLLECTION, tokenIdHex: other },
    { status: "CONFIRMED", collectionHex: COLLECTION, tokenIdHex },
    { status: "PENDING", collectionHex: COLLECTION, tokenIdHex: huge },
    { status: "CONFIRMED", collectionHex: null, tokenIdHex: null },
  ];
  assert.equal(mintedTokens(rows).length, 2, "deduped, minted only");
  const seen: ReadCall[][] = [];
  const index = createListingIndex({
    escrowHex: ESCROW,
    tokens: async () => [
      ...mintedTokens(rows),
      { collectionHex: COLLECTION, tokenIdHex: huge },
    ],
    nowMs: () => 42,
    read: async (calls) => {
      seen.push(calls);
      return calls.map((c) => {
        if (c.calldataHex === escrowCalldata.config()) {
          return `0x${word(OPERATOR)}${(250).toString(16).padStart(64, "0")}${word(OPERATOR)}`;
        }
        if (c.calldataHex === escrowCalldata.listing(COLLECTION, 7)) {
          return `0x${word(PLAYER)}${(10n ** 18n).toString(16).padStart(64, "0")}${"0".repeat(64)}`;
        }
        if (c.calldataHex === escrowCalldata.listing(COLLECTION, 8)) {
          return `0x${"0".repeat(192)}`;
        }
        if (c.calldataHex === referenceNftCalldata.ownerOf(7)) {
          return `0x${word(ESCROW)}`;
        }
        if (c.calldataHex === referenceNftCalldata.ownerOf(8)) {
          return `0x${word(PLAYER)}`;
        }
        return null;
      });
    },
  });
  await index.refresh();
  assert.equal(seen[0]!.length, 5, "config + (listing, owner) per u64 token");
  const snap = index.snapshot();
  assert.equal(snap.config?.feeBps, 250);
  assert.equal(snap.refreshedAtMs, 42);
  assert.deepEqual(snap.listings.get(marketTokenKey(COLLECTION, tokenIdHex)), {
    sellerHex: PLAYER,
    priceWei: "1000000000000000000",
    buyerHex: null,
  });
  assert.equal(snap.listings.size, 1);
  assert.equal(snap.owners.get(marketTokenKey(COLLECTION, other)), PLAYER);
  const res = index.response();
  assert.equal(res.feeBps, 250);
  assert.deepEqual(
    res.listings.map((l) => [l.tokenIdHex, l.priceWei]),
    [[tokenIdHex, "1000000000000000000"]],
  );

  // A failed read keeps the last good view and reports the error.
  const failing = createListingIndex({
    escrowHex: ESCROW,
    tokens: async () => [],
    read: async () => [null],
  });
  await failing.refresh();
  assert.equal(failing.snapshot().refreshedAtMs, null);
  assert.match(failing.snapshot().error ?? "", /config read failed/);
});

test("catalog: escrow listings and on-chain owners come from the index", () => {
  const { snapshot } = createWorld(1);
  const [a, b] = snapshot.creatures;
  const link = (id: number, token: string): CreatureNftLinkRow => ({
    id,
    worldId: snapshot.world.id,
    creatureId: id,
    birthEventId: null,
    collectionHex: COLLECTION,
    tokenIdHex: token,
    chainId: "6913",
    templateArtifact: "t",
    templateVersion: "1",
    mintTxHex: "0xabc",
    status: NftMintStatus.CONFIRMED,
    lastError: null,
    createdAtMs: 0,
    updatedAtMs: 0,
  });
  const t1 = `0x${"00".repeat(31)}01`;
  const t2 = `0x${"00".repeat(31)}02`;
  const catalog = buildMarketCatalog({
    snapshot,
    creatureLinks: [link(a!.id, t1), link(b!.id, t2)],
    assetLinks: [],
    config: readMarketConfig({
      LIVING_PETS_OPERATOR_HEX: OPERATOR,
      LIVING_PETS_ESCROW_HEX: ESCROW,
    }),
    listings: new Map([
      [
        marketTokenKey(COLLECTION, t1),
        { sellerHex: OPERATOR, priceWei: "0", buyerHex: PLAYER },
      ],
    ]),
    owners: new Map([
      [marketTokenKey(COLLECTION, t1), ESCROW],
      [marketTokenKey(COLLECTION, t2), PLAYER],
    ]),
    chain: { feeBps: 250, feeToHex: OPERATOR, refreshedAtMs: 9, error: null },
    nowMs: 10,
  });
  const listed = catalog.assets.find((x) => x.key === `creature:${a!.id}`)!;
  assert.equal(listed.ownership, "IN_ESCROW");
  assert.equal(listed.listing?.buyerHex, PLAYER);
  const sold = catalog.assets.find((x) => x.key === `creature:${b!.id}`)!;
  assert.deepEqual([sold.ownership, sold.ownerHex], ["PLAYER", PLAYER]);
  assert.equal(catalog.escrow.mode, "CONTRACT");
  assert.equal(catalog.escrow.feeBps, 250);
  assert.equal(catalog.escrow.listingsAtMs, 9);
  assert.equal(
    decodeEscrowListing(`0x${"0".repeat(192)}`),
    null,
    "zero seller = no listing",
  );
});

test("read-only CORS: allow-listed origins only", () => {
  const allow = (o: string | undefined) =>
    o === "https://boing-pets.vercel.app";
  assert.deepEqual(readOnlyCors(undefined, allow), {
    allowed: true,
    headers: {},
  });
  const ok = readOnlyCors("https://boing-pets.vercel.app", allow);
  assert.equal(ok.allowed, true);
  assert.equal(
    ok.headers["access-control-allow-origin"],
    "https://boing-pets.vercel.app",
  );
  assert.equal(readOnlyCors("https://evil.example", allow).allowed, false);
});

test("rpc read batch: chunks to the RPC's 32-call limit, keeps order", async () => {
  const sizes: number[] = [];
  const read = rpcReadBatch({
    requestBatch: async (calls) => {
      // Like the public testnet RPC: a non-array error past 32 calls.
      if (calls.length > 32) throw new Error("batch exceeds max length 32");
      sizes.push(calls.length);
      return calls.map((c) => {
        const tag = String(c.params?.[1]);
        return tag.endsWith("ff")
          ? { result: { success: false } }
          : { result: { success: true, return_data: tag } };
      });
    },
  });
  const calls = Array.from({ length: 70 }, (_, i) => ({
    contractHex: ESCROW,
    calldataHex: `0x${i === 5 ? "ff" : i.toString(16).padStart(2, "0")}`,
  }));
  const out = await read(calls);
  assert.equal(RPC_MAX_BATCH, 32);
  assert.deepEqual(sizes, [32, 32, 6]);
  assert.equal(out.length, 70);
  assert.equal(out[5], null, "failed call reads as null");
  assert.equal(out[69], "0x45");
});
