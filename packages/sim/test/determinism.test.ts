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
 * Seed-1 founders: two per species (female, then male), ascending species id.
 * Names come from (seed, tick 0, creature id), so ids 1–28 keep the names
 * the old four-per-species fixture had at the same ids; species moved
 * because each now takes two ids instead of four.
 */
const FOUNDERS = [
  ["fire-fox", "FEMALE", "meadow", "Torkaeith"],
  ["fire-fox", "MALE", "meadow", "Moswrennima"],
  ["moss-stag", "FEMALE", "thicket", "Ariquillkae"],
  ["moss-stag", "MALE", "thicket", "Brivessfen"],
  ["lantern-moth", "FEMALE", "ridge", "Saelunsol"],
  ["lantern-moth", "MALE", "ridge", "Ithwrentor"],
  ["glow-tortoise", "FEMALE", "fen", "Eliodorrvess"],
  ["glow-tortoise", "MALE", "fen", "Solnimasol"],
  ["moon-hare", "FEMALE", "glade", "Tormiraari"],
  ["moon-hare", "MALE", "glade", "Oakbrikae"],
  ["crag-ram", "FEMALE", "crags", "Ithdorrsol"],
  ["crag-ram", "MALE", "crags", "Wrenmoslun"],
  ["thistle-hog", "FEMALE", "grove", "Dorrnimaith"],
  ["thistle-hog", "MALE", "grove", "Oakpeloak"],
  ["barrow-badger", "FEMALE", "meadow", "Torlunvess"],
  ["barrow-badger", "MALE", "meadow", "Saequillelio"],
  ["field-nightjar", "FEMALE", "meadow", "Saemiramos"],
  ["field-nightjar", "MALE", "meadow", "Miraithkae"],
  ["shade-lynx", "FEMALE", "thicket", "Pelfenoak"],
  ["shade-lynx", "MALE", "thicket", "Mosvessquill"],
  ["dusk-raccoon", "FEMALE", "thicket", "Oakquilldorr"],
  ["dusk-raccoon", "MALE", "thicket", "Fenpaxsae"],
  ["slate-marmot", "FEMALE", "ridge", "Lunlunlun"],
  ["slate-marmot", "MALE", "ridge", "Wrenquillelio"],
  ["gloam-bat", "FEMALE", "ridge", "Quillnimaari"],
  ["gloam-bat", "MALE", "ridge", "Soldorroak"],
  ["silver-deer", "FEMALE", "glade", "Tortormos"],
  ["silver-deer", "MALE", "glade", "Vesssolquill"],
  ["dew-shrew", "FEMALE", "glade", "Pelmosmira"],
  ["dew-shrew", "MALE", "glade", "Toraripax"],
  ["reed-heron", "FEMALE", "fen", "Kaekaetor"],
  ["reed-heron", "MALE", "fen", "Kaeithelio"],
  ["ember-newt", "FEMALE", "fen", "Quillmirator"],
  ["ember-newt", "MALE", "fen", "Oakelionima"],
  ["hollow-squirrel", "FEMALE", "grove", "Pelbrifen"],
  ["hollow-squirrel", "MALE", "grove", "Toraripel"],
  ["ash-wolf", "FEMALE", "grove", "Solbrioak"],
  ["ash-wolf", "MALE", "grove", "Solvesssae"],
  ["stone-pika", "FEMALE", "crags", "Brifenquill"],
  ["stone-pika", "MALE", "crags", "Kaeluntor"],
  ["crag-owl", "FEMALE", "crags", "Elionimabri"],
  ["crag-owl", "MALE", "crags", "Lunvesskae"],
  ["clover-vole", "FEMALE", "meadow", "Quillnimapel"],
  ["clover-vole", "MALE", "meadow", "Aritorsol"],
  ["amber-kestrel", "FEMALE", "meadow", "Ithtortor"],
  ["amber-kestrel", "MALE", "meadow", "Paxoaksol"],
  ["thorn-porcupine", "FEMALE", "thicket", "Torpelsol"],
  ["thorn-porcupine", "MALE", "thicket", "Fenkaevess"],
  ["briar-weasel", "FEMALE", "thicket", "Moslunith"],
  ["briar-weasel", "MALE", "thicket", "Saetorith"],
  ["ledge-goat", "FEMALE", "ridge", "Quillquillfen"],
  ["ledge-goat", "MALE", "ridge", "Dorreliosol"],
  ["mist-swift", "FEMALE", "ridge", "Lunwrenmira"],
  ["mist-swift", "MALE", "ridge", "Quillarikae"],
  ["opal-dormouse", "FEMALE", "glade", "Briwrenoak"],
  ["opal-dormouse", "MALE", "glade", "Nimaquillsae"],
  ["hush-owl", "FEMALE", "glade", "Pelquillmira"],
  ["hush-owl", "MALE", "glade", "Quillmoswren"],
  ["lumen-frog", "FEMALE", "fen", "Mirawrenwren"],
  ["lumen-frog", "MALE", "fen", "Fenkaeari"],
  ["reed-muskrat", "FEMALE", "fen", "Dorrbripax"],
  ["reed-muskrat", "MALE", "fen", "Quillkaesae"],
  ["elder-bear", "FEMALE", "grove", "Mosoakith"],
  ["elder-bear", "MALE", "grove", "Dorroakbri"],
  ["acorn-jay", "FEMALE", "grove", "Mirasaesol"],
  ["acorn-jay", "MALE", "grove", "Kaefenmira"],
  ["rime-cat", "FEMALE", "crags", "Quillmospax"],
  ["rime-cat", "MALE", "crags", "Ithquilldorr"],
  ["gale-chough", "FEMALE", "crags", "Torwrenpax"],
  ["gale-chough", "MALE", "crags", "Lunithoak"],
  ["candle-hedgehog", "FEMALE", "meadow", "Wrenoakquill"],
  ["candle-hedgehog", "MALE", "meadow", "Briquillsae"],
  ["veil-marten", "FEMALE", "thicket", "Dorrvessdorr"],
  ["veil-marten", "MALE", "thicket", "Moselioari"],
  ["tarn-eagle", "FEMALE", "ridge", "Kaeoakvess"],
  ["tarn-eagle", "MALE", "ridge", "Dorrdorrquill"],
  ["halo-loris", "FEMALE", "glade", "Mirafenith"],
  ["halo-loris", "MALE", "glade", "Pellunpel"],
  ["wisp-otter", "FEMALE", "fen", "Solnimalun"],
  ["wisp-otter", "MALE", "fen", "Ithsaemos"],
  ["saddle-tapir", "FEMALE", "grove", "Saemosmira"],
  ["saddle-tapir", "MALE", "grove", "Paxquillpax"],
  ["aurora-yak", "FEMALE", "crags", "Miraquillpax"],
  ["aurora-yak", "MALE", "crags", "Wreneliopax"],
] as const;

const SPECIES_IDS = Array.from({ length: 42 }, (_, index) => index + 1);

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
    // Changed intentionally with the bestiary pass: 21 species (14 new rows
    // and diets), two founders each instead of four (founderCountPerSpecies
    // 4 → 2), founders born at -maturityDays (young adults), and founder
    // genes centred on each species' catalog genes instead of 500.
    // (before: d928f32a…, favor pass; c7ad0ed0…, movement pass;
    // 4a81cc1c…, species/map pass).
    // Changed again intentionally with the second bestiary pass: species
    // 22–35 (14 more, two founders each, so founders 43–70 are new) and
    // larger territory capacities. Founders 1–42 keep their ids, names and
    // genes (523b3f7e…, the 21-species world). High Crags capacity was then
    // raised 30 → 36 so slate-marmot stays at ≥2 on seed 1 (8c883e95… at 30).
    // Changed once more with the third batch: species 36–42 (founders 71–84)
    // and larger capacities (High Crags ends at 60); founders 1–70 are
    // unchanged (5b7b6663…, the 35-species world).
    "b6a47a25ad53b0e3babbe1c454d9c45ccc59b649d4224ae9f1c9bee8fd85d498",
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
  assert.equal(snapshot.world.nextCreatureId, 85);
  assert.equal(snapshot.world.nextLineageId, 85);
  assert.equal(snapshot.world.nextEventId, 169);
  assert.equal(snapshot.world.nextTerritoryId, 8);
  assert.equal(snapshot.world.nextMemoryId, 1);
  assert.equal(snapshot.world.nextRelationshipId, 1);
  assert.notEqual(snapshot.ruleset, RULESET_V1);
  assert.deepEqual(snapshot.ruleset, RULESET_V1);
  snapshot.ruleset.hungerPerTick = 99;
  assert.equal(RULESET_V1.hungerPerTick, 4);

  assert.equal(snapshot.creatures.length, 84);
  assert.equal(snapshot.lineages.length, 84);
  assert.equal(snapshot.discoveries.length, 84);
  assert.equal(events.length, 168);
  assert.deepEqual(
    snapshot.compatibility.map((row) => [
      row.speciesLowId,
      row.speciesHighId,
      row.fertility,
    ]),
    SPECIES_IDS.flatMap((low) =>
      SPECIES_IDS.filter((high) => high >= low).map((high) => [
        low,
        high,
        low === high ? 1000 : 0,
      ]),
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
    // Fire fox gene centres are 500/600/600/600/550: the same rolls as
    // before (78, -81, 65, -61, -129) on the new centres.
    [578, 519, 665, 539, 421],
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
    assert.equal(
      creature.birthTick,
      -(species?.maturityDays ?? 0) * snapshot.ruleset.ticksPerDay,
    );
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
        speed: 519,
        intelligence: 665,
        curiosity: 539,
        sociability: 421,
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
