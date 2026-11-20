import assert from "node:assert/strict";
import { test } from "node:test";
import { createWorld } from "@boing-pets/sim";
import { NftMintStatus, type CreatureNftLinkRow } from "../src/boing/nft-link";
import { buildMarketCatalog } from "../src/market/catalog";
import { escrowInfo, readMarketConfig } from "../src/market/config";
import {
  boingToWei,
  planEscrowPayment,
  planListingDeposit,
  planSettlement,
  weiToBoing,
} from "../src/market/escrow";
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
  assert.equal(escrowInfo(full).mode, "CUSTODIAL");
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

test("escrow plans: deposit, payment and settlement", () => {
  assert.equal(boingToWei("1.5"), 1_500_000_000_000_000_000n);
  assert.equal(boingToWei("abc"), null);
  assert.equal(weiToBoing(1_500_000_000_000_000_000n), "1.5");
  const tokenIdHex = `0x${"00".repeat(31)}07`;
  const deposit = planListingDeposit({
    collectionHex: COLLECTION,
    tokenIdHex,
    escrowHex: ESCROW,
  });
  assert.equal(deposit.kind, "contract_call");
  if (deposit.kind === "contract_call") {
    assert.ok(deposit.calldataHex.includes(ESCROW.slice(2)));
  }
  const pay = planEscrowPayment({ escrowHex: ESCROW, priceWei: 10n ** 18n });
  assert.deepEqual(pay.kind === "transfer" && [pay.toHex, pay.amountWei], [
    ESCROW,
    "1000000000000000000",
  ]);
  const settle = planSettlement({
    collectionHex: COLLECTION,
    tokenIdHex,
    buyerHex: PLAYER,
    sellerHex: OPERATOR,
    priceWei: 10n ** 18n,
  });
  assert.equal(settle.length, 2);
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
