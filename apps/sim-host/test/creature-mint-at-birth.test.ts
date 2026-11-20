/**
 * M20: Creature mint at birth.
 * Every BIRTH queues a unique NFT mint after history commit; failed mints
 * retry with creatureId idempotency; disabled minting leaves hashes unchanged.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { EventKind } from "@boing-pets/contract";
import { canonicalHash, createWorld, step } from "@boing-pets/sim";
import {
  birthMintJobsFromEvents,
  bootSession,
  commitSession,
  createBoingNftClient,
  createHostRuntime,
  createMintEdge,
  createRepositoryNftLinkStore,
  MemoryCreatureNftLinkStore,
  NftMintStatus,
  readBoingNftConfig,
  stepSession,
  tokenIdHexForCreature,
  type BoingMintBatchPlan,
  type BoingMintSubmitResult,
  type BoingNftClient,
  type CreatureMintJob,
} from "../src/index";
import { MemoryWorldRepository } from "../src/persist/memory-repository";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "../../..");

const COLLECTION = `0x${"ab".repeat(32)}`;
const RECIPIENT = `0x${"cd".repeat(32)}`;
const SECRET = `0x${"11".repeat(32)}`;

function enabledConfig(
  overrides: Record<string, string> = {},
): ReturnType<typeof readBoingNftConfig> {
  return readBoingNftConfig({
    LIVING_PETS_BOING_MINTING: "1",
    LIVING_PETS_BOING_NFT_COLLECTION_HEX: COLLECTION,
    LIVING_PETS_BOING_NFT_RECIPIENT_HEX: RECIPIENT,
    BOING_SECRET_HEX: SECRET,
    ...overrides,
  });
}

/** Fake client: records submits, can fail on command. */
function createFakeClient(options?: {
  failTimes?: number;
  onSubmit?: (plan: BoingMintBatchPlan) => void;
}): BoingNftClient & {
  submits: BoingMintSubmitResult[];
  attempts: number;
} {
  let remainingFails = options?.failTimes ?? 0;
  const submits: BoingMintSubmitResult[] = [];
  const real = createBoingNftClient(enabledConfig());
  const client: BoingNftClient & {
    submits: BoingMintSubmitResult[];
    attempts: number;
  } = {
    enabled: true,
    submits,
    attempts: 0,
    async probe() {
      return null;
    },
    planCollectionDeploy() {
      return real.planCollectionDeploy();
    },
    planArtifactCollectionDeploy() {
      return real.planArtifactCollectionDeploy();
    },
    planItemCollectionDeploy() {
      return real.planItemCollectionDeploy();
    },
    planCreatureMint(input) {
      return real.planCreatureMint(input);
    },
    planLineageArtifactMint(input) {
      return real.planLineageArtifactMint(input);
    },
    planCompressedItemMint(input) {
      return real.planCompressedItemMint(input);
    },
    async submitCreatureMint(plan) {
      client.attempts += 1;
      options?.onSubmit?.(plan);
      if (remainingFails > 0) {
        remainingFails -= 1;
        throw new Error("simulated mint failure");
      }
      const result = {
        txHash: `0x${"ee".repeat(32)}`,
        collectionHex: plan.collectionHex,
        tokenIdHex: plan.tokenIdHex,
      };
      submits.push(result);
      return result;
    },
    async submitLineageArtifactMint(plan) {
      return client.submitCreatureMint(plan);
    },
    async submitCompressedItemMint(plan) {
      return client.submitCreatureMint({
        collectionHex: plan.collectionHex,
        toHex: plan.toHex,
        tokenIdHex: plan.tokenIdHex,
        calldataHex: plan.calldataHex,
        calldataBytes: plan.calldataBytes,
        tokenClass: plan.tokenClass,
      });
    },
  };
  return client;
}

test("birthMintJobsFromEvents maps BIRTH actorId to creatureId", () => {
  const { snapshot, events } = createWorld(1);
  const jobs = birthMintJobsFromEvents(snapshot.world.id, events);
  const births = events.filter((e) => e.kind === EventKind.BIRTH);
  assert.equal(jobs.length, births.length);
  assert.equal(jobs.length, snapshot.creatures.length);
  for (const job of jobs) {
    assert.ok(job.creatureId >= 1);
    assert.ok(job.birthEventId != null);
    assert.equal(job.birthTick, 0);
  }
  // Ascending creature id
  for (let i = 1; i < jobs.length; i += 1) {
    assert.ok(jobs[i]!.creatureId > jobs[i - 1]!.creatureId);
  }
});

test("worldgen founders queue unique PENDING→CONFIRMED links after commit", async () => {
  const repository = new MemoryWorldRepository();
  const linkStore = createRepositoryNftLinkStore(repository);
  const client = createFakeClient();
  const edge = createMintEdge(enabledConfig(), client, linkStore);

  await bootSession(repository, 1, { nowMs: 1_000_000, mintEdge: edge });

  const links = await edge.listLinks();
  const { snapshot, events } = createWorld(1);
  const births = events.filter((e) => e.kind === EventKind.BIRTH);
  assert.equal(links.length, births.length);
  assert.equal(client.submits.length, births.length);

  const creatureIds = new Set(links.map((l) => l.creatureId));
  assert.equal(creatureIds.size, links.length);
  for (const link of links) {
    assert.equal(link.status, NftMintStatus.CONFIRMED);
    assert.equal(link.collectionHex, COLLECTION);
    assert.equal(link.tokenIdHex, tokenIdHexForCreature(link.creatureId));
    assert.equal(link.chainId, String(enabledConfig().chainIdDecimal));
    assert.ok(link.mintTxHex);
    assert.equal(link.worldId, snapshot.world.id);
  }

  // Links live outside hot snapshot / canonical hash.
  const tables = await repository.readTables();
  assert.ok(tables);
  assert.equal(tables.creatureNftLinks.length, births.length);
  const reloaded = await bootSession(repository, 1, {
    nowMs: 1_000_000,
    mintEdge: edge,
  });
  assert.equal(
    canonicalHash(reloaded.snapshot),
    canonicalHash(createWorld(1).snapshot),
  );
  assert.equal(reloaded.snapshot.creatures.length, snapshot.creatures.length);
});

test("live BIRTH after dirty commit queues a mint (phase-4 path)", async () => {
  const repository = new MemoryWorldRepository();
  const linkStore = createRepositoryNftLinkStore(repository);
  // Disable during worldgen so founders do not mint; enable for the live commit.
  const session = await bootSession(repository, 1, { nowMs: 1_000_000 });
  assert.equal((await repository.readCreatureNftLinks()).length, 0);

  const client = createFakeClient();
  const edge = createMintEdge(enabledConfig(), client, linkStore);
  session.mintEdge = edge;

  // Simulate a phase-4 birth already in the dirty window (post-step, pre-commit).
  const childId = session.snapshot.world.nextCreatureId;
  const birthEventId = session.snapshot.world.nextEventId;
  session.dirty.events.push({
    id: birthEventId,
    worldId: session.snapshot.world.id,
    tick: session.snapshot.world.lastTick + 1,
    kind: EventKind.BIRTH,
    actorId: childId,
    subjectId: 1,
    territoryId: 1,
    lineageId: 1,
    summary: "test birth",
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
  });
  // Commit path requires the creature row to exist for FK in prisma; memory store
  // only inserts from dirty new creatures. Skip creature insert — mint edge only
  // needs the BIRTH event after saveDirty. Memory commit does not FK-check events.
  await commitSession(session);

  const links = await edge.listLinks();
  assert.equal(links.length, 1);
  assert.equal(links[0]!.creatureId, childId);
  assert.equal(links[0]!.birthEventId, birthEventId);
  assert.equal(links[0]!.status, NftMintStatus.CONFIRMED);
  // M22: lineage 1's first non-founder birth also queues its First Child
  // relic (one artifact submit), so two submits: the creature and the relic.
  assert.equal(client.submits.length, 2);
  const relics = await edge.listAssetLinks();
  assert.deepEqual(
    relics.map((row) => [row.mintKey, row.artifactKind]),
    [["relic:first-child:1", "FIRST_CHILD_COMMEMORATIVE"]],
  );
});

test("queue is idempotent by creatureId — no double mint", async () => {
  const store = new MemoryCreatureNftLinkStore();
  const client = createFakeClient();
  const edge = createMintEdge(enabledConfig(), client, store);
  const job: CreatureMintJob = {
    worldId: 1,
    creatureId: 3,
    birthEventId: 9,
    birthTick: 0,
    metadataHashHex: null,
  };
  await edge.queueCreatureMint(job);
  await edge.queueCreatureMint(job);
  await edge.drain();
  assert.equal(client.submits.length, 1);
  const links = await edge.listLinks();
  assert.equal(links.length, 1);
  assert.equal(links[0]!.status, NftMintStatus.CONFIRMED);
});

test("failed mint retries without rolling back birth or blocking ticks", async () => {
  const repository = new MemoryWorldRepository();
  const linkStore = createRepositoryNftLinkStore(repository);
  const client = createFakeClient({ failTimes: 1 });
  const edge = createMintEdge(enabledConfig(), client, linkStore);

  const session = await bootSession(repository, 1, {
    nowMs: 1_000_000,
    mintEdge: edge,
  });

  // First founder batch: each creature fails once then... wait, failTimes is
  // global across submits. With 12 founders, first submit fails, rest succeed
  // unless we re-drain. Use a single-creature job instead for clarity.
  const soloStore = new MemoryCreatureNftLinkStore();
  const soloClient = createFakeClient({ failTimes: 1 });
  const soloEdge = createMintEdge(enabledConfig(), soloClient, soloStore);
  await soloEdge.queueCreatureMint({
    worldId: 1,
    creatureId: 99,
    birthEventId: 100,
    birthTick: 5,
    metadataHashHex: null,
  });
  let links = await soloEdge.listLinks();
  assert.equal(links.length, 1);
  assert.equal(links[0]!.status, NftMintStatus.FAILED);
  assert.equal(soloClient.submits.length, 0);

  // Birth path must still be able to step/commit on the real session.
  const beforeHash = canonicalHash(session.snapshot);
  stepSession(session);
  await commitSession(session);
  assert.equal(session.snapshot.world.lastTick, 1);
  assert.notEqual(canonicalHash(session.snapshot), beforeHash);

  await soloEdge.drain();
  links = await soloEdge.listLinks();
  assert.equal(links[0]!.status, NftMintStatus.CONFIRMED);
  assert.equal(soloClient.submits.length, 1);
  assert.equal(soloClient.attempts, 2);
});

test("minting disabled: no links, no network, hashes match MVP", async () => {
  const repository = new MemoryWorldRepository();
  let now = 1_000_000;
  const runtime = createHostRuntime({
    repository,
    seed: 1,
    nowMs: () => now,
    autoFrame: false,
    emit: () => {},
  });
  await runtime.start();
  assert.equal(runtime.mintEdge.enabled, false);
  assert.equal((await runtime.mintEdge.listLinks()).length, 0);

  for (let i = 0; i < 24; i += 1) {
    now += 60_000;
    await runtime.tickFrame(60_000);
  }
  const liveHash = canonicalHash(runtime.session.snapshot);
  await runtime.quit();

  const gold = createWorld(1).snapshot;
  for (let i = 0; i < 24; i += 1) step(gold);
  assert.equal(liveHash, canonicalHash(gold));
  assert.equal((await repository.readCreatureNftLinks()).length, 0);
});

test("incomplete mint config persists FAILED and does not call network submit", async () => {
  const store = new MemoryCreatureNftLinkStore();
  const config = readBoingNftConfig({
    LIVING_PETS_BOING_MINTING: "1",
    // no collection / secret
  });
  let submitCalled = false;
  const client: BoingNftClient = {
    enabled: true,
    async probe() {
      return null;
    },
    planCollectionDeploy() {
      throw new Error("unexpected");
    },
    planArtifactCollectionDeploy() {
      throw new Error("unexpected");
    },
    planItemCollectionDeploy() {
      throw new Error("unexpected");
    },
    planCreatureMint() {
      throw new Error("unexpected plan");
    },
    planLineageArtifactMint() {
      throw new Error("unexpected plan");
    },
    planCompressedItemMint() {
      throw new Error("unexpected plan");
    },
    async submitCreatureMint() {
      submitCalled = true;
      throw new Error("unexpected submit");
    },
    async submitLineageArtifactMint() {
      submitCalled = true;
      throw new Error("unexpected submit");
    },
    async submitCompressedItemMint() {
      submitCalled = true;
      throw new Error("unexpected submit");
    },
  };
  const edge = createMintEdge(config, client, store);
  await edge.queueCreatureMint({
    worldId: 1,
    creatureId: 1,
    birthEventId: 1,
    birthTick: 0,
    metadataHashHex: null,
  });
  assert.equal(submitCalled, false);
  const links = await edge.listLinks();
  assert.equal(links.length, 1);
  assert.equal(links[0]!.status, NftMintStatus.FAILED);
  assert.ok(links[0]!.lastError?.includes("COLLECTION"));
});

test("packages/sim still has no Boing imports after M20", () => {
  const simRoot = join(REPO_ROOT, "packages/sim/src");
  const stack = [simRoot];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) {
        stack.push(path);
        continue;
      }
      if (!name.endsWith(".ts")) continue;
      const text = readFileSync(path, "utf8");
      assert.equal(text.includes("@boing-network"), false, path);
      assert.equal(text.includes("BoingNft"), false, path);
      assert.equal(text.includes("creature_nft_link"), false, path);
    }
  }
});
