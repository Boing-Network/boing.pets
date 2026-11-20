import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import {
  RULESET_V1,
  canonicalHash,
  canonicalJson,
  createWorld,
  fnv1a64,
  rngInt,
  splitmix64,
  type MemoryRow,
  type RelationshipRow,
  type WorldSnapshot,
} from "../src/index";
import { sha256Hex } from "../src/hash";
import { clamp, divRound } from "../src/math";

/**
 * Seed-1 founders. The first twelve are byte-for-byte the original fixture
 * (species ids 1–3 were renamed, not reordered); the last sixteen are the
 * four species added with the enlarged map.
 */
const FOUNDERS = [
  ["fire-fox", "FEMALE", "meadow", "Torkaeith"],
  ["fire-fox", "MALE", "meadow", "Moswrennima"],
  ["fire-fox", "FEMALE", "meadow", "Ariquillkae"],
  ["fire-fox", "MALE", "meadow", "Brivessfen"],
  ["moss-stag", "FEMALE", "thicket", "Saelunsol"],
  ["moss-stag", "MALE", "thicket", "Ithwrentor"],
  ["moss-stag", "FEMALE", "thicket", "Eliodorrvess"],
  ["moss-stag", "MALE", "thicket", "Solnimasol"],
  ["lantern-moth", "FEMALE", "ridge", "Tormiraari"],
  ["lantern-moth", "MALE", "ridge", "Oakbrikae"],
  ["lantern-moth", "FEMALE", "ridge", "Ithdorrsol"],
  ["lantern-moth", "MALE", "ridge", "Wrenmoslun"],
  ["glow-tortoise", "FEMALE", "fen", "Dorrnimaith"],
  ["glow-tortoise", "MALE", "fen", "Oakpeloak"],
  ["glow-tortoise", "FEMALE", "fen", "Torlunvess"],
  ["glow-tortoise", "MALE", "fen", "Saequillelio"],
  ["moon-hare", "FEMALE", "glade", "Saemiramos"],
  ["moon-hare", "MALE", "glade", "Miraithkae"],
  ["moon-hare", "FEMALE", "glade", "Pelfenoak"],
  ["moon-hare", "MALE", "glade", "Mosvessquill"],
  ["crag-ram", "FEMALE", "crags", "Oakquilldorr"],
  ["crag-ram", "MALE", "crags", "Fenpaxsae"],
  ["crag-ram", "FEMALE", "crags", "Lunlunlun"],
  ["crag-ram", "MALE", "crags", "Wrenquillelio"],
  ["thistle-hog", "FEMALE", "grove", "Quillnimaari"],
  ["thistle-hog", "MALE", "grove", "Soldorroak"],
  ["thistle-hog", "FEMALE", "grove", "Tortormos"],
  ["thistle-hog", "MALE", "grove", "Vesssolquill"],
] as const;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function reverseArrays(snapshot: WorldSnapshot): WorldSnapshot {
  const copy = clone(snapshot);
  copy.species.reverse();
  copy.compatibility.reverse();
  copy.territories.reverse();
  copy.links.reverse();
  copy.discoveries.reverse();
  copy.modifiers.reverse();
  copy.lineages.reverse();
  copy.creatures.reverse();
  copy.relationships.reverse();
  copy.memories.reverse();
  copy.pendingInfluences.reverse();
  return copy;
}

test("splitmix64 and fnv1a64 match the ruleset 1 vectors", () => {
  assert.equal(splitmix64(0n), 0xe220a8397b1dcdafn);
  assert.equal(fnv1a64("worldgen"), 0x557b90b8a54ce2afn);
  assert.equal(fnv1a64("name"), 0xc4bcadba8e631b86n);
  assert.equal(rngInt(1, 0, "worldgen", 1, 0, -200, 200), 78);
  assert.equal(rngInt(1, 0, "name", 1, 0, 0, 19), 8);
  assert.equal(rngInt(1, 0, "worldgen", 1, 0, -200, 200), 78);
  for (let salt = 0; salt < 40; salt += 1) {
    const rolled = rngInt(1, 0, "genetics", 7, salt, -60, 60);
    assert.ok(rolled >= -60 && rolled <= 60);
    assert.equal(rolled, rngInt(1, 0, "genetics", 7, salt, -60, 60));
  }
});

test("integer helpers round half away from zero", () => {
  assert.equal(clamp(1200, 0, 1000), 1000);
  assert.equal(clamp(-4, 0, 1000), 0);
  assert.equal(divRound(1, 2), 1);
  assert.equal(divRound(5, 2), 3);
  assert.equal(divRound(1, 3), 0);
  assert.equal(divRound(-1, 2), -1);
  assert.equal(divRound(-5, 2), -3);
  assert.throws(() => divRound(1, 0));
});

test("sha256 matches known vectors and node crypto", () => {
  assert.equal(
    sha256Hex(""),
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  );
  assert.equal(
    sha256Hex("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
  assert.equal(sha256Hex("é"), createHash("sha256").update("é").digest("hex"));
});

test("seed 1 twice produces the same founders", () => {
  const first = createWorld(1);
  const second = createWorld(1);
  assert.deepEqual(first.snapshot, second.snapshot);
  assert.deepEqual(first.events, second.events);
  assert.equal(canonicalHash(first.snapshot), canonicalHash(second.snapshot));
  assert.equal(
    canonicalHash(second.snapshot),
    // Changed intentionally with the favor pass: the ruleset gains
    // favorForageDivisor and favorDecayPerDay. No world field changed
    // (before: c7ad0ed0…, movement pass; 4a81cc1c…, species/map pass).
    "d928f32abdca2d53a19ff15a87e671d394108bfa64ee3f4751ab196e659b25bc",
  );
  assert.notEqual(
    canonicalHash(first.snapshot),
    canonicalHash(createWorld(2).snapshot),
  );

  const { snapshot, events } = first;
  assert.equal(snapshot.world.seed, 1);
  assert.equal(snapshot.world.lastTick, 0);
  assert.equal(snapshot.world.schemaVersion, 2);
  assert.equal(snapshot.world.rulesetVersion, 1);
  assert.equal(snapshot.world.nextCreatureId, 29);
  assert.equal(snapshot.world.nextLineageId, 29);
  assert.equal(snapshot.world.nextEventId, 57);
  assert.equal(snapshot.world.nextTerritoryId, 8);
  assert.equal(snapshot.world.nextMemoryId, 1);
  assert.equal(snapshot.world.nextRelationshipId, 1);
  assert.notEqual(snapshot.ruleset, RULESET_V1);
  assert.deepEqual(snapshot.ruleset, RULESET_V1);
  snapshot.ruleset.hungerPerTick = 99;
  assert.equal(RULESET_V1.hungerPerTick, 4);

  assert.equal(snapshot.creatures.length, 28);
  assert.equal(snapshot.lineages.length, 28);
  assert.equal(snapshot.discoveries.length, 28);
  assert.equal(events.length, 56);
  assert.deepEqual(
    snapshot.compatibility.map((row) => [
      row.speciesLowId,
      row.speciesHighId,
      row.fertility,
    ]),
    [1, 2, 3, 4, 5, 6, 7].flatMap((low) =>
      [1, 2, 3, 4, 5, 6, 7]
        .filter((high) => high >= low)
        .map((high) => [low, high, low === high ? 1000 : 0]),
    ),
  );
  assert.deepEqual(
    snapshot.links.map((row) => [row.fromId, row.toId, row.travelTicks]),
    [
      [1, 2, 6],
      [2, 1, 6],
      [2, 3, 8],
      [3, 2, 8],
      [1, 4, 5],
      [4, 1, 5],
      [4, 6, 6],
      [6, 4, 6],
      [6, 2, 6],
      [2, 6, 6],
      [2, 5, 7],
      [5, 2, 7],
      [3, 7, 7],
      [7, 3, 7],
    ],
  );

  const founder = snapshot.creatures[0];
  assert.ok(founder);
  assert.equal(founder.name, "Torkaeith");
  assert.deepEqual(
    [
      founder.geneStrength,
      founder.geneSpeed,
      founder.geneIntelligence,
      founder.geneCuriosity,
      founder.geneSociability,
    ],
    [578, 419, 565, 439, 371],
  );
  assert.deepEqual(
    [
      founder.traitCuriosity,
      founder.traitAggression,
      founder.traitLoyalty,
      founder.traitSociability,
      founder.traitBravery,
      founder.traitRiskTaking,
    ],
    [658, 420, 435, 584, 518, 590],
  );
  assert.equal(founder.hunger, 300);
  assert.equal(founder.thirst, 300);
  assert.equal(founder.fatigue, 200);
  assert.equal(founder.discomfort, 100);
  assert.equal(founder.unsafety, 40);
  assert.equal(founder.loneliness, 200);
  assert.equal(founder.health, 850);
  assert.equal(founder.currentGoal, "IDLE");
  assert.equal(founder.currentAction, null);
  assert.equal(founder.generation, 0);
  assert.equal(founder.motherId, null);
  assert.equal(founder.fatherId, null);

  for (const [index, creature] of snapshot.creatures.entries()) {
    const expected = FOUNDERS[index];
    assert.ok(expected);
    const [slug, gender, home, name] = expected;
    const species = snapshot.species.find(
      (row) => row.id === creature.speciesId,
    );
    const territory = snapshot.territories.find(
      (row) => row.id === creature.territoryId,
    );
    const lineage = snapshot.lineages.find(
      (row) => row.id === creature.lineageId,
    );
    assert.equal(species?.slug, slug);
    assert.equal(creature.gender, gender);
    assert.equal(territory?.slug, home);
    assert.ok(
      snapshot.discoveries.some(
        (row) =>
          row.lineageId === creature.lineageId &&
          row.territoryId === territory?.id,
      ),
    );
    assert.equal(creature.name, name);
    assert.equal(lineage?.name, `${name} line`);
    assert.equal(lineage?.founderCreatureId, creature.id);
    assert.equal(lineage?.foundedTick, 0);
    assert.equal(creature.birthTick, 0);
    assert.equal(creature.status, "ALIVE");
    // Founders start uneasy in proportion to home danger (danger / 5).
    assert.ok(territory);
    assert.equal(creature.unsafety, Math.floor(territory.danger / 5));
    for (const gene of [
      creature.geneStrength,
      creature.geneSpeed,
      creature.geneIntelligence,
      creature.geneCuriosity,
      creature.geneSociability,
    ]) {
      assert.ok(Number.isInteger(gene) && gene >= 0 && gene <= 1000);
    }
    const birth = events[index * 2];
    const discovery = events[index * 2 + 1];
    assert.equal(birth?.kind, "BIRTH");
    assert.equal(birth?.tick, 0);
    assert.equal(birth?.actorId, creature.id);
    assert.equal(birth?.subjectId, null);
    assert.equal(
      birth?.summary,
      `${name} founded the ${name} line in ${territory?.name}.`,
    );
    assert.equal(birth?.payload.template, "birth.founder.v1");
    if (index === 0 && birth?.kind === "BIRTH") {
      assert.deepEqual(birth.payload.genes, {
        strength: 578,
        speed: 419,
        intelligence: 565,
        curiosity: 439,
        sociability: 371,
        extra: {},
      });
      assert.deepEqual(birth.payload.mutations, []);
      assert.equal(birth.payload.motherId, null);
      assert.equal(birth.payload.fatherId, null);
    }
    assert.equal(discovery?.kind, "DISCOVERY");
    assert.equal(discovery?.tick, 0);
    assert.equal(
      discovery?.summary,
      `${name} of ${name} line discovered ${territory?.name}.`,
    );
    assert.equal(discovery?.payload.template, "discovery.v1");
  }
});

test("shuffled arrays and clock time hash the same", () => {
  const { snapshot } = createWorld(1);
  const json = canonicalJson(snapshot);
  assert.equal(
    canonicalHash(snapshot),
    createHash("sha256").update(json).digest("hex"),
  );
  assert.equal(json.includes("clockAtMs"), false);
  assert.equal(canonicalHash(snapshot), canonicalHash(reverseArrays(snapshot)));

  const clock = clone(snapshot);
  clock.world.clockAtMs = 1_700_000_000_000;
  assert.equal(canonicalHash(clock), canonicalHash(snapshot));

  const hungry = clone(snapshot);
  const creature = hungry.creatures[0];
  assert.ok(creature);
  creature.hunger = 301;
  assert.notEqual(canonicalHash(hungry), canonicalHash(snapshot));

  const reorderedRules = clone(snapshot);
  const reversedRules: Record<string, unknown> = {};
  for (const key of Object.keys(reorderedRules.ruleset).reverse()) {
    reversedRules[key] =
      reorderedRules.ruleset[key as keyof typeof reorderedRules.ruleset];
  }
  reorderedRules.ruleset = reversedRules as typeof reorderedRules.ruleset;
  assert.equal(canonicalJson(reorderedRules), canonicalJson(snapshot));
});

test("relationship and memory order does not change the hash", () => {
  const base = createWorld(1).snapshot;
  const forward = clone(base);
  const backward = clone(base);
  const relationship = (id: number): RelationshipRow => ({
    id,
    worldId: 1,
    creatureAId: 1,
    creatureBId: id + 1,
    score: id * 10,
    friendship: 1,
    romance: 2,
    trust: 3,
    cooperation: 4,
    avoidance: 5,
    conflict: 6,
    metTick: 0,
    lastInteractionTick: 0,
    interactionCount: 1,
  });
  const memory = (id: number): MemoryRow => ({
    id,
    worldId: 1,
    creatureId: 1,
    tick: 0,
    kind: "DISCOVERY",
    importance: id,
    emotionalValue: 300,
    initialStrength: 12,
    subjectCreatureId: null,
    territoryId: 1,
    payload: { tags: ["discovery"], template: "discovery.v1" },
    archived: false,
  });
  forward.relationships = [relationship(1), relationship(2)];
  backward.relationships = [relationship(2), relationship(1)];
  forward.memories = [memory(1), memory(2)];
  backward.memories = [memory(2), memory(1)];
  forward.modifiers = [
    {
      id: 1,
      worldId: 1,
      territoryId: 1,
      kind: "FOOD",
      amount: 150,
      startTick: 1,
      endTick: 5,
      sourceInfluenceId: null,
    },
    {
      id: 2,
      worldId: 1,
      territoryId: 2,
      kind: "DANGER",
      amount: -100,
      startTick: 1,
      endTick: 5,
      sourceInfluenceId: null,
    },
  ];
  backward.modifiers = [...forward.modifiers].reverse();
  forward.pendingInfluences = [
    {
      id: 1,
      worldId: 1,
      kind: "ENRICH_TERRITORY",
      issuedAtTick: 1,
      payload: { territoryId: 1 },
      applied: false,
    },
    {
      id: 2,
      worldId: 1,
      kind: "CALM_TERRITORY",
      issuedAtTick: 1,
      payload: { territoryId: 2 },
      applied: false,
    },
  ];
  backward.pendingInfluences = [...forward.pendingInfluences].reverse();
  assert.equal(canonicalHash(forward), canonicalHash(backward));
  assert.notEqual(canonicalHash(forward), canonicalHash(base));
});
