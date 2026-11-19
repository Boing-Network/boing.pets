/**
 * M19: Boing NFT client at the host edge.
 * Minting disabled must leave kernel hashes identical to the single-writer MVP.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  BOING_TESTNET_CHAIN_ID_DECIMAL,
  decodeReferenceNftCalldata,
  MAX_REFERENCE_NFT_MINT_BATCH,
  REFERENCE_NFT_COLLECTION_TEMPLATE_ARTIFACT_ID,
  REFERENCE_NFT_COLLECTION_TEMPLATE_VERSION,
  SELECTOR_MINT_BATCH,
} from "@boing-network/boing-sdk";
import { canonicalHash, createWorld, step } from "@boing-pets/sim";
import {
  createBoingNftClient,
  createDisabledMintEdge,
  createHostRuntime,
  createMintEdge,
  createMintEdgeFromEnv,
  readBoingNftConfig,
  SdkBoingNftClient,
} from "../src/index";
import { MemoryWorldRepository } from "../src/persist/memory-repository";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "../../..");

function packageJsonDeps(rel: string): Record<string, string> {
  const raw = readFileSync(join(REPO_ROOT, rel), "utf8");
  const parsed = JSON.parse(raw) as {
    dependencies?: Record<string, string>;
  };
  return parsed.dependencies ?? {};
}

test("minting defaults off from empty env", () => {
  const config = readBoingNftConfig({});
  assert.equal(config.enabled, false);
  assert.equal(config.chainIdDecimal, BOING_TESTNET_CHAIN_ID_DECIMAL);
  assert.equal(
    config.templateArtifactId,
    REFERENCE_NFT_COLLECTION_TEMPLATE_ARTIFACT_ID,
  );
  assert.equal(
    config.templateVersion,
    REFERENCE_NFT_COLLECTION_TEMPLATE_VERSION,
  );
});

test("LIVING_PETS_BOING_MINTING enables the edge", () => {
  const config = readBoingNftConfig({
    LIVING_PETS_BOING_MINTING: "true",
    BOING_RPC_URL: "http://127.0.0.1:8545",
    LIVING_PETS_BOING_NFT_COLLECTION_HEX: "0x" + "ab".repeat(32),
  });
  assert.equal(config.enabled, true);
  assert.equal(config.rpcUrl, "http://127.0.0.1:8545");
  assert.equal(config.collectionHex, "0x" + "ab".repeat(32));
  const client = createBoingNftClient(config);
  assert.equal(client.enabled, true);
  assert.ok(client instanceof SdkBoingNftClient);
});

test("disabled mint edge queue is a no-op", async () => {
  const edge = createDisabledMintEdge();
  assert.equal(edge.enabled, false);
  await edge.queueCreatureMint({
    worldId: 1,
    creatureId: 1,
    birthEventId: 1,
    birthTick: 0,
    metadataHashHex: null,
  });
  assert.equal(edge.pendingJobs().length, 0);
  assert.equal(await edge.client.probe(), null);
  assert.throws(() => edge.client.planCollectionDeploy());
});

test("enabled mint edge records M20 hook jobs without submitting", async () => {
  const config = readBoingNftConfig({
    LIVING_PETS_BOING_MINTING: "1",
  });
  const edge = createMintEdge(config, createBoingNftClient(config));
  assert.equal(edge.enabled, true);
  await edge.queueCreatureMint({
    worldId: 1,
    creatureId: 7,
    birthEventId: 42,
    birthTick: 10,
    metadataHashHex: null,
  });
  assert.equal(edge.pendingJobs().length, 1);
  assert.equal(edge.pendingJobs()[0]?.creatureId, 7);
});

test("sdk client plans collection deploy via reference NFT template", () => {
  const config = readBoingNftConfig({ LIVING_PETS_BOING_MINTING: "1" });
  const client = new SdkBoingNftClient(config);
  const plan = client.planCollectionDeploy();
  assert.equal(plan.deployMeta.type, "contract_deploy_meta");
  assert.equal(plan.deployMeta.purpose_category, "nft");
  assert.equal(
    plan.templateArtifactId,
    REFERENCE_NFT_COLLECTION_TEMPLATE_ARTIFACT_ID,
  );
  assert.equal(plan.templateVersion, REFERENCE_NFT_COLLECTION_TEMPLATE_VERSION);
  assert.ok(plan.deployMeta.bytecode.startsWith("0x"));
  assert.ok(plan.deployMeta.bytecode.length > 10);
});

test("sdk client encodes creature mint as reference mint_batch n=1", () => {
  const config = readBoingNftConfig({ LIVING_PETS_BOING_MINTING: "1" });
  const client = new SdkBoingNftClient(config);
  const collectionHex = "0x" + "11".repeat(32);
  const toHex = "0x" + "22".repeat(32);
  const plan = client.planCreatureMint({
    collectionHex,
    toHex,
    creatureId: 12,
    metadataHashHex: null,
  });
  assert.equal(plan.collectionHex, collectionHex);
  assert.equal(plan.toHex, toHex);
  const decoded = decodeReferenceNftCalldata(plan.calldataBytes);
  assert.ok(decoded);
  assert.equal(decoded.selector, SELECTOR_MINT_BATCH);
  if (decoded.selector !== SELECTOR_MINT_BATCH) return;
  assert.equal(decoded.n, 1);
  assert.equal(decoded.n <= MAX_REFERENCE_NFT_MINT_BATCH, true);
  assert.equal(decoded.tokenIds.length, 1);
  assert.equal(plan.tokenIdHex, decoded.tokenIds[0]);
  // Low 8 bytes = creatureId 12
  assert.ok(plan.tokenIdHex.endsWith("000000000000000c"));
});

test("with minting disabled, kernel hashes match MVP single-writer path", () => {
  const baseline = createWorld(1).snapshot;
  for (let i = 0; i < 48; i += 1) {
    step(baseline);
  }
  const baselineHash = canonicalHash(baseline);

  const withEdge = createWorld(1).snapshot;
  const edge = createDisabledMintEdge();
  assert.equal(edge.enabled, false);
  for (let i = 0; i < 48; i += 1) {
    // Host may hold a mint edge; step() never sees it.
    step(withEdge);
  }
  assert.equal(canonicalHash(withEdge), baselineHash);

  // Queue hook while disabled must not alter the snapshot either.
  void edge.queueCreatureMint({
    worldId: withEdge.world.id,
    creatureId: withEdge.creatures[0]!.id,
    birthEventId: null,
    birthTick: withEdge.world.lastTick,
    metadataHashHex: null,
  });
  assert.equal(canonicalHash(withEdge), baselineHash);
});

test("host runtime with disabled mint edge matches hashes after live ticks", async () => {
  const repository = new MemoryWorldRepository();
  const edge = createMintEdgeFromEnv({}); // empty env → disabled
  assert.equal(edge.enabled, false);

  let now = 1_000_000;
  const runtime = createHostRuntime({
    repository,
    seed: 1,
    nowMs: () => now,
    autoFrame: false,
    mintEdge: edge,
    emit: () => {},
  });

  await runtime.start();
  assert.equal(runtime.mintEdge.enabled, false);

  // Advance one real tick via the clock path (msPerTick = 60_000 at scale 1).
  now += 60_000;
  await runtime.tickFrame(60_000);

  const gold = createWorld(1).snapshot;
  step(gold);
  assert.equal(canonicalHash(runtime.session.snapshot), canonicalHash(gold));

  await runtime.quit();
});

test("packages/sim does not depend on Boing mint/network packages", () => {
  const simDeps = packageJsonDeps("packages/sim/package.json");
  assert.equal(simDeps["@boing-network/boing-sdk"], undefined);
  for (const name of Object.keys(simDeps)) {
    assert.equal(
      name.startsWith("@boing-network/"),
      false,
      `sim must not import ${name}`,
    );
  }
  const hostDeps = packageJsonDeps("apps/sim-host/package.json");
  assert.ok(hostDeps["@boing-network/boing-sdk"]);
});

test("sim source tree has no Boing imports", () => {
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
    }
  }
});
