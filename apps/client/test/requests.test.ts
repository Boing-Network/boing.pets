/**
 * Territory requests: when a territory asks, for what, and whether the bag
 * can answer.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { ItemSlug, type InventoryEntry } from "@boing-pets/contract";
import {
  answersRequest,
  requestSupply,
  territoryRequests,
  type RequestCreature,
  type RequestTerritory,
} from "../src/hud/requests";

const MEADOW: RequestTerritory = { id: 1, name: "Meadow" };
const FEN: RequestTerritory = { id: 2, name: "Glowfen" };

let nextId = 1;
function creature(
  territoryId: number,
  needs: Partial<RequestCreature["needs"]> = {},
  extra: Partial<RequestCreature> = {},
): RequestCreature {
  return {
    id: nextId++,
    status: "ALIVE",
    territoryId,
    needs: { hunger: 0, thirst: 0, discomfort: 0, unsafety: 0, ...needs },
    ...extra,
  };
}

function bag(counts: Partial<Record<ItemSlug, number>>): InventoryEntry[] {
  return Object.entries(counts).map(([slug, count]) => ({
    slug: slug as ItemSlug,
    count: count ?? 0,
    minted: 0,
    nextSpoilTick: null,
  }));
}

test("a content world asks for nothing", () => {
  const creatures = [creature(1), creature(1), creature(2)];
  assert.deepEqual(territoryRequests([MEADOW, FEN], creatures), []);
  assert.deepEqual(territoryRequests([MEADOW], []), []);
});

test("a territory asks once enough of its creatures are hungry", () => {
  const one = [creature(1, { hunger: 900 }), creature(1), creature(1)];
  assert.deepEqual(territoryRequests([MEADOW], one), [], "one is not enough");

  const two = [...one, creature(1, { hunger: 700 })];
  const [request] = territoryRequests([MEADOW], two);
  assert.equal(request?.kind, "hungry");
  assert.equal(request?.title, "Meadow is going hungry");
  assert.equal(request?.detail, "2 of 4 creatures are hungry.");
  assert.deepEqual(request?.wants, [ItemSlug.SEED_BUNDLE, ItemSlug.RATIONS]);

  // Two hungry in a crowd of twelve is under a quarter: no request.
  const crowd = [...two, ...Array.from({ length: 8 }, () => creature(1))];
  assert.deepEqual(territoryRequests([MEADOW], crowd), []);

  // The dead do not count, and food already laid out answers it.
  const dead = two.map((row) =>
    row.needs.hunger > 0 ? { ...row, status: "DEAD" } : row,
  );
  assert.deepEqual(territoryRequests([MEADOW], dead), []);
  const fed = { ...MEADOW, effects: [{ kind: "FOOD", amount: 100 }] };
  assert.deepEqual(territoryRequests([fed], two), []);
  // A harvest draws food down; it is not help.
  const picked = { ...MEADOW, effects: [{ kind: "FOOD", amount: -30 }] };
  assert.equal(territoryRequests([picked], two).length, 1);
});

test("each trouble asks for its own item; sickness comes first", () => {
  const afraid = [
    creature(1, { unsafety: 800 }),
    creature(1, { unsafety: 700 }),
  ];
  assert.deepEqual(territoryRequests([MEADOW], afraid)[0]?.wants, [
    ItemSlug.POTION_CALM,
  ]);
  const weary = [
    creature(1, { thirst: 800 }),
    creature(1, { discomfort: 700 }),
  ];
  assert.deepEqual(territoryRequests([MEADOW], weary)[0]?.wants, [
    ItemSlug.SALT_LICK,
  ]);

  // One request per territory: the trouble that touches the most creatures.
  const mixed = [
    creature(1, { hunger: 800, unsafety: 800 }),
    creature(1, { hunger: 800 }),
    creature(1, { hunger: 800, unsafety: 800 }),
  ];
  const requests = territoryRequests([MEADOW], mixed);
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.kind, "hungry");

  // A single sick creature is a request, ahead of everything else.
  const sick = creature(2, {}, { sick: true });
  const all = territoryRequests([MEADOW, FEN], [...mixed, sick, creature(2)]);
  assert.deepEqual(
    all.map((row) => [row.territoryName, row.kind]),
    [
      ["Glowfen", "sick"],
      ["Meadow", "hungry"],
    ],
  );
  assert.equal(all[0]?.title, "Sickness in Glowfen");
  assert.equal(all[0]?.detail, "1 of 2 creature is sick.");
  assert.equal(all[0]?.creatureId, sick.id);
  assert.deepEqual(all[0]?.wants, [ItemSlug.POTION_MENDING]);
});

test("the harder-hit territory is listed first", () => {
  const creatures = [
    creature(1, { hunger: 800 }),
    creature(1, { hunger: 800 }),
    creature(1),
    creature(1),
    creature(2, { hunger: 800 }),
    creature(2, { hunger: 800 }),
  ];
  assert.deepEqual(
    territoryRequests([MEADOW, FEN], creatures).map((row) => row.territoryId),
    [2, 1],
  );
});

test("the bag answers with what it holds, then what it can craft", () => {
  const request = { wants: [ItemSlug.SEED_BUNDLE, ItemSlug.RATIONS] };
  assert.deepEqual(requestSupply(request, bag({ [ItemSlug.RATIONS]: 1 })), {
    item: ItemSlug.RATIONS,
    state: "have",
    text: "Rations Pack is in your bag.",
  });
  assert.deepEqual(
    requestSupply(
      request,
      bag({ [ItemSlug.CLOVER]: 3, [ItemSlug.MOONPETAL]: 1 }),
    ),
    {
      item: ItemSlug.SEED_BUNDLE,
      state: "craft",
      text: "You can craft a Seed bundle.",
    },
  );
  assert.deepEqual(requestSupply(request, bag({ [ItemSlug.CLOVER]: 1 })), {
    item: ItemSlug.SEED_BUNDLE,
    state: "short",
    text: "A Seed bundle needs 2 Clover and 1 Moonpetal more.",
  });
});

test("only the item asked for, used in that territory, answers a request", () => {
  const creatures = [
    creature(1, { hunger: 800 }),
    creature(1, { hunger: 800 }),
    creature(2, {}, { sick: true }),
  ];
  const requests = territoryRequests([MEADOW, FEN], creatures);
  const yes = (use: Parameters<typeof answersRequest>[1]) =>
    answersRequest(requests, use);
  assert.ok(yes({ item: ItemSlug.SEED_BUNDLE, territoryId: 1 }));
  assert.ok(yes({ item: ItemSlug.RATIONS, territoryId: 1 }));
  assert.ok(!yes({ item: ItemSlug.SEED_BUNDLE, territoryId: 2 }));
  assert.ok(!yes({ item: ItemSlug.POTION_CALM, territoryId: 1 }));
  // Sickness is answered by a potion given to a sick creature there.
  assert.ok(yes({ item: ItemSlug.POTION_MENDING, creatureTerritoryId: 2 }));
  assert.ok(!yes({ item: ItemSlug.POTION_MENDING, creatureTerritoryId: 1 }));
  assert.ok(!yes({ item: ItemSlug.POTION_MENDING, territoryId: 2 }));
});
