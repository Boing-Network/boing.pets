import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EventKind,
  SPECIES_CATALOG,
  type WorldEventView,
} from "@boing-pets/contract";
import { DEFAULT_AUDIO_PREFS, parseAudioPrefs } from "../src/audio/audioStore";
import {
  MAX_CUES_PER_BATCH,
  PAD_CHORDS,
  SCALE,
  cueForEvent,
  midiToHz,
  sceneMix,
  selectEventCues,
  spatialise,
  voiceDuration,
  voiceForSpecies,
  voicePitch,
  zoomFromDistance,
} from "../src/audio/design";

function event(
  id: number,
  kind: EventKind,
  tick: number,
  territoryId = 1,
): WorldEventView {
  return {
    id,
    worldId: 1,
    tick,
    kind,
    actorId: null,
    subjectId: null,
    territoryId,
    lineageId: null,
    summary: "",
    payload: null as never,
  };
}

test("every species has a short, audible call", () => {
  for (const row of SPECIES_CATALOG) {
    const spec = voiceForSpecies(row.id);
    assert.ok(spec.parts.length > 0, `${row.slug} is silent`);
    const duration = voiceDuration(spec);
    assert.ok(duration > 0.05 && duration < 2.5, `${row.slug}: ${duration}s`);
    for (const part of spec.parts) {
      const pitch = voicePitch(row.id, 1);
      for (const hz of [part.from * pitch, part.to * pitch]) {
        assert.ok(hz >= 40 && hz <= 8000, `${row.slug}: ${hz} Hz`);
      }
      assert.ok(part.gain > 0 && part.gain <= 1);
      assert.ok(part.dur > 0 && part.at >= 0);
    }
  }
  assert.equal(voiceForSpecies(9999).parts.length, 0);
});

test("the wolf does not sound like the fox", () => {
  const fox = SPECIES_CATALOG.find((r) => r.slug === "fire-fox")!;
  const wolf = SPECIES_CATALOG.find((r) => r.slug === "ash-wolf")!;
  assert.notDeepEqual(voiceForSpecies(fox.id), voiceForSpecies(wolf.id));
});

test("each creature keeps its own pitch, close to its species", () => {
  assert.equal(voicePitch(5, 77), voicePitch(5, 77));
  const pitches = new Set<number>();
  for (let id = 1; id <= 40; id += 1) {
    const pitch = voicePitch(5, id);
    assert.ok(pitch > 0.8 && pitch < 1.25);
    pitches.add(pitch);
  }
  assert.ok(pitches.size > 20);
});

test("every event kind has a cue in the shared scale", () => {
  const allowed = new Set(
    [...SCALE, ...PAD_CHORDS.flat()].map((midi) => midi % 12),
  );
  for (const kind of Object.values(EventKind)) {
    const cue = cueForEvent(kind);
    assert.ok(cue.notes.length > 0, kind);
    for (const note of cue.notes) {
      assert.ok(allowed.has(note.midi % 12), `${kind}: midi ${note.midi}`);
    }
  }
  assert.equal(Math.round(midiToHz(69)), 440);
});

test("joining a world does not replay its history", () => {
  const history = [
    event(1, EventKind.BIRTH, 10),
    event(2, EventKind.DEATH, 11),
  ];
  const primed = selectEventCues(history, null, 11);
  assert.deepEqual(primed, { cursor: 2, play: [] });

  const next = selectEventCues(
    [...history, event(3, EventKind.MATING, 12)],
    primed.cursor,
    12,
  );
  assert.equal(next.cursor, 3);
  assert.deepEqual(
    next.play.map((e) => e.id),
    [3],
  );
});

test("a reconnect snapshot of old events stays silent", () => {
  const stale = [
    event(8, EventKind.BIRTH, 100),
    event(9, EventKind.DEATH, 140),
  ];
  const result = selectEventCues(stale, 5, 500);
  assert.equal(result.cursor, 9);
  assert.equal(result.play.length, 0);
});

test("a burst keeps the most important few", () => {
  const burst = [
    event(1, EventKind.ITEM, 50),
    event(2, EventKind.MIGRATION, 50),
    event(3, EventKind.ITEM, 50),
    event(4, EventKind.DEATH, 50),
    event(5, EventKind.DISCOVERY, 50),
    event(6, EventKind.BIRTH, 50),
  ];
  const { play, cursor } = selectEventCues(burst, 0, 50);
  assert.equal(cursor, 6);
  assert.equal(play.length, MAX_CUES_PER_BATCH);
  assert.deepEqual(
    play.map((e) => e.kind),
    [EventKind.DEATH, EventKind.BIRTH, EventKind.DISCOVERY],
  );
});

test("zooming out trades the place for the wind", () => {
  const near = sceneMix({ biome: "meadow", waterDistance: 2, zoom: 0 });
  const far = sceneMix({ biome: "meadow", waterDistance: 2, zoom: 1 });
  assert.ok(near.crickets > 0.9 && far.crickets === 0);
  assert.ok(near.water > 0.8 && far.water === 0);
  assert.ok(far.wind > near.wind);
  assert.equal(far.wildlife, 0);
  for (const mix of [near, far]) {
    for (const value of Object.values(mix)) {
      assert.ok(value >= 0 && value <= 1);
    }
  }
});

test("biomes sound different, and water fades with distance", () => {
  const crags = sceneMix({ biome: "crags", waterDistance: 100, zoom: 0 });
  const meadow = sceneMix({ biome: "meadow", waterDistance: 100, zoom: 0 });
  assert.ok(crags.wind > meadow.wind);
  assert.equal(crags.crickets, 0);
  assert.equal(meadow.water, 0);
  // In the water (negative distance) is as loud as it gets, not louder.
  assert.equal(sceneMix({ biome: "fen", waterDistance: -4, zoom: 0 }).water, 1);
  // No territory under the camera: no creatures to call.
  assert.equal(
    sceneMix({ biome: null, waterDistance: 5, zoom: 0 }).wildlife,
    0,
  );
  assert.equal(zoomFromDistance(5), 0);
  assert.equal(zoomFromDistance(10_000), 1);
});

test("events are placed left or right of the camera and fade with distance", () => {
  const listener = { x: 0, z: 0, rightX: 1, rightZ: 0 };
  const here = spatialise(listener, { x: 0, z: 0 });
  assert.deepEqual(here, { gain: 1, pan: 0 });
  const right = spatialise(listener, { x: 40, z: 0 });
  const left = spatialise(listener, { x: -40, z: 0 });
  assert.ok(right.pan > 0.5 && left.pan < -0.5);
  assert.ok(right.gain < 1);
  assert.equal(spatialise(listener, { x: 0, z: 40 }).pan, 0);
  // Never silent: distant events are still news.
  assert.ok(spatialise(listener, { x: 5000, z: 0 }).gain >= 0.3);
});

test("sound preferences survive bad storage", () => {
  assert.deepEqual(parseAudioPrefs(null), DEFAULT_AUDIO_PREFS);
  assert.deepEqual(parseAudioPrefs("{not json"), DEFAULT_AUDIO_PREFS);
  assert.deepEqual(parseAudioPrefs("42"), DEFAULT_AUDIO_PREFS);
  assert.deepEqual(
    parseAudioPrefs('{"enabled":false,"volume":7,"music":"yes"}'),
    { enabled: false, volume: 1, music: true },
  );
});
