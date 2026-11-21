/**
 * Creature autonomy, host side: loot credit (keeper or pouch), bags that
 * never include minted or listed units, keeper toggles and daily cap,
 * idempotent bag debits, the runtime path end to end, owner index, and the
 * mint-on-demand HTTP endpoints.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import * as ed from "@noble/ed25519";
import { blake3 } from "@noble/hashes/blake3";
import {
  AUTONOMY_RULES,
  CreatureStatus,
  EventKind,
  EventTemplate,
  InfluenceKind,
  ItemSlug,
  type InventoryView,
  type WorldEventView,
} from "@boing-pets/contract";
import { step } from "@boing-pets/sim";
import {
  autonomyBags,
  planAutonomyInventory,
  planLootCredits,
  pouchAccount,
  usesLast24h,
} from "../src/items/autonomy";
import { balanceOf } from "../src/items/inventory";
import type { InventoryLotRow } from "../src/items/types";
import { submitSystemInfluences } from "../src/influence";
import { creatureOwnerIndex } from "../src/market/creature-owners";
import {
  itemMintMessage,
  createItemMintEndpoints,
} from "../src/market/item-mint";
import { LOCAL_ACCOUNT_ID } from "../src/multiplayer/account";
import { validateCommand } from "../src/multiplayer/validate";
import { MemoryWorldRepository } from "../src/persist/memory-repository";
import { createHostRuntime } from "../src/runtime/host-runtime";
import { commitSession } from "../src/session";

const KEEPER = `w:${"ab".repeat(32)}`;

function lot(
  id: number,
  accountId: string,
  slug: string,
  remaining: number,
  minted = false,
): InventoryLotRow {
  return {
    id,
    worldId: 1,
    accountId,
    sourceKey: `${minted ? "mint" : "gather"}:${id}`,
    itemSlug: slug,
    amount: remaining,
    remaining,
    gainedTick: 0,
    spoilsAtTick: null,
    minted,
    createdAtMs: 0,
    updatedAtMs: 0,
  };
}

function lootEvent(id: number, creatureId: number): WorldEventView {
  return {
    id,
    worldId: 1,
    tick: 10,
    kind: EventKind.ITEM,
    actorId: creatureId,
    subjectId: null,
    territoryId: 1,
    lineageId: null,
    summary: "Meadow found 1 Clover.",
    templateId: EventTemplate.ITEM_LOOT,
    payload: {
      template: EventTemplate.ITEM_LOOT,
      creatureId,
      item: ItemSlug.CLOVER,
      units: 1,
      territoryId: 1,
    },
  } as WorldEventView;
}

test("loot credits the keeper, or the creature's pouch, once per event", () => {
  const ownerOf = (id: number) => (id === 1 ? KEEPER : null);
  const events = [lootEvent(5, 1), lootEvent(6, 2)];
  const first = planLootCredits({
    lots: [],
    events,
    worldId: 1,
    ownerOf,
    ticksPerDay: 144,
    nowMs: 1,
  });
  assert.deepEqual(
    first.map((row) => [row.sourceKey, row.accountId, row.minted]),
    [
      ["loot:5", KEEPER, false],
      ["loot:6", pouchAccount(2), false],
    ],
  );
  assert.ok(first[0]!.spoilsAtTick != null, "clover spoils like a gather");
  const again = planLootCredits({
    lots: first,
    events,
    worldId: 1,
    ownerOf,
    ticksPerDay: 144,
    nowMs: 2,
  });
  assert.equal(again.length, 0, "replaying the same events adds nothing");
  // Non-loot events are ignored.
  const other = { ...lootEvent(7, 1), kind: EventKind.BIRTH };
  assert.equal(
    planLootCredits({
      lots: [],
      events: [other],
      worldId: 1,
      ownerOf,
      ticksPerDay: 144,
      nowMs: 1,
    }).length,
    0,
  );
});

test("bags hold only unminted live units: pouch first, then the keeper's", () => {
  const lots = [
    lot(1, KEEPER, ItemSlug.RATIONS, 2),
    lot(2, KEEPER, ItemSlug.RATIONS, 5, true),
    lot(3, pouchAccount(9), ItemSlug.POTION_CALM, 1),
    // Listed units sit in the escrow pseudo-account, never in a bag.
    lot(4, "escrow:aa:1", ItemSlug.RATIONS, 3, true),
  ];
  const bagsFor = autonomyBags({
    lots,
    tick: 0,
    ownerOf: (id) => (id === 9 ? KEEPER : null),
    settingsOf: () => ({ autoCraft: true, autoUse: true }),
    usesToday: new Map([[KEEPER, 4]]),
    canHold: (id) => id.startsWith("w:"),
  });
  const bags = bagsFor(9);
  assert.deepEqual(
    bags.map((bag) => bag.accountId),
    [pouchAccount(9), KEEPER],
  );
  assert.equal(bags[1]!.units.get(ItemSlug.RATIONS), 2, "minted excluded");
  assert.equal(
    bags[1]!.usesLeft,
    AUTONOMY_RULES.maxUsesPerBagPerDay - 4,
    "daily cap per keeper",
  );
  assert.equal(bags[0]!.usesLeft, Number.POSITIVE_INFINITY);
  assert.equal(bagsFor(9)[1], bags[1], "one shared bag per keeper");
  // An unadopted creature with an empty pouch has no bag at all.
  assert.equal(bagsFor(10).length, 0);
});

test("bag debits take only unminted units, add crafted lots, and are idempotent by influence id", () => {
  const lots = [
    lot(1, KEEPER, ItemSlug.RATIONS, 1),
    lot(2, KEEPER, ItemSlug.RATIONS, 4, true),
    lot(3, KEEPER, ItemSlug.CLOVER, 3),
  ];
  const intents = [
    {
      kind: "USE" as const,
      creatureId: 1,
      accountId: KEEPER,
      item: ItemSlug.RATIONS,
      territoryId: 1,
      influenceId: 40,
    },
    {
      kind: "USE" as const,
      creatureId: 2,
      accountId: KEEPER,
      item: ItemSlug.RATIONS,
      territoryId: 1,
      influenceId: 41,
    },
  ];
  const plan = planAutonomyInventory({
    lots,
    accounts: [],
    intents,
    worldId: 1,
    tick: 5,
    ticksPerDay: 144,
    lineageOf: () => 3,
    nowMs: 9,
  });
  const after = lots.map(
    (row) => plan.upsertLots.find((c) => c.sourceKey === row.sourceKey) ?? row,
  );
  assert.equal(balanceOf(after, KEEPER, ItemSlug.RATIONS, 5, "unminted"), 0);
  assert.equal(
    balanceOf(after, KEEPER, ItemSlug.RATIONS, 5, "minted"),
    4,
    "the second use finds no unminted ration and takes nothing minted",
  );
  assert.deepEqual(
    plan.accounts.map((row) => [row.influenceId, row.kind, row.accountId]),
    [
      [40, InfluenceKind.CREATURE_USE_ITEM, KEEPER],
      [41, InfluenceKind.CREATURE_USE_ITEM, KEEPER],
    ],
  );
  const replay = planAutonomyInventory({
    lots: after,
    accounts: plan.accounts,
    intents,
    worldId: 1,
    tick: 5,
    ticksPerDay: 144,
    lineageOf: () => 3,
    nowMs: 10,
  });
  assert.equal(replay.upsertLots.length + replay.accounts.length, 0);
  assert.equal(usesLast24h(plan.accounts, 10).get(KEEPER), 2);
});

async function startLocal() {
  const repository = new MemoryWorldRepository();
  const runtime = createHostRuntime({
    repository,
    seed: 1,
    nowMs: () => 5_000_000,
    autoFrame: false,
    emit: () => {},
  });
  await runtime.start();
  return { runtime, repository };
}

test("runtime: a hungry creature eats an unminted ration from the bag, never a minted one", async () => {
  const { runtime, repository } = await startLocal();
  const session = runtime.session;
  const worldId = session.snapshot.world.id;
  await repository.commitItems({
    upsertLots: [
      { ...lot(1, LOCAL_ACCOUNT_ID, ItemSlug.RATIONS, 1), worldId },
      { ...lot(2, LOCAL_ACCOUNT_ID, ItemSlug.RATIONS, 3, true), worldId },
    ],
    insertInfluenceAccounts: [],
  });
  const alive = session.snapshot.creatures.filter(
    (row) => row.status === CreatureStatus.ALIVE,
  );
  for (const creature of alive) creature.hunger = 0;
  const hungry = alive[0]!;
  hungry.hunger = 900;
  const lastUseTick = new Map<number, number>();
  const run = () =>
    runtime.items!.runAutonomy(session, {
      ownerOf: () => LOCAL_ACCOUNT_ID,
      lastUseTick,
      persist: (records) => submitSystemInfluences(session, records),
      nowMs: 5_000_000,
    });
  const applied = await run();
  assert.deepEqual(
    applied.map((row) => [row.kind, row.creatureId]),
    [["USE", hungry.id]],
  );
  const pending = session.snapshot.pendingInfluences.at(-1)!;
  assert.equal(pending.kind, InfluenceKind.CREATURE_USE_ITEM);
  const bag = async () => {
    const r = await runtime.handleQuery({
      message: "query.inventory",
      body: {},
    });
    return (r.body as InventoryView).items.find(
      (row) => row.slug === ItemSlug.RATIONS,
    );
  };
  assert.deepEqual(
    { count: (await bag())?.count, minted: (await bag())?.minted },
    { count: 3, minted: 3 },
  );
  // The kernel applies it next tick and says so.
  const { events } = step(session.snapshot);
  const use = events.find((e) => e.kind === EventKind.ITEM);
  assert.ok(use != null, "an ITEM event");
  assert.match(use.summary, /ate a Rations Pack/);
  assert.ok(hungry.hunger < 900 - 300, "the ration relieved hunger");
  // Still hungry, but nothing unminted left: no more uses.
  hungry.hunger = 900;
  lastUseTick.clear();
  assert.equal((await run()).length, 0);
  await runtime.quit();
});

test("runtime: keeper toggles stop crafts and uses; clients cannot submit creature influences", async () => {
  const { runtime, repository } = await startLocal();
  const session = runtime.session;
  const worldId = session.snapshot.world.id;
  await repository.commitItems({
    upsertLots: [
      { ...lot(1, LOCAL_ACCOUNT_ID, ItemSlug.RATIONS, 2), worldId },
      { ...lot(2, LOCAL_ACCOUNT_ID, ItemSlug.CLOVER, 6), worldId },
    ],
    insertInfluenceAccounts: [],
  });
  for (const creature of session.snapshot.creatures) creature.hunger = 900;
  const off = await runtime.handleCommand({
    message: "item.autonomy",
    body: { autoCraft: false, autoUse: false },
  });
  assert.equal(off.ok, true);
  const view = (
    await runtime.handleQuery({ message: "query.inventory", body: {} })
  ).body as InventoryView;
  assert.deepEqual(view.autonomy, { autoCraft: false, autoUse: false });
  const applied = await runtime.items!.runAutonomy(session, {
    ownerOf: () => LOCAL_ACCOUNT_ID,
    lastUseTick: new Map(),
    persist: (records) => submitSystemInfluences(session, records),
    nowMs: 5_000_000,
  });
  assert.equal(applied.length, 0);

  assert.equal(
    validateCommand({
      message: "influence.submit",
      body: {
        kind: InfluenceKind.CREATURE_USE_ITEM,
        payload: { creatureId: 1, item: ItemSlug.RATIONS, territoryId: 1 },
      },
    }).ok,
    false,
  );
  assert.deepEqual(
    validateCommand({ message: "item.autonomy", body: { autoUse: true } }),
    { ok: true, value: { message: "item.autonomy", body: { autoUse: true } } },
  );
  assert.equal(
    validateCommand({ message: "item.autonomy", body: { autoUse: "yes" } }).ok,
    false,
  );
  await runtime.quit();
});

test("runtime: loot events are credited after their tick commits", async () => {
  const { runtime, repository } = await startLocal();
  const session = runtime.session;
  const worldId = session.snapshot.world.id;
  const creature = session.snapshot.creatures[0]!;
  session.dirty.events.push({ ...lootEvent(999_001, creature.id), worldId });
  await commitSession(session);
  const lots = await repository.readInventoryLots(worldId);
  const credited = lots.find((row) => row.sourceKey === "loot:999001");
  assert.equal(credited?.accountId, LOCAL_ACCOUNT_ID);
  assert.equal(credited?.minted, false);
  await runtime.quit();
});

test("creature owner index: only a player-held NFT has a keeper", () => {
  const collection = `0x${"c1".repeat(32)}`;
  const operator = `0x${"ee".repeat(32)}`;
  const escrow = `0x${"e5".repeat(32)}`;
  const player = `0x${"ab".repeat(32)}`;
  const link = (creatureId: number, status: string) => ({
    creatureId,
    status,
    recipientHex: operator,
    collectionHex: collection,
    tokenIdHex: `0x${creatureId.toString(16).padStart(64, "0")}`,
  });
  const key = (id: number) => `${collection}:${id}`;
  const index = creatureOwnerIndex({
    links: [
      link(1, "CONFIRMED"),
      link(2, "CONFIRMED"),
      link(3, "PENDING"),
      link(4, "CONFIRMED"),
    ],
    owners: new Map([
      [key(1), player],
      [key(2), operator],
      [key(4), player],
    ]),
    listed: new Set([key(4)]),
    operatorHex: operator,
    escrowHex: escrow,
  });
  assert.deepEqual([...index.entries()], [[1, KEEPER]]);
});

test("mint endpoints: a signed one-time challenge mints exactly the asked units", async () => {
  const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");
  const secret = ed.utils.randomPrivateKey();
  const wallet = `0x${hex(await ed.getPublicKeyAsync(secret))}`;
  const sign = async (message: string) =>
    `0x${hex(await ed.signAsync(blake3(new TextEncoder().encode(message)), secret))}`;
  const requests: { walletHex: string; slug: string; qty: number }[] = [];
  const endpoints = createItemMintEndpoints({
    enabled: () => true,
    nowMs: () => 1_000,
    request: async (req) => {
      requests.push(req);
      return { ok: true, mintKey: "claim:7", qty: req.qty };
    },
  });
  const bad = await endpoints.challenge(
    { wallet, itemSlug: ItemSlug.RATIONS, qty: 999 },
    "https://boing.pets",
  );
  assert.equal(bad.status, 400);
  const issued = await endpoints.challenge(
    { wallet, itemSlug: ItemSlug.CLOVER, qty: 2 },
    "https://boing.pets",
  );
  assert.equal(issued.status, 200);
  const challenge = issued.body as { nonce: string; message: string };
  assert.equal(
    challenge.message,
    itemMintMessage({
      origin: "https://boing.pets",
      chainId: 6913,
      address: wallet,
      itemSlug: ItemSlug.CLOVER,
      qty: 2,
      nonce: challenge.nonce,
      expiresAtMs: 1_000 + 5 * 60 * 1000,
    }),
  );
  // A wrong signature burns the challenge.
  const wrong = await endpoints.mint({
    wallet,
    nonce: challenge.nonce,
    signature: `0x${"00".repeat(64)}`,
  });
  assert.equal(wrong.status, 401);
  const reused = await endpoints.mint({
    wallet,
    nonce: challenge.nonce,
    signature: await sign(challenge.message),
  });
  assert.equal(reused.status, 400, "single use");
  const again = (
    await endpoints.challenge(
      { wallet, itemSlug: ItemSlug.CLOVER, qty: 2 },
      "https://boing.pets",
    )
  ).body as { nonce: string; message: string };
  const ok = await endpoints.mint({
    wallet,
    nonce: again.nonce,
    signature: await sign(again.message),
  });
  assert.equal(ok.status, 200);
  assert.deepEqual(requests, [
    { walletHex: wallet, slug: ItemSlug.CLOVER, qty: 2 },
  ]);
  assert.equal(endpoints.size(), 0);
});
