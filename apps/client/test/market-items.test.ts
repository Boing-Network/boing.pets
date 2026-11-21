import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  MarketItemHolding,
  MarketItemListing,
  MarketMintInfo,
} from "@boing-pets/contract";
import { creatureActivity, tickClock } from "../src/hud/activity";
import { mintedText } from "../src/hud/ItemsSection";
import {
  DEFAULT_SERVER,
  itemsUrl,
  marketPostUrl,
} from "../src/market/catalog-source";
import {
  holdingBlock,
  itemListingOffer,
  mintOffer,
  parseQty,
  readyToList,
  visibleHoldings,
} from "../src/market/item-market";

const SELLER = `0x${"a1".repeat(32)}`;
const ME = `0x${"b0".repeat(32)}`;

const listing = (p: Partial<MarketItemListing> = {}): MarketItemListing => ({
  id: 1,
  sellerHex: SELLER,
  itemId: 2,
  itemSlug: "potion.calm",
  name: "Calm Potion",
  unitPriceWei: "1000",
  listed: 3,
  remaining: 2,
  backed: 2,
  reconciled: true,
  ...p,
});

test("items URL follows the catalog server and adds the wallet", () => {
  assert.equal(
    itemsUrl("", undefined, null),
    `${DEFAULT_SERVER}/market/v1/items`,
  );
  assert.equal(
    itemsUrl("?server=http://127.0.0.1:8787", undefined, ME),
    `http://127.0.0.1:8787/market/v1/items?wallet=${ME}`,
  );
});

test("item listing offers: buy only fully backed, reconciled listings", () => {
  assert.deepEqual(itemListingOffer(listing(), ME), { kind: "BUY", max: 2 });
  assert.deepEqual(itemListingOffer(listing(), null), { kind: "CONNECT" });
  assert.deepEqual(itemListingOffer(listing(), SELLER.toUpperCase()), {
    kind: "CANCEL",
  });
  assert.deepEqual(itemListingOffer(listing({ backed: 1 }), ME), {
    kind: "UNBACKED",
    backed: 1,
  });
  assert.deepEqual(itemListingOffer(listing({ reconciled: false }), ME), {
    kind: "PENDING",
  });
});

test("quantities are whole numbers within the limit", () => {
  assert.equal(parseQty("2", 2), 2);
  assert.equal(parseQty(" 1 ", 2), 1);
  for (const bad of ["0", "3", "1.5", "-1", "", "x"]) {
    assert.equal(parseQty(bad, 2), null, bad);
  }
});

test("holdings explain why nothing is tradable", () => {
  const h = (p: Partial<MarketItemHolding>): MarketItemHolding => ({
    itemId: 2,
    itemSlug: "potion.calm",
    name: "Calm Potion",
    chain: 2,
    usable: 2,
    tradable: 2,
    listed: 0,
    ...p,
  });
  assert.equal(holdingBlock(h({})), null);
  assert.match(holdingBlock(h({ tradable: 0, chain: 0 }))!, /None/);
  assert.match(
    holdingBlock(h({ tradable: 0, usable: 0 }))!,
    /Used in the world/,
  );
  assert.match(holdingBlock(h({ tradable: 0, chain: null }))!, /Couldn't/);
});

const holding = (p: Partial<MarketItemHolding> = {}): MarketItemHolding => ({
  itemId: 4,
  itemSlug: "resource.clover",
  name: "Clover",
  chain: 0,
  usable: 0,
  tradable: 0,
  listed: 0,
  unminted: 3,
  minting: 0,
  ...p,
});

const mintInfo = (p: Partial<MarketMintInfo> = {}): MarketMintInfo => ({
  enabled: true,
  minQty: 1,
  maxQty: 20,
  maxRequestsPerDay: 3,
  requestsLeft: 3,
  note: "",
  ...p,
});

test("mint offers: unminted units can be minted, within the server's terms", () => {
  assert.deepEqual(mintOffer(holding(), mintInfo()), { kind: "MINT", max: 3 });
  assert.deepEqual(mintOffer(holding({ unminted: 50 }), mintInfo()), {
    kind: "MINT",
    max: 20,
  });
  assert.deepEqual(mintOffer(holding({ unminted: 0 }), mintInfo()), {
    kind: "NONE",
  });
  assert.deepEqual(mintOffer(holding(), undefined), { kind: "NONE" });
  assert.equal(
    mintOffer(holding(), mintInfo({ requestsLeft: 0 })).kind,
    "BLOCKED",
  );
  assert.deepEqual(
    mintOffer(holding(), mintInfo({ enabled: false, note: "off" })),
    { kind: "BLOCKED", reason: "off" },
  );
  assert.match(holdingBlock(holding())!, /Not minted yet/);
  assert.match(holdingBlock(holding({ minting: 2 }))!, /Minting/);
});

test("only holdings with something in them are shown; Mint & List waits for tradable units", () => {
  const rows = [
    holding({ unminted: 0 }),
    holding({ itemId: 5, unminted: 1 }),
    holding({ itemId: 6, unminted: 0, listed: 2 }),
    holding({ itemId: 7, unminted: undefined, chain: 1 }),
  ];
  assert.deepEqual(
    visibleHoldings(rows).map((h) => h.itemId),
    [5, 6, 7],
  );
  const res = (tradable: number) =>
    ({ wallet: { hex: ME, holdings: [holding({ tradable })] } }) as never;
  assert.equal(readyToList(res(1), 4, 2), null);
  assert.equal(readyToList(res(2), 4, 2)?.itemId, 4);
  assert.equal(readyToList(null, 4, 1), null);
});

test("mint endpoints live on the catalog server", () => {
  assert.equal(
    marketPostUrl(
      "?server=http://127.0.0.1:8787",
      undefined,
      "/market/v1/items/mint",
    ),
    "http://127.0.0.1:8787/market/v1/items/mint",
  );
});

test("bag shows how many units are minted; activity lines are per creature, newest first", () => {
  assert.equal(mintedText({ count: 3, minted: 0 }), "");
  assert.equal(mintedText({ count: 3 }), "");
  assert.equal(mintedText({ count: 3, minted: 1 }), "1 minted");
  assert.equal(mintedText({ count: 3, minted: 3 }), "all minted");
  const ev = (id: number, tick: number, creatureId: number, kind = "ITEM") =>
    ({
      id,
      tick,
      kind,
      summary: `line ${id}`,
      payload: { template: "item.use.v1", creatureId },
    }) as never;
  assert.deepEqual(
    creatureActivity(
      [ev(1, 10, 7), ev(2, 30, 7), ev(3, 20, 8), ev(4, 40, 7, "BIRTH")],
      7,
    ).map((line) => line.text),
    ["line 2", "line 1"],
  );
  assert.equal(tickClock(0), "Day 1, 00:00");
  assert.equal(tickClock(144 + 87), "Day 2, 14:30");
});
