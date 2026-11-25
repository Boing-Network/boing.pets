/**
 * M22 item slice, host edge: inventory math, gather/use/craft through the
 * runtime, budget sharing, guests, relic recipients and the weekly limit,
 * LPIT reward mirroring. All idempotent by key.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { INFLUENCE_RATE_LIMIT } from "../src/influence";
import {
  InfluenceKind,
  ItemSlug,
  type HostToClient,
  type InventoryView,
} from "@boing-pets/contract";
import type { WorldEvent } from "@boing-pets/sim";
import type { AssetMintLinkRow } from "../src/boing/asset-mint-link";
import type { MintEdge } from "../src/boing/mint-edge";
import type { LineageArtifactMintJob } from "../src/boing/types";
import { planCraft, planDebit, balanceOf } from "../src/items/inventory";
import {
  enqueueRelicMintsAfterCommit,
  relicMintKey,
  topFavorGiver,
} from "../src/items/relics";
import type { InfluenceAccountRow, InventoryLotRow } from "../src/items/types";
import { MemoryWorldRepository } from "../src/persist/memory-repository";
import { createHostRuntime } from "../src/runtime/host-runtime";

const WALLET = `w:${"ab".repeat(32)}`;
const WALLET_HEX = `0x${"ab".repeat(32)}`;
const OTHER = `w:${"cd".repeat(32)}`;

function lot(
  partial: Partial<InventoryLotRow> & { id: number },
): InventoryLotRow {
  return {
    worldId: 1,
    accountId: WALLET,
    sourceKey: `k${partial.id}`,
    itemSlug: ItemSlug.CLOVER,
    amount: 3,
    remaining: 3,
    gainedTick: 0,
    spoilsAtTick: 1000,
    createdAtMs: 0,
    updatedAtMs: 0,
    ...partial,
  };
}

test("debits take the soonest-spoiling lot first and ignore spoiled lots", () => {
  const lots = [
    lot({ id: 1, spoilsAtTick: 500 }),
    lot({ id: 2, spoilsAtTick: 100 }),
    lot({ id: 3, spoilsAtTick: 50 }), // spoiled at tick 60
  ];
  assert.equal(balanceOf(lots, WALLET, ItemSlug.CLOVER, 60), 6);
  const debit = planDebit(lots, WALLET, ItemSlug.CLOVER, 4, 60, 9);
  assert.deepEqual(
    debit?.map((row) => [row.id, row.remaining]),
    [
      [2, 0],
      [1, 2],
    ],
  );
  assert.equal(planDebit(lots, WALLET, ItemSlug.CLOVER, 7, 60, 9), null);
});

test("crafting consumes the recipe and adds one tool lot", () => {
  const lots = [
    lot({ id: 1, remaining: 3 }),
    lot({ id: 2, itemSlug: ItemSlug.MOONPETAL, amount: 1, remaining: 1 }),
  ];
  const changed = planCraft({
    lots,
    worldId: 1,
    accountId: WALLET,
    output: ItemSlug.SEED_BUNDLE,
    tick: 10,
    ticksPerDay: 144,
    nowMs: 5,
  });
  assert.ok(changed);
  const made = changed.at(-1);
  assert.equal(made?.itemSlug, ItemSlug.SEED_BUNDLE);
  assert.equal(made?.sourceKey, "craft:3");
  assert.equal(made?.spoilsAtTick, 10 + 7 * 144);
  assert.equal(
    planCraft({
      lots,
      worldId: 1,
      accountId: WALLET,
      output: ItemSlug.SALT_LICK,
      tick: 10,
      ticksPerDay: 144,
      nowMs: 5,
    }),
    null,
  );
});

test("top favor-giver is deterministic: count, then earliest favor, then id", () => {
  const row = (
    influenceId: number,
    accountId: string,
  ): InfluenceAccountRow => ({
    influenceId,
    worldId: 1,
    accountId,
    kind: InfluenceKind.FAVOR_BLOODLINE,
    lineageId: 4,
    territoryId: null,
    itemSlug: null,
    acceptedAtMs: 0,
  });
  assert.equal(topFavorGiver([], 4), null);
  assert.equal(topFavorGiver([row(5, OTHER), row(3, WALLET)], 4), WALLET_HEX);
  assert.equal(
    topFavorGiver([row(1, WALLET), row(2, OTHER), row(3, OTHER)], 4),
    `0x${"cd".repeat(32)}`,
  );
  // Guests and the local account never receive relics.
  assert.equal(topFavorGiver([row(1, "g:guest"), row(2, "local")], 4), null);
});

function fakeMintEdge(existing: AssetMintLinkRow[] = []) {
  const queued: LineageArtifactMintJob[] = [];
  const edge = {
    enabled: true,
    async listAssetLinks() {
      return existing;
    },
    async queueLineageArtifactMint(job: LineageArtifactMintJob) {
      queued.push(job);
    },
  } as unknown as MintEdge;
  return { edge, queued };
}

const birth = (id: number, lineageId: number, motherId: number): WorldEvent =>
  ({
    id,
    worldId: 1,
    tick: 9,
    kind: "BIRTH",
    actorId: 900 + id,
    subjectId: motherId,
    territoryId: 1,
    lineageId,
    summary: "",
    payload: { template: "birth.v1" },
  }) as unknown as WorldEvent;

test("relics go to the on-chain owner, else the top favor-giver, else the operator", async () => {
  const operator = `0x${"11".repeat(32)}`;
  const adopter = `0x${"22".repeat(32)}`;
  const minted = (creatureId: number) => ({
    id: creatureId,
    worldId: 1,
    creatureId,
    birthEventId: null,
    collectionHex: "0xc0",
    tokenIdHex: `0x${creatureId}`,
    chainId: "6913",
    templateArtifact: "t",
    templateVersion: "1",
    mintTxHex: null,
    status: "CONFIRMED" as const,
    lastError: null,
    createdAtMs: 0,
    updatedAtMs: 0,
  });
  const chain = {
    async operatorHex() {
      return operator;
    },
    async ownerOf(_c: string, token: string) {
      return token === "0x7" ? adopter : operator;
    },
  };
  const favor: InfluenceAccountRow = {
    influenceId: 1,
    worldId: 1,
    accountId: WALLET,
    kind: InfluenceKind.FAVOR_BLOODLINE,
    lineageId: 2,
    territoryId: null,
    itemSlug: null,
    acceptedAtMs: 0,
  };
  const { edge, queued } = fakeMintEdge();
  await enqueueRelicMintsAfterCommit({
    mintEdge: edge,
    worldId: 1,
    events: [birth(1, 1, 7), birth(2, 2, 8), birth(3, 3, 9), birth(4, 1, 7)],
    creatureLinks: async () => [minted(7), minted(8)],
    accounts: async () => [favor],
    chain,
    nowMs: 0,
  });
  assert.deepEqual(
    queued.map((job) => [job.mintKey, job.recipientHex, job.tokenSerial]),
    [
      ["relic:first-child:1", adopter, 1 * 4 + 2], // adopted mother
      ["relic:first-child:2", WALLET_HEX, 2 * 4 + 2], // operator-held -> favor-giver
      ["relic:first-child:3", null, 3 * 4 + 2], // no favor-giver -> operator
    ],
  );
  // Second commit with the same lineages: nothing new (first trigger wins).
  const again = fakeMintEdge(
    queued.map(
      (job) => ({ worldId: 1, mintKey: job.mintKey }) as AssetMintLinkRow,
    ),
  );
  const repeat = await enqueueRelicMintsAfterCommit({
    mintEdge: again.edge,
    worldId: 1,
    events: [birth(5, 1, 7), birth(6, 2, 8)],
    creatureLinks: async () => [],
    accounts: async () => [],
    chain: null,
    nowMs: 0,
  });
  assert.deepEqual(repeat, []);
  assert.equal(
    relicMintKey(ItemSlug.RELIC_REMEMBRANCE, 4),
    "relic:remembrance:4",
  );
});

async function runtimeWith(repository = new MemoryWorldRepository()) {
  let now = 1_000_000;
  const emitted: HostToClient[] = [];
  const runtime = createHostRuntime({
    repository,
    seed: 1,
    nowMs: () => now,
    autoFrame: false,
    emit: (message) => emitted.push(message),
  });
  await runtime.start();
  const inventory = async (accountId: string): Promise<InventoryView> => {
    const result = await runtime.handleQuery(
      { message: "query.inventory", body: {} },
      { accountId },
    );
    assert.equal(result.message, "query.inventory");
    return result.body as InventoryView;
  };
  return {
    runtime,
    repository,
    inventory,
    advance(ms: number) {
      now += ms;
    },
  };
}

function territory(
  runtime: {
    session: { snapshot: { territories: { id: number; slug: string }[] } };
  },
  slug: string,
): number {
  const row = runtime.session.snapshot.territories.find((t) => t.slug === slug);
  assert.ok(row);
  return row.id;
}

test("gather fills the bag without spending renames, and guests are refused", async () => {
  const { runtime, inventory } = await runtimeWith();
  const meadow = territory(runtime, "meadow");
  const gather = (accountId: string) =>
    runtime.handleCommand(
      {
        message: "influence.submit",
        body: {
          kind: InfluenceKind.GATHER_RESOURCE,
          payload: {
            territoryId: meadow,
            resource: ItemSlug.GLOWMOSS,
            units: 99,
          },
        },
      },
      { accountId },
    );
  const guest = await gather("g:visitor");
  assert.equal(guest.ok, false);
  assert.equal(!guest.ok && guest.code, "item_rejected");

  // Gathering never spends the rename allowance, and still works once
  // that allowance is used up.
  for (let i = 0; i < 4; i += 1)
    assert.deepEqual(await gather(WALLET), { ok: true });
  const creature = runtime.session.snapshot.creatures[0]!;
  const rename = () =>
    runtime.handleCommand(
      {
        message: "influence.submit",
        body: {
          kind: InfluenceKind.NAME_CREATURE,
          payload: { creatureId: creature.id, name: "Ada" },
        },
      },
      // Local play: the local account owns every creature.
      {},
    );
  for (let i = 0; i < INFLUENCE_RATE_LIMIT; i += 1)
    assert.deepEqual(await rename(), { ok: true });
  const limited = await rename();
  assert.equal(!limited.ok && limited.code, "rate_limited");
  // A wallet that does not own the creature cannot rename it at all.
  const stranger = await runtime.handleCommand(
    {
      message: "influence.submit",
      body: {
        kind: InfluenceKind.NAME_CREATURE,
        payload: { creatureId: creature.id, name: "Mine" },
      },
    },
    { accountId: WALLET },
  );
  assert.equal(!stranger.ok && stranger.code, "not_owner");
  assert.deepEqual(await gather(WALLET), { ok: true });

  const bag = await inventory(WALLET);
  const clover = bag.items.find((row) => row.slug === ItemSlug.CLOVER);
  assert.ok(clover && clover.count >= 5 && clover.count <= 16);
  // The client cannot pick the resource or the yield.
  assert.ok(!bag.items.some((row) => row.slug === ItemSlug.GLOWMOSS));
  const pending = runtime.session.snapshot.pendingInfluences.filter(
    (row) => row.kind === InfluenceKind.GATHER_RESOURCE,
  );
  const granted = pending.reduce(
    (sum, row) => sum + (row.payload as { units: number }).units,
    0,
  );
  assert.equal(granted, clover.count);
  const stock = bag.stocks.find((row) => row.territoryId === meadow);
  // Spring: clover is plentiful, so the meadow holds 16.
  assert.equal(stock?.cap, 16);
  assert.equal(stock?.free, 16 - granted);
});

test("craft then use a seed bundle; using debits once and needs the item", async () => {
  const repository = new MemoryWorldRepository();
  const { runtime, inventory } = await runtimeWith(repository);
  const worldId = runtime.session.snapshot.world.id;
  const meadow = territory(runtime, "meadow");
  await repository.commitItems({
    upsertLots: [
      lot({
        id: 1,
        worldId,
        sourceKey: "seed:1",
        remaining: 3,
        spoilsAtTick: null,
      }),
      lot({
        id: 2,
        worldId,
        sourceKey: "seed:2",
        itemSlug: ItemSlug.MOONPETAL,
        amount: 1,
        remaining: 1,
        spoilsAtTick: null,
      }),
    ],
    insertInfluenceAccounts: [],
  });
  const use = () =>
    runtime.handleCommand(
      {
        message: "influence.submit",
        body: {
          kind: InfluenceKind.USE_ITEM,
          payload: { item: ItemSlug.SEED_BUNDLE, territoryId: meadow },
        },
      },
      { accountId: WALLET },
    );
  const early = await use();
  assert.equal(!early.ok && early.code, "item_rejected");
  assert.deepEqual((await inventory(WALLET)).craftable, [ItemSlug.SEED_BUNDLE]);

  const craft = await runtime.handleCommand(
    { message: "item.craft", body: { output: ItemSlug.SEED_BUNDLE } },
    { accountId: WALLET },
  );
  assert.deepEqual(craft, { ok: true });
  assert.deepEqual(
    (await inventory(WALLET)).items.map((row) => [row.slug, row.count]),
    [[ItemSlug.SEED_BUNDLE, 1]],
  );
  // Crafting is not an influence: the full budget is still there.
  assert.deepEqual(await use(), { ok: true });
  assert.deepEqual((await inventory(WALLET)).items, []);
  const again = await use();
  assert.equal(!again.ok && again.code, "item_rejected");

  const accounts = await repository.readInfluenceAccounts(worldId);
  assert.deepEqual(
    accounts.map((row) => [row.kind, row.itemSlug, row.accountId]),
    [[InfluenceKind.USE_ITEM, ItemSlug.SEED_BUNDLE, WALLET]],
  );
});

test("LPIT reward rows mirror into the bag once, even FAILED ones", async () => {
  const repository = new MemoryWorldRepository();
  const first = await runtimeWith(repository);
  const worldId = first.runtime.session.snapshot.world.id;
  const reward = (
    mintKey: string,
    slug: string,
    status: string,
  ): AssetMintLinkRow => ({
    id: mintKey.length,
    worldId,
    tokenClass: "COMPRESSED_ITEM",
    mintKey,
    lineageId: null,
    artifactKind: null,
    tokenSerial: null,
    itemKindId: 2,
    amount: 1,
    itemSlug: slug,
    recipientHex: WALLET_HEX,
    collectionHex: "0x00",
    tokenIdHex: "0x02",
    chainId: "6913",
    templateArtifact: "t",
    templateVersion: "1",
    mintTxHex: null,
    status: status as AssetMintLinkRow["status"],
    lastError:
      status === "FAILED"
        ? "LIVING_PETS_BOING_ITEM_COLLECTION_HEX required"
        : null,
    createdAtMs: 0,
    updatedAtMs: 0,
  });
  await repository.upsertAssetMintLink(
    reward("influence:1", ItemSlug.POTION_CALM, "FAILED"),
  );
  await repository.upsertAssetMintLink(
    reward("influence:22", ItemSlug.RATIONS, "PENDING"),
  );
  await first.runtime.quit();
  // Reboot twice: the mirror is idempotent.
  for (let i = 0; i < 2; i += 1) {
    const booted = await runtimeWith(repository);
    const bag = await booted.inventory(WALLET);
    assert.deepEqual(
      bag.items.map((row) => [row.slug, row.count, row.nextSpoilTick]),
      [
        [ItemSlug.RATIONS, 1, null],
        [ItemSlug.POTION_CALM, 1, null],
      ],
    );
    await booted.runtime.quit();
  }
  const lots = await repository.readInventoryLots(worldId);
  assert.deepEqual(lots.map((row) => row.sourceKey).sort(), [
    "mint:influence:1",
    "mint:influence:22",
  ]);
});

test("a relic is honored for +25 favor at most once a week", async () => {
  const repository = new MemoryWorldRepository();
  const { runtime, inventory, advance } = await runtimeWith(repository);
  const worldId = runtime.session.snapshot.world.id;
  const lineage = runtime.session.snapshot.lineages[0];
  assert.ok(lineage);
  await repository.upsertAssetMintLink({
    id: 77,
    worldId,
    tokenClass: "UNIQUE_LINEAGE_ARTIFACT",
    mintKey: relicMintKey(ItemSlug.RELIC_FIRST_CHILD, lineage.id),
    lineageId: lineage.id,
    artifactKind: "FIRST_CHILD_COMMEMORATIVE",
    tokenSerial: lineage.id * 4 + 2,
    itemKindId: null,
    amount: null,
    itemSlug: null,
    recipientHex: WALLET_HEX,
    collectionHex: "0x95",
    tokenIdHex: "0x01",
    chainId: "6913",
    templateArtifact: "t",
    templateVersion: "1",
    mintTxHex: null,
    status: "PENDING",
    lastError: null,
    createdAtMs: 0,
    updatedAtMs: 0,
  });
  const honor = (accountId: string) =>
    runtime.handleCommand(
      {
        message: "influence.submit",
        body: {
          kind: InfluenceKind.USE_ITEM,
          payload: { item: ItemSlug.RELIC_FIRST_CHILD, lineageId: lineage.id },
        },
      },
      { accountId },
    );
  const stranger = await honor(OTHER);
  assert.equal(!stranger.ok && stranger.code, "item_rejected");
  assert.deepEqual(await honor(WALLET), { ok: true });
  const relics = (await inventory(WALLET)).relics;
  assert.equal(relics.length, 1);
  assert.ok(relics[0]?.usableAtMs != null);
  const tooSoon = await honor(WALLET);
  assert.equal(!tooSoon.ok && tooSoon.code, "item_rejected");
  advance(7 * 24 * 60 * 60 * 1000);
  assert.deepEqual(await honor(WALLET), { ok: true });
});

test("remote validation drops client-chosen gather yields and unknown items", async () => {
  const { validateCommand, validateQuery } =
    await import("../src/multiplayer/validate");
  const gather = validateCommand({
    message: "influence.submit",
    body: {
      kind: "GATHER_RESOURCE",
      payload: { territoryId: 3, resource: "resource.moonpetal", units: 500 },
    },
  });
  assert.ok(gather.ok);
  assert.deepEqual(gather.value.body, {
    kind: "GATHER_RESOURCE",
    payload: { territoryId: 3, resource: ItemSlug.CLOVER, units: 1 },
  });
  assert.equal(
    validateCommand({
      message: "influence.submit",
      body: {
        kind: "USE_ITEM",
        payload: { item: "potion.gold", territoryId: 1 },
      },
    }).ok,
    false,
  );
  assert.equal(
    validateCommand({
      message: "item.craft",
      body: { output: "tool.salt-lick" },
    }).ok,
    true,
  );
  assert.equal(
    validateCommand({
      message: "item.craft",
      body: { output: "relic.keepsake" },
    }).ok,
    true, // shape only; the service rejects outputs with no recipe
  );
  assert.equal(
    validateQuery({ message: "query.inventory", body: {} }).ok,
    true,
  );
});
