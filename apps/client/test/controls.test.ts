/**
 * Pause / scale / influence HUD sends the contract IPC messages.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { InfluenceKind, type ClientToHost } from "@boing-pets/contract";
import { bindIpcToStores } from "../src/api/bind";
import { createMemoryIpc } from "../src/api/memory-ipc";
import {
  FIXTURE_INSPECTABLE_CHILD_ID,
  FIXTURE_WORLD_VIEW,
} from "../src/demo/fixture-world";
import { useUiStore } from "../src/state/uiStore";
import { useWorldViewStore } from "../src/state/worldViewStore";

function resetStores() {
  useWorldViewStore.setState({ view: null, clock: null, lastCatchup: null });
  useUiStore.setState({
    selectedCreatureId: null,
    paused: false,
    scale: 1,
  });
}

test("clock controls send pause, resume, and setScale", () => {
  resetStores();
  const sent: ClientToHost[] = [];
  const { client, host } = createMemoryIpc();
  const originalSend = client.send.bind(client);
  client.send = (message) => {
    sent.push(message);
    originalSend(message);
  };
  const unbind = bindIpcToStores(client);
  host.emit({ message: "world.snapshot", body: FIXTURE_WORLD_VIEW });
  host.emit({
    message: "world.clock",
    body: { tick: 80, paused: false, scale: 1, clockAt: 0 },
  });

  client.send({ message: "clock.pause", body: {} });
  client.send({ message: "clock.setScale", body: { scale: 4 } });
  client.send({ message: "clock.resume", body: {} });

  assert.deepEqual(
    sent.map((message) => message.message),
    ["clock.pause", "clock.setScale", "clock.resume"],
  );
  assert.equal(
    sent.find((message) => message.message === "clock.setScale")?.body.scale,
    4,
  );

  unbind();
  client.dispose();
});

test("influence submits cover all five verbs for the selected creature", () => {
  resetStores();
  const sent: ClientToHost[] = [];
  const { client, host } = createMemoryIpc();
  const originalSend = client.send.bind(client);
  client.send = (message) => {
    sent.push(message);
    originalSend(message);
  };
  const unbind = bindIpcToStores(client);
  host.emit({ message: "world.snapshot", body: FIXTURE_WORLD_VIEW });
  useUiStore.getState().selectCreature(FIXTURE_INSPECTABLE_CHILD_ID);
  const creature = useWorldViewStore
    .getState()
    .view?.creatures.find((row) => row.id === FIXTURE_INSPECTABLE_CHILD_ID);
  assert.ok(creature);

  client.send({
    message: "influence.submit",
    body: {
      kind: InfluenceKind.NAME_CREATURE,
      payload: { creatureId: creature.id, name: "Quill Renamed" },
    },
  });
  client.send({
    message: "influence.submit",
    body: {
      kind: InfluenceKind.NAME_LINEAGE,
      payload: { lineageId: creature.family.lineageId, name: "Quill line" },
    },
  });
  client.send({
    message: "influence.submit",
    body: {
      kind: InfluenceKind.FAVOR_BLOODLINE,
      payload: { lineageId: creature.family.lineageId },
    },
  });
  client.send({
    message: "influence.submit",
    body: {
      kind: InfluenceKind.ENRICH_TERRITORY,
      payload: { territoryId: creature.territoryId },
    },
  });
  client.send({
    message: "influence.submit",
    body: {
      kind: InfluenceKind.CALM_TERRITORY,
      payload: { territoryId: creature.territoryId },
    },
  });

  const kinds = sent
    .filter((message) => message.message === "influence.submit")
    .map((message) => message.body.kind);
  assert.deepEqual(kinds, [
    InfluenceKind.NAME_CREATURE,
    InfluenceKind.NAME_LINEAGE,
    InfluenceKind.FAVOR_BLOODLINE,
    InfluenceKind.ENRICH_TERRITORY,
    InfluenceKind.CALM_TERRITORY,
  ]);

  unbind();
  client.dispose();
});
