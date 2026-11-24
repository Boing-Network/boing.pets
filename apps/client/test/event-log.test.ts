import assert from "node:assert/strict";
import { test } from "node:test";
import { EventKind, type WorldEventView } from "@boing-pets/contract";
import { FIXTURE_WORLD_VIEW } from "../src/demo/fixture-world";
import {
  capEvents,
  EMPTY_EVENT_LOG,
  EVENT_LOG_LIMIT,
  recordEvents,
  VIEW_EVENTS_LIMIT,
} from "../src/state/eventLog";
import { useWorldViewStore } from "../src/state/worldViewStore";

const WORLD = FIXTURE_WORLD_VIEW.world.id;

function event(
  id: number,
  kind: EventKind = EventKind.BIRTH,
  tick = id,
): WorldEventView {
  return {
    id,
    worldId: WORLD,
    tick,
    kind,
    actorId: null,
    subjectId: null,
    territoryId: null,
    lineageId: null,
    summary: `event ${id}`,
    payload: null as unknown as WorldEventView["payload"],
  };
}

const ids = (events: readonly WorldEventView[]) => events.map((e) => e.id);

test("live events append in order and count as new", () => {
  const log = recordEvents(EMPTY_EVENT_LOG, WORLD, [event(2), event(1)], true);
  assert.equal(log.worldId, WORLD);
  assert.deepEqual(ids(log.entries), [1, 2]);
  assert.equal(log.liveCount, 2);
});

test("events already in a snapshot are logged but are not new", () => {
  const first = recordEvents(EMPTY_EVENT_LOG, WORLD, [event(1)], false);
  assert.deepEqual(ids(first.entries), [1]);
  assert.equal(first.liveCount, 0);
  const next = recordEvents(first, WORLD, [event(2)], true);
  assert.deepEqual(ids(next.entries), [1, 2]);
  assert.equal(next.liveCount, 1);
});

test("a repeated id is ignored and leaves the log untouched", () => {
  const log = recordEvents(EMPTY_EVENT_LOG, WORLD, [event(1)], true);
  const again = recordEvents(log, WORLD, [event(1)], true);
  assert.equal(again, log, "same object: subscribers do not re-render");
  // Duplicates inside one batch count once.
  const batch = recordEvents(log, WORLD, [event(2), event(2)], true);
  assert.deepEqual(ids(batch.entries), [1, 2]);
  assert.equal(batch.liveCount, 2);
});

test("an empty snapshot does not clear the log", () => {
  const log = recordEvents(EMPTY_EVENT_LOG, WORLD, [event(1)], true);
  assert.equal(recordEvents(log, WORLD, [], false), log);
});

test("the log keeps only the newest entries", () => {
  let log = EMPTY_EVENT_LOG;
  for (let id = 1; id <= EVENT_LOG_LIMIT + 10; id += 1) {
    log = recordEvents(log, WORLD, [event(id)], true);
  }
  assert.equal(log.entries.length, EVENT_LOG_LIMIT);
  assert.equal(log.entries[0]?.id, 11);
  assert.equal(log.entries.at(-1)?.id, EVENT_LOG_LIMIT + 10);
  assert.equal(log.liveCount, EVENT_LOG_LIMIT + 10);
});

test("item activity is not world news", () => {
  const log = recordEvents(
    EMPTY_EVENT_LOG,
    WORLD,
    [event(1, EventKind.ITEM), event(2, EventKind.DEATH)],
    true,
  );
  assert.deepEqual(ids(log.entries), [2]);
  assert.equal(log.liveCount, 1);
});

test("another world starts a fresh log", () => {
  const log = recordEvents(EMPTY_EVENT_LOG, WORLD, [event(1)], true);
  const other = recordEvents(log, WORLD + 1, [event(7)], true);
  assert.equal(other.worldId, WORLD + 1);
  assert.deepEqual(ids(other.entries), [7]);
  assert.equal(other.liveCount, 1);
});

test("capEvents keeps the newest rows and leaves short lists alone", () => {
  const short = [event(1), event(2)];
  assert.equal(capEvents(short), short);
  const long = Array.from({ length: 12 }, (_, i) => event(i + 1));
  assert.deepEqual(ids(capEvents(long, 5)), [8, 9, 10, 11, 12]);
});

function patch(tick: number, events: WorldEventView[]) {
  return {
    tick,
    creatures: [],
    relationships: [],
    events,
    territories: [],
  };
}

test("the store logs patch events and survives the snapshot reset", () => {
  useWorldViewStore.setState({ view: null, eventLog: EMPTY_EVENT_LOG });
  const store = () => useWorldViewStore.getState();
  store().applyHostMessage({
    message: "world.snapshot",
    body: { ...FIXTURE_WORLD_VIEW, events: [event(1)] },
  });
  assert.equal(store().eventLog.liveCount, 0, "first-load events are not new");

  store().applyPatch(patch(5, [event(2), event(3, EventKind.MIGRATION)]));
  assert.deepEqual(ids(store().eventLog.entries), [1, 2, 3]);
  assert.equal(store().eventLog.liveCount, 2);

  // The periodic full snapshot carries no events.
  store().applyHostMessage({
    message: "world.snapshot",
    body: { ...FIXTURE_WORLD_VIEW, events: [] },
  });
  assert.deepEqual(store().view?.events, []);
  assert.deepEqual(ids(store().eventLog.entries), [1, 2, 3]);
  assert.equal(store().eventLog.liveCount, 2);
});

test("the store caps view.events so a long session cannot grow forever", () => {
  useWorldViewStore.setState({ view: null, eventLog: EMPTY_EVENT_LOG });
  const store = () => useWorldViewStore.getState();
  store().setSnapshot({ ...FIXTURE_WORLD_VIEW, events: [] });
  const total = VIEW_EVENTS_LIMIT + 60;
  for (let start = 1; start <= total; start += 20) {
    store().applyPatch(
      patch(
        start,
        Array.from({ length: 20 }, (_, i) =>
          event(start + i, EventKind.ITEM, start),
        ),
      ),
    );
  }
  const events = store().view?.events ?? [];
  assert.equal(events.length, VIEW_EVENTS_LIMIT);
  assert.equal(events[0]?.id, total - VIEW_EVENTS_LIMIT + 1);
  assert.equal(events.at(-1)?.id, total);
});
