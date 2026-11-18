import assert from "node:assert/strict";
import { test } from "node:test";
import {
  discoveriesFromEvents,
  toBigInt,
  toNumber,
  type MappedWorldEvent,
} from "../src/index";

test("toNumber and toBigInt round-trip safe integers", () => {
  assert.equal(toNumber(42n), 42);
  assert.equal(toBigInt(42), 42n);
  assert.throws(() => toNumber((1n << 60n) + 1n));
  assert.throws(() => toBigInt(Number.MAX_SAFE_INTEGER + 1));
});

test("discoveriesFromEvents dedupes lineage-territory pairs by tick then id", () => {
  const events: MappedWorldEvent[] = [
    {
      id: 2,
      worldId: 1,
      tick: 0,
      kind: "DISCOVERY",
      actorId: 1,
      subjectId: null,
      territoryId: 1,
      lineageId: 1,
      summary: "a",
      payload: {
        template: "discovery.v1",
        creatureId: 1,
        territoryId: 1,
        lineageId: 1,
      },
    },
    {
      id: 1,
      worldId: 1,
      tick: 0,
      kind: "DISCOVERY",
      actorId: 2,
      subjectId: null,
      territoryId: 1,
      lineageId: 1,
      summary: "b",
      payload: {
        template: "discovery.v1",
        creatureId: 2,
        territoryId: 1,
        lineageId: 1,
      },
    },
    {
      id: 3,
      worldId: 1,
      tick: 5,
      kind: "DISCOVERY",
      actorId: 1,
      subjectId: null,
      territoryId: 2,
      lineageId: 1,
      summary: "c",
      payload: {
        template: "discovery.v1",
        creatureId: 1,
        territoryId: 2,
        lineageId: 1,
      },
    },
    {
      id: 4,
      worldId: 1,
      tick: 5,
      kind: "BIRTH",
      actorId: 9,
      subjectId: null,
      territoryId: 1,
      lineageId: 1,
      summary: "birth",
      payload: {
        template: "birth.v1",
        motherId: 1,
        fatherId: 2,
        lineageId: 1,
        speciesId: 1,
        genes: {
          strength: 500,
          speed: 500,
          intelligence: 500,
          curiosity: 500,
          sociability: 500,
          extra: {},
        },
        mutations: [],
        territoryId: 1,
      },
    },
  ];
  assert.deepEqual(discoveriesFromEvents(events), [
    { lineageId: 1, territoryId: 1 },
    { lineageId: 1, territoryId: 2 },
  ]);
});
