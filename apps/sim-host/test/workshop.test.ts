/**
 * The workshop: creatures find materials everywhere, the player crafts
 * potions and tonics from them and gives them to a creature.
 */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import {
  CREATURE_USE_RULES,
  DEFAULT_ITEM_AUTONOMY,
  GATHER_SOURCES,
  ITEM_CATALOG,
  InfluenceKind,
  ItemCategory,
  ItemSlug,
  LPIT_ITEM_IDS,
  RECIPES,
  TONIC_GENE_CEILING,
  creatureCraftable,
  itemDef,
  itemImageSrc,
  lpitItemSlug,
  type InventoryView,
  type WorldEventView,
} from "@boing-pets/contract";
import { planCreatureAutonomy, type AutonomyBag } from "@boing-pets/sim";
import type { InventoryLotRow } from "../src/items/types";
import { validateCommand } from "../src/multiplayer/validate";
import { MemoryWorldRepository } from "../src/persist/memory-repository";
import { createHostRuntime } from "../src/runtime/host-runtime";

const WALLET = `w:${"ab".repeat(32)}`;

async function workshop(stock: Partial<Record<ItemSlug, number>>) {
  const repository = new MemoryWorldRepository();
  const events: WorldEventView[] = [];
  const runtime = createHostRuntime({
    repository,
    seed: 1,
    nowMs: () => 1_000_000,
    autoFrame: false,
    emit: (message) => {
      if (message.message === "world.patch")
        events.push(...message.body.events);
      if (message.message === "world.snapshot") {
        events.push(...message.body.events);
      }
    },
  });
  await runtime.start();
  const worldId = runtime.session.snapshot.world.id;
  const lots: InventoryLotRow[] = Object.entries(stock).map(
    ([itemSlug, amount], index) => ({
      id: index + 1,
      worldId,
      accountId: WALLET,
      sourceKey: `stock:${index}`,
      itemSlug,
      amount: amount ?? 0,
      remaining: amount ?? 0,
      gainedTick: 0,
      spoilsAtTick: null,
      createdAtMs: 0,
      updatedAtMs: 0,
    }),
  );
  await repository.commitItems({
    upsertLots: lots,
    insertInfluenceAccounts: [],
  });
  const inventory = async (): Promise<InventoryView> => {
    const result = await runtime.handleQuery(
      { message: "query.inventory", body: {} },
      { accountId: WALLET },
    );
    assert.equal(result.message, "query.inventory");
    return result.body as InventoryView;
  };
  const craft = (output: ItemSlug) =>
    runtime.handleCommand(
      { message: "item.craft", body: { output } },
      { accountId: WALLET },
    );
  const give = (item: ItemSlug, creatureId: number) =>
    runtime.handleCommand(
      {
        message: "influence.submit",
        body: { kind: InfluenceKind.USE_ITEM, payload: { item, creatureId } },
      },
      { accountId: WALLET },
    );
  const count = async (slug: ItemSlug) =>
    (await inventory()).items.find((row) => row.slug === slug)?.count ?? 0;
  return { runtime, events, inventory, craft, give, count };
}

test("the recipe book hangs together", () => {
  const resources = new Set(
    ITEM_CATALOG.filter((def) => def.category === ItemCategory.RESOURCE).map(
      (def) => def.slug,
    ),
  );
  const used = new Set<string>();
  const outputs = new Set<string>();
  for (const recipe of RECIPES) {
    const out = itemDef(recipe.output);
    assert.ok(out?.effect, `${recipe.output} does something`);
    assert.ok(!outputs.has(recipe.output), `${recipe.output} has one recipe`);
    outputs.add(recipe.output);
    assert.ok(recipe.inputs.length >= 2, `${recipe.output} mixes ingredients`);
    for (const input of recipe.inputs) {
      assert.ok(resources.has(input.slug), `${input.slug} is a resource`);
      assert.ok(input.count >= 1);
      used.add(input.slug);
    }
  }
  // Every resource is worth finding, and every one grows somewhere.
  assert.deepEqual([...used].sort(), [...resources].sort());
  assert.deepEqual(
    GATHER_SOURCES.map((source) => source.resource).sort(),
    [...resources].sort(),
  );
  // Everything that is not a relic or a raw resource can be crafted.
  for (const def of ITEM_CATALOG) {
    if (
      def.category === ItemCategory.RESOURCE ||
      def.category === ItemCategory.RELIC
    ) {
      continue;
    }
    assert.ok(outputs.has(def.slug), `${def.slug} is craftable`);
  }
  // Items for one creature say so; tonics stay under the natural maximum.
  for (const def of ITEM_CATALOG) {
    const kind = def.effect?.kind;
    assert.equal(
      def.target === "CREATURE",
      kind === "RELIEF" || kind === "GENE",
      def.slug,
    );
  }
  assert.ok(TONIC_GENE_CEILING < 1000);
});

test("everything gathered or crafted can be minted and has a still", () => {
  const ids = new Set<number>();
  for (const def of ITEM_CATALOG) {
    if (def.category === ItemCategory.RELIC) continue;
    const id = LPIT_ITEM_IDS[def.slug];
    assert.ok(id != null && id >= 1, `${def.slug} has a token id`);
    assert.ok(!ids.has(id), `${def.slug} has its own token id`);
    ids.add(id);
    assert.equal(lpitItemSlug(id), def.slug);
    const src = itemImageSrc(def.slug);
    assert.ok(src, `${def.slug} has a still`);
    assert.ok(
      existsSync(new URL(`../../client/public${src}`, import.meta.url)),
      `${src} is on disk`,
    );
  }
  // Ids already minted on chain never move.
  assert.equal(LPIT_ITEM_IDS[ItemSlug.POTION_VITALITY], 1);
  assert.equal(LPIT_ITEM_IDS[ItemSlug.SALT_LICK], 9);
});

test("crafting is the player's job unless they hand it over", () => {
  assert.equal(DEFAULT_ITEM_AUTONOMY.autoCraft, false);
  assert.equal(DEFAULT_ITEM_AUTONOMY.autoUse, true);
  // Creatures only ever craft what they can use themselves.
  for (const rule of CREATURE_USE_RULES) {
    assert.equal(creatureCraftable(rule.item), true);
  }
  assert.equal(creatureCraftable(ItemSlug.TONIC_SWIFT), false);
  assert.equal(creatureCraftable(ItemSlug.POTION_MENDING), false);
});

test("a keeper who allows it gets tools and food crafted, never tonics", async () => {
  const { runtime } = await workshop({});
  const snapshot = runtime.session.snapshot;
  const creature = snapshot.creatures[0]!;
  const bag = (autoCraft: boolean): AutonomyBag => ({
    accountId: WALLET,
    // Enough for a Swiftness Tonic (first match by inputs) or Rations.
    units: new Map<string, number>([
      [ItemSlug.CRYSTAL_SHARD, 2],
      [ItemSlug.MOONPETAL, 2],
      [ItemSlug.CLOVER, 2],
      [ItemSlug.THORNBERRY, 2],
    ]),
    autoCraft,
    autoUse: false,
    usesLeft: 0,
  });
  const plan = (autoCraft: boolean) => {
    const shared = bag(autoCraft);
    return planCreatureAutonomy({
      snapshot,
      tick: snapshot.world.lastTick,
      bagsFor: (id) => (id === creature.id ? [shared] : []),
      lastUseTick: new Map(),
      useCooldownTicks: 36,
      maxCraftsPerBag: 3,
    }).filter((intent) => intent.kind === "CRAFT");
  };
  assert.deepEqual(plan(false), []);
  assert.deepEqual(
    plan(true).map((intent) => intent.kind === "CRAFT" && intent.output),
    [ItemSlug.RATIONS],
  );
});

test("craft a potion from two regions' materials and give it to a creature", async () => {
  const w = await workshop({
    [ItemSlug.THORNBERRY]: 2,
    [ItemSlug.GLOWMOSS]: 1,
  });
  const creature = w.runtime.session.snapshot.creatures[0]!;
  creature.health = 400;
  creature.discomfort = 500;

  assert.deepEqual((await w.inventory()).craftable, [ItemSlug.POTION_MENDING]);
  const early = await w.give(ItemSlug.POTION_MENDING, creature.id);
  assert.equal(!early.ok && early.code, "item_rejected");

  assert.deepEqual(await w.craft(ItemSlug.POTION_MENDING), { ok: true });
  assert.equal(await w.count(ItemSlug.POTION_MENDING), 1);
  assert.equal(await w.count(ItemSlug.THORNBERRY), 0);

  // It needs a living creature.
  const nobody = await w.give(ItemSlug.POTION_MENDING, 999_999);
  assert.equal(!nobody.ok && nobody.detail, "choose a living creature");
  assert.equal(await w.count(ItemSlug.POTION_MENDING), 1);

  assert.deepEqual(await w.give(ItemSlug.POTION_MENDING, creature.id), {
    ok: true,
  });
  assert.equal(await w.count(ItemSlug.POTION_MENDING), 0);

  await w.runtime.tickFrame(60_000);
  const after = w.runtime.session.snapshot.creatures.find(
    (row) => row.id === creature.id,
  )!;
  // +300 health, then one tick of ordinary drift.
  assert.ok(after.health >= 690 && after.health <= 710, `${after.health}`);
  assert.ok(after.discomfort <= 360, `${after.discomfort}`);
  const told = w.events.find((event) =>
    event.summary.includes("was given a Mending Potion"),
  );
  assert.ok(told, "the gift shows in the creature's activity");
  assert.equal(told.actorId, creature.id);
});

test("a tonic raises a gene for good, up to the ceiling", async () => {
  const w = await workshop({
    [ItemSlug.CRYSTAL_SHARD]: 6,
    [ItemSlug.MOONPETAL]: 6,
  });
  const [first, second] = w.runtime.session.snapshot.creatures;
  assert.ok(first && second);
  first.geneSpeed = 500;
  second.geneSpeed = TONIC_GENE_CEILING - 5;

  for (let i = 0; i < 3; i += 1) {
    assert.deepEqual(await w.craft(ItemSlug.TONIC_SWIFT), { ok: true });
  }
  assert.equal(await w.count(ItemSlug.TONIC_SWIFT), 3);
  assert.deepEqual(await w.give(ItemSlug.TONIC_SWIFT, first.id), { ok: true });
  assert.deepEqual(await w.give(ItemSlug.TONIC_SWIFT, second.id), {
    ok: true,
  });
  await w.runtime.tickFrame(60_000);

  const speed = (id: number) =>
    w.runtime.session.snapshot.creatures.find((row) => row.id === id)!
      .geneSpeed;
  assert.equal(speed(first.id), 520);
  assert.equal(speed(second.id), TONIC_GENE_CEILING);
  assert.ok(w.events.some((e) => e.summary.includes("(speed +20)")));
  assert.ok(w.events.some((e) => e.summary.includes("(speed +5)")));

  // A gene already past the ceiling is left alone, never lowered.
  first.geneSpeed = 950;
  assert.deepEqual(await w.give(ItemSlug.TONIC_SWIFT, first.id), { ok: true });
  await w.runtime.tickFrame(60_000);
  assert.equal(speed(first.id), 950);
});

test("remote clients can name a creature for an item, and nothing else new", () => {
  const ok = validateCommand({
    message: "influence.submit",
    body: {
      kind: InfluenceKind.USE_ITEM,
      payload: { item: ItemSlug.HEARTY_STEW, creatureId: 7, health: 9999 },
    },
  });
  assert.deepEqual(ok, {
    ok: true,
    value: {
      message: "influence.submit",
      body: {
        kind: InfluenceKind.USE_ITEM,
        payload: { item: ItemSlug.HEARTY_STEW, creatureId: 7 },
      },
    },
  });
  const bad = validateCommand({
    message: "influence.submit",
    body: {
      kind: InfluenceKind.USE_ITEM,
      payload: { item: ItemSlug.HEARTY_STEW, creatureId: "7" },
    },
  });
  assert.equal(bad.ok, false);
});
