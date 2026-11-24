/**
 * M14 host: rate limit of 3 influences per wall-clock 24 hours.
 * Kernel remains unaware of the limit.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { InfluenceKind } from "@boing-pets/contract";
import { aggregateTerritories, step } from "@boing-pets/sim";
import {
  INFLUENCE_RATE_LIMIT,
  INFLUENCE_RATE_WINDOW_MS,
  acceptedInWindow,
  canAcceptInfluence,
  createInfluenceGate,
  loadInfluenceGate,
  submitInfluence,
} from "../src/influence";
import { MemoryWorldRepository } from "../src/persist/memory-repository";
import { bootSession, commitSession, stepSession } from "../src/session";
import { runCatchup } from "../src/catchup";

const SEED = 1;

test("a gate accepts its limit per window, then again once the window rolls", async () => {
  const store = new MemoryWorldRepository();
  const session = await bootSession(store, SEED);
  const gate = createInfluenceGate();
  const now = 10_000_000;
  const meadow = session.snapshot.territories.find(
    (row) => row.slug === "meadow",
  );
  assert.ok(meadow);

  for (let i = 0; i < INFLUENCE_RATE_LIMIT; i += 1) {
    const result = await submitInfluence(
      session,
      gate,
      {
        kind: InfluenceKind.ENRICH_TERRITORY,
        payload: { territoryId: meadow.id },
      },
      now + i,
    );
    assert.equal(result.ok, true);
  }

  const fourth = await submitInfluence(
    session,
    gate,
    {
      kind: InfluenceKind.ENRICH_TERRITORY,
      payload: { territoryId: meadow.id },
    },
    now + 10,
  );
  assert.deepEqual(fourth, { ok: false, reason: "rate_limit" });
  assert.equal(acceptedInWindow(gate, now + 10), INFLUENCE_RATE_LIMIT);
  assert.equal(canAcceptInfluence(gate, now + 10), false);

  // After the window rolls, a new influence is accepted.
  const later = now + INFLUENCE_RATE_WINDOW_MS;
  assert.equal(canAcceptInfluence(gate, later), true);
  const again = await submitInfluence(
    session,
    gate,
    {
      kind: InfluenceKind.CALM_TERRITORY,
      payload: { territoryId: meadow.id },
    },
    later,
  );
  assert.equal(again.ok, true);
});

test("rate-limit accept times survive reload", async () => {
  const store = new MemoryWorldRepository();
  const session = await bootSession(store, SEED);
  const gate = createInfluenceGate();
  const now = 20_000_000;
  const lineage = session.snapshot.lineages[0];
  assert.ok(lineage);

  for (let i = 0; i < INFLUENCE_RATE_LIMIT; i += 1) {
    const result = await submitInfluence(
      session,
      gate,
      {
        kind: InfluenceKind.FAVOR_BLOODLINE,
        payload: { lineageId: lineage.id },
      },
      now + i,
    );
    assert.equal(result.ok, true);
  }

  const reloadedGate = await loadInfluenceGate(store);
  assert.equal(canAcceptInfluence(reloadedGate, now + 10), false);
  assert.equal(acceptedInWindow(reloadedGate, now + 10), INFLUENCE_RATE_LIMIT);
});

test("submit queues for lastTick+1; Enrich applies without writing foodAbundance", async () => {
  const store = new MemoryWorldRepository();
  const session = await bootSession(store, SEED);
  const gate = createInfluenceGate();
  const meadow = session.snapshot.territories.find(
    (row) => row.slug === "meadow",
  );
  assert.ok(meadow);
  const baseFood = meadow.foodAbundance;
  const now = 30_000_000;

  const submitted = await submitInfluence(
    session,
    gate,
    {
      kind: InfluenceKind.ENRICH_TERRITORY,
      payload: { territoryId: meadow.id },
    },
    now,
  );
  assert.equal(submitted.ok, true);
  if (!submitted.ok) return;
  assert.equal(submitted.issuedAtTick, 1);
  assert.equal(session.snapshot.pendingInfluences.length, 1);

  stepSession(session);
  assert.equal(session.snapshot.world.lastTick, 1);
  assert.equal(meadow.foodAbundance, baseFood);
  const food = aggregateTerritories(session.snapshot, 1).get(meadow.id)?.food;
  assert.equal(food, baseFood + session.snapshot.ruleset.influenceFoodAmount);
  await commitSession(session);
});

test("Favor via host does not change health, genes, or needs vs control step", async () => {
  const store = new MemoryWorldRepository();
  const session = await bootSession(store, SEED);
  const gate = createInfluenceGate();
  const creature = session.snapshot.creatures[0];
  assert.ok(creature);
  const lineageId = creature.lineageId;

  const controlStore = new MemoryWorldRepository();
  const control = await bootSession(controlStore, SEED);

  const now = 40_000_000;
  const result = await submitInfluence(
    session,
    gate,
    {
      kind: InfluenceKind.FAVOR_BLOODLINE,
      payload: { lineageId },
    },
    now,
  );
  assert.equal(result.ok, true);

  stepSession(session);
  step(control.snapshot);

  const favored = session.snapshot.creatures.find(
    (row) => row.id === creature.id,
  );
  const plain = control.snapshot.creatures.find(
    (row) => row.id === creature.id,
  );
  assert.ok(favored);
  assert.ok(plain);
  assert.equal(favored.health, plain.health);
  assert.equal(favored.hunger, plain.hunger);
  assert.equal(favored.geneStrength, plain.geneStrength);
  assert.equal(favored.territoryId, plain.territoryId);
  assert.equal(
    session.snapshot.lineages.find((row) => row.id === lineageId)?.playerFavor,
    session.snapshot.ruleset.influenceFavorAmount,
  );
});

test("submit during catch-up is rejected until the gap closes", async () => {
  const store = new MemoryWorldRepository();
  const session = await bootSession(store, SEED);
  const msPerTick = session.snapshot.ruleset.msPerTick;
  const start = 50_000_000;
  session.snapshot.world.clockAtMs = start;
  await commitSession(session);

  const gate = createInfluenceGate();
  const meadow = session.snapshot.territories.find(
    (row) => row.slug === "meadow",
  );
  assert.ok(meadow);

  // Start catch-up of a few ticks; mid-flight submit must wait.
  session.catchingUp = true;
  const mid = await submitInfluence(
    session,
    gate,
    {
      kind: InfluenceKind.ENRICH_TERRITORY,
      payload: { territoryId: meadow.id },
    },
    start + 1000,
  );
  assert.deepEqual(mid, { ok: false, reason: "catching_up" });
  session.catchingUp = false;

  const report = await runCatchup(session, start + 3 * msPerTick, {
    createdAtMs: start + 3 * msPerTick,
  });
  assert.ok(report);
  assert.equal(session.catchingUp, false);

  const after = await submitInfluence(
    session,
    gate,
    {
      kind: InfluenceKind.ENRICH_TERRITORY,
      payload: { territoryId: meadow.id },
    },
    start + 3 * msPerTick,
  );
  assert.equal(after.ok, true);
  if (!after.ok) return;
  assert.equal(after.issuedAtTick, session.snapshot.world.lastTick + 1);
});
