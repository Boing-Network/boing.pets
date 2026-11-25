/**
 * Your creatures: following, the journal, the recap and the first pick.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { WorldEventView } from "@boing-pets/contract";
import {
  EMPTY_FOLLOW_ENTRY,
  FOLLOW_LIMIT,
  entryFor,
  isAbout,
  journalLines,
  parseFollowBook,
  sinceLastVisit,
  suggestFollows,
  toggleFollow,
  worldKey,
} from "../src/hud/follow";
import { followedCreatures, needLabel } from "../src/hud/finderGroups";

function event(
  id: number,
  tick: number,
  kind: string,
  actorId: number | null,
  extra: { subjectId?: number; payload?: unknown } = {},
): WorldEventView {
  return {
    id,
    worldId: 1,
    tick,
    kind,
    actorId,
    subjectId: null,
    territoryId: 1,
    lineageId: 1,
    summary: `event ${id}`,
    payload: {},
    ...extra,
  } as WorldEventView;
}

test("following toggles, keeps order, and stops at the limit", () => {
  let entry = EMPTY_FOLLOW_ENTRY;
  entry = toggleFollow(entry, 7);
  entry = toggleFollow(entry, 3);
  assert.deepEqual(entry.ids, [7, 3]);
  entry = toggleFollow(entry, 7);
  assert.deepEqual(entry.ids, [3]);

  let full = EMPTY_FOLLOW_ENTRY;
  for (let id = 1; id <= FOLLOW_LIMIT; id += 1) full = toggleFollow(full, id);
  assert.equal(full.ids.length, FOLLOW_LIMIT);
  assert.equal(toggleFollow(full, 999), full, "full: nothing changes");
  assert.equal(toggleFollow(full, 1).ids.length, FOLLOW_LIMIT - 1);
});

test("a stored book survives bad data", () => {
  assert.deepEqual(parseFollowBook(null), {});
  assert.deepEqual(parseFollowBook("not json"), {});
  assert.deepEqual(parseFollowBook("[1,2]"), {});
  const key = worldKey(4, 99);
  const book = parseFollowBook(
    JSON.stringify({
      [key]: { ids: [5, 5, "x", -1, 2.5, 8], lastSeenTick: 120.9 },
      junk: 3,
    }),
  );
  assert.deepEqual(book[key], {
    ids: [5, 8],
    lastSeenTick: 120,
    promptDismissed: false,
  });
  assert.equal(book.junk, undefined);
  assert.equal(entryFor(book, "other"), EMPTY_FOLLOW_ENTRY);
  assert.equal(entryFor(book, null), EMPTY_FOLLOW_ENTRY);
  assert.notEqual(worldKey(4, 99), worldKey(4, 100));
});

test("an event is about a creature that acts, is acted on, or becomes a parent", () => {
  const mine = new Set([10]);
  assert.equal(isAbout(event(1, 5, "DEATH", 10), mine), true);
  assert.equal(
    isAbout(event(2, 5, "INJURY", 4, { subjectId: 10 }), mine),
    true,
  );
  assert.equal(
    isAbout(
      event(3, 5, "BIRTH", 50, { payload: { motherId: 10, fatherId: 2 } }),
      mine,
    ),
    true,
  );
  assert.equal(isAbout(event(4, 5, "DEATH", 11), mine), false);
  assert.equal(isAbout(event(5, 5, "OUTBREAK", null), mine), false);
  assert.equal(isAbout(event(6, 5, "DEATH", 10), new Set()), false);
});

test("the journal merges sources, newest first, without item chatter", () => {
  const mine = new Set([10]);
  const history = [
    event(1, 10, "MATING", 10),
    event(2, 11, "ITEM", 10),
    event(3, 12, "DEATH", 99),
  ];
  const live = [event(1, 10, "MATING", 10), event(4, 20, "INJURY", 10)];
  assert.deepEqual(
    journalLines([history, live], mine).map((row) => row.id),
    [4, 1],
  );
  assert.deepEqual(
    journalLines([history, live], mine, 1).map((row) => row.id),
    [4],
  );
});

test("the recap tells what happened after the last visit, in order", () => {
  const mine = new Set([10]);
  const events = [
    event(1, 100, "MATING", 10),
    event(2, 150, "INJURY", 10),
    event(3, 160, "BIRTH", 60, { payload: { motherId: 10, fatherId: 3 } }),
    event(4, 170, "DEATH", 12),
  ];
  assert.deepEqual(
    sinceLastVisit(events, mine, 120).map((row) => row.id),
    [2, 3],
  );
  assert.deepEqual(sinceLastVisit(events, mine, 200), []);
  // Only the newest few, still oldest first.
  assert.deepEqual(
    sinceLastVisit(events, mine, 0, 2).map((row) => row.id),
    [2, 3],
  );
});

test("three different creatures are offered, each for its own reason", () => {
  const well = { hunger: 100, thirst: 100 };
  const rows = [
    {
      id: 1,
      name: "Ada",
      speciesId: 1,
      status: "ALIVE",
      ageDays: 90,
      health: 900,
      needs: well,
      family: { generation: 0 },
    },
    {
      id: 2,
      name: "Bo",
      speciesId: 1,
      status: "ALIVE",
      ageDays: 3,
      health: 950,
      needs: well,
      family: { generation: 2 },
    },
    {
      id: 3,
      name: "Cy",
      speciesId: 2,
      status: "ALIVE",
      ageDays: 40,
      health: 200,
      needs: well,
      family: { generation: 1 },
    },
    {
      id: 4,
      name: "Di",
      speciesId: 2,
      status: "ALIVE",
      ageDays: 50,
      health: 990,
      needs: well,
      family: { generation: 3 },
    },
    {
      id: 5,
      name: "Ed",
      speciesId: 2,
      status: "DEAD",
      ageDays: 1,
      health: 0,
      needs: well,
      family: { generation: 9 },
    },
  ];
  const picks = suggestFollows(rows);
  assert.deepEqual(
    picks.map((pick) => pick.creature.name),
    ["Cy", "Bo", "Di"],
  );
  assert.match(picks[0]!.reason, /needs help: badly wounded/);
  assert.match(picks[1]!.reason, /youngest/);
  assert.match(picks[2]!.reason, /generation 3/);

  // A tiny world still fills what it can, never the same creature twice.
  const two = suggestFollows(rows.slice(0, 2));
  assert.deepEqual(two.map((pick) => pick.creature.name).sort(), ["Ada", "Bo"]);
  assert.deepEqual(suggestFollows([]), []);
});

test("the finder lists your living creatures and counts them first", () => {
  const rows = [
    { id: 1, name: "Zed", speciesId: 1, status: "ALIVE", territoryId: 1 },
    { id: 2, name: "Amy", speciesId: 1, status: "ALIVE", territoryId: 1 },
    { id: 3, name: "Old", speciesId: 1, status: "DEAD", territoryId: 1 },
  ];
  assert.deepEqual(
    followedCreatures(rows, new Set([1, 2, 3])).map((row) => row.name),
    ["Amy", "Zed"],
  );
  assert.deepEqual(followedCreatures(rows, new Set()), []);
  assert.equal(needLabel(1, 0), "1 creature needs help");
  assert.equal(needLabel(4, 0), "4 creatures need help");
  assert.equal(needLabel(1, 1), "1 of yours needs help");
  assert.equal(needLabel(5, 2), "2 of yours need help, and 3 more");
});
