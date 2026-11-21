import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  MarketItemHolding,
  MarketItemListing,
} from "@boing-pets/contract";
import { DEFAULT_SERVER, itemsUrl } from "../src/market/catalog-source";
import {
  holdingBlock,
  itemListingOffer,
  parseQty,
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
