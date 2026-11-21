/**
 * M21: Asset mint taxonomy.
 * Distinct token classes for unique creatures, unique lineage/story artifacts,
 * and compressed/fungible item NFTs — all via the same Boing deployment path
 * at the host edge. Never inside step() / packages/sim.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  decodeMultiTokenCalldata,
  decodeReferenceNftCalldata,
  REFERENCE_MULTI_TOKEN_ARTIFACT_ID,
  REFERENCE_MULTI_TOKEN_TEMPLATE_VERSION,
  REFERENCE_NFT_COLLECTION_TEMPLATE_ARTIFACT_ID,
  SELECTOR_MINT_BATCH,
  SELECTOR_MT_MINT,
} from "@boing-network/boing-sdk";
import { canonicalHash, createWorld, step } from "@boing-pets/sim";
import {
  ALL_ASSET_MINT_CLASSES,
  ASSET_MINT_CLASS_PROFILES,
  AssetMintClass,
  CompressedItemKind,
  createBoingNftClient,
  createDisabledMintEdge,
  createMintEdge,
  createRepositoryAssetMintLinkStore,
  LineageArtifactKind,
  MemoryAssetMintLinkStore,
  NftMintStatus,
  profileForAssetMintClass,
  readBoingNftConfig,
  SdkBoingNftClient,
  tokenIdHexForArtifactSerial,
  tokenIdHexForCompressedItem,
  TokenShape,
  type BoingCompressedItemMintPlan,
  type BoingMintBatchPlan,
  type BoingMintSubmitResult,
  type BoingNftClient,
} from "../src/index";
import { MemoryWorldRepository } from "../src/persist/memory-repository";
import { worldgenTables } from "../src/persist/save";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "../../..");

const CREATURE_COLLECTION = `0x${"ab".repeat(32)}`;
const ARTIFACT_COLLECTION = `0x${"ac".repeat(32)}`;
const ITEM_COLLECTION = `0x${"ad".repeat(32)}`;
const RECIPIENT = `0x${"cd".repeat(32)}`;
const SECRET = `0x${"11".repeat(32)}`;

function enabledConfig(
  overrides: Record<string, string> = {},
): ReturnType<typeof readBoingNftConfig> {
  return readBoingNftConfig({
    LIVING_PETS_BOING_MINTING: "1",
    LIVING_PETS_BOING_NFT_COLLECTION_HEX: CREATURE_COLLECTION,
    LIVING_PETS_BOING_ARTIFACT_COLLECTION_HEX: ARTIFACT_COLLECTION,
    LIVING_PETS_BOING_ITEM_COLLECTION_HEX: ITEM_COLLECTION,
    LIVING_PETS_BOING_NFT_RECIPIENT_HEX: RECIPIENT,
    BOING_SECRET_HEX: SECRET,
    ...overrides,
  });
}

function createFakeClient(): BoingNftClient & {
  creatureSubmits: BoingMintSubmitResult[];
  artifactSubmits: BoingMintSubmitResult[];
  itemSubmits: BoingMintSubmitResult[];
} {
  const real = createBoingNftClient(enabledConfig());
  const creatureSubmits: BoingMintSubmitResult[] = [];
  const artifactSubmits: BoingMintSubmitResult[] = [];
  const itemSubmits: BoingMintSubmitResult[] = [];
  return {
    enabled: true,
    creatureSubmits,
    artifactSubmits,
    itemSubmits,
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
    async submitCreatureMint(plan: BoingMintBatchPlan) {
      const result = {
        txHash: `0x${"e1".repeat(32)}`,
        collectionHex: plan.collectionHex,
        tokenIdHex: plan.tokenIdHex,
      };
      creatureSubmits.push(result);
      return result;
    },
    async submitLineageArtifactMint(plan: BoingMintBatchPlan) {
      const result = {
        txHash: `0x${"e2".repeat(32)}`,
        collectionHex: plan.collectionHex,
        tokenIdHex: plan.tokenIdHex,
      };
      artifactSubmits.push(result);
      return result;
    },
    async submitCompressedItemMint(plan: BoingCompressedItemMintPlan) {
      const result = {
        txHash: `0x${"e3".repeat(32)}`,
        collectionHex: plan.collectionHex,
        tokenIdHex: plan.tokenIdHex,
      };
      itemSubmits.push(result);
      return result;
    },
  };
}

test("taxonomy catalogs three distinct token classes", () => {
  assert.deepEqual(
    [...ALL_ASSET_MINT_CLASSES].sort(),
    [
      AssetMintClass.COMPRESSED_ITEM,
      AssetMintClass.UNIQUE_CREATURE,
      AssetMintClass.UNIQUE_LINEAGE_ARTIFACT,
    ].sort(),
  );
  assert.equal(
    profileForAssetMintClass(AssetMintClass.UNIQUE_CREATURE).tokenShape,
    TokenShape.UNIQUE_NFT,
  );
  assert.equal(
    profileForAssetMintClass(AssetMintClass.UNIQUE_LINEAGE_ARTIFACT).tokenShape,
    TokenShape.UNIQUE_NFT,
  );
  assert.equal(
    profileForAssetMintClass(AssetMintClass.COMPRESSED_ITEM).tokenShape,
    TokenShape.COMPRESSED_FUNGIBLE,
  );
  assert.equal(
    ASSET_MINT_CLASS_PROFILES[AssetMintClass.UNIQUE_CREATURE]
      .templateArtifactId,
    REFERENCE_NFT_COLLECTION_TEMPLATE_ARTIFACT_ID,
  );
  assert.equal(
    ASSET_MINT_CLASS_PROFILES[AssetMintClass.UNIQUE_LINEAGE_ARTIFACT]
      .templateArtifactId,
    REFERENCE_NFT_COLLECTION_TEMPLATE_ARTIFACT_ID,
  );
  assert.equal(
    ASSET_MINT_CLASS_PROFILES[AssetMintClass.COMPRESSED_ITEM]
      .templateArtifactId,
    REFERENCE_MULTI_TOKEN_ARTIFACT_ID,
  );
  assert.equal(
    ASSET_MINT_CLASS_PROFILES[AssetMintClass.COMPRESSED_ITEM].templateVersion,
    REFERENCE_MULTI_TOKEN_TEMPLATE_VERSION,
  );
  assert.ok(CompressedItemKind.POTION_VITALITY.itemKindId >= 1);
  assert.equal(
    LineageArtifactKind.FIRST_CHILD_COMMEMORATIVE,
    "FIRST_CHILD_COMMEMORATIVE",
  );
});

test("deploy plans use distinct token classes on the same Boing path", () => {
  const client = new SdkBoingNftClient(enabledConfig());
  const creature = client.planCollectionDeploy();
  const artifact = client.planArtifactCollectionDeploy();
  const item = client.planItemCollectionDeploy();
  assert.equal(creature.tokenClass, AssetMintClass.UNIQUE_CREATURE);
  assert.equal(artifact.tokenClass, AssetMintClass.UNIQUE_LINEAGE_ARTIFACT);
  assert.equal(item.tokenClass, AssetMintClass.COMPRESSED_ITEM);
  assert.equal(creature.deployMeta.purpose_category, "nft");
  assert.equal(artifact.deployMeta.purpose_category, "nft");
  assert.equal(item.deployMeta.purpose_category, "nft");
  assert.notEqual(
    creature.deployMeta.asset_symbol,
    artifact.deployMeta.asset_symbol,
  );
  assert.notEqual(
    creature.deployMeta.asset_symbol,
    item.deployMeta.asset_symbol,
  );
  assert.equal(
    artifact.templateArtifactId,
    REFERENCE_NFT_COLLECTION_TEMPLATE_ARTIFACT_ID,
  );
  assert.equal(item.templateArtifactId, REFERENCE_MULTI_TOKEN_ARTIFACT_ID);
});

test("lineage artifact mint encodes reference mint_batch on artifact collection", () => {
  const client = new SdkBoingNftClient(enabledConfig());
  const plan = client.planLineageArtifactMint({
    collectionHex: ARTIFACT_COLLECTION,
    toHex: RECIPIENT,
    tokenSerial: 42,
    metadataHashHex: null,
  });
  assert.equal(plan.tokenClass, AssetMintClass.UNIQUE_LINEAGE_ARTIFACT);
  assert.equal(plan.collectionHex, ARTIFACT_COLLECTION);
  assert.equal(plan.tokenIdHex, tokenIdHexForArtifactSerial(42));
  const decoded = decodeReferenceNftCalldata(plan.calldataBytes);
  assert.ok(decoded);
  assert.equal(decoded.selector, SELECTOR_MINT_BATCH);
});

test("compressed item mint encodes multi-token mint (fungible-like)", () => {
  const client = new SdkBoingNftClient(enabledConfig());
  const kind = CompressedItemKind.POTION_VITALITY;
  const plan = client.planCompressedItemMint({
    collectionHex: ITEM_COLLECTION,
    toHex: RECIPIENT,
    itemKindId: kind.itemKindId,
    amount: 5,
  });
  assert.equal(plan.tokenClass, AssetMintClass.COMPRESSED_ITEM);
  assert.equal(plan.itemKindId, kind.itemKindId);
  assert.equal(plan.amount, 5);
  assert.equal(plan.tokenIdHex, tokenIdHexForCompressedItem(kind.itemKindId));
  const decoded = decodeMultiTokenCalldata(plan.calldataBytes);
  assert.ok(decoded);
  assert.equal(decoded.selector, SELECTOR_MT_MINT);
  if (decoded.kind !== "mint") {
    assert.fail("expected multi-token mint");
  }
  assert.equal(Number(decoded.itemId), kind.itemKindId);
  assert.equal(Number(decoded.amount), 5);
});

test("mint edge queues artifact + compressed item with distinct classes", async () => {
  const repository = new MemoryWorldRepository();
  const { snapshot } = createWorld(1);
  await repository.insertWorld(worldgenTables(snapshot, []));

  const client = createFakeClient();
  const edge = createMintEdge(
    enabledConfig(),
    client,
    undefined,
    createRepositoryAssetMintLinkStore(repository),
  );

  await edge.queueLineageArtifactMint({
    worldId: 1,
    mintKey: "lineage:1:keepsake",
    tokenSerial: 7,
    lineageId: 1,
    artifactKind: LineageArtifactKind.LINEAGE_KEEPSAKE,
    metadataHashHex: null,
  });
  await edge.queueCompressedItemMint({
    worldId: 1,
    mintKey: "grant:potion.vitality:1",
    itemKindId: CompressedItemKind.POTION_VITALITY.itemKindId,
    amount: 3,
    itemSlug: CompressedItemKind.POTION_VITALITY.slug,
    metadataHashHex: null,
  });

  assert.equal(edge.pendingArtifactJobs().length, 1);
  assert.equal(edge.pendingItemJobs().length, 1);
  assert.equal(client.artifactSubmits.length, 1);
  assert.equal(client.itemSubmits.length, 1);
  assert.equal(client.creatureSubmits.length, 0);

  const links = await edge.listAssetLinks();
  assert.equal(links.length, 2);
  const artifact = links.find(
    (l) => l.tokenClass === AssetMintClass.UNIQUE_LINEAGE_ARTIFACT,
  );
  const item = links.find(
    (l) => l.tokenClass === AssetMintClass.COMPRESSED_ITEM,
  );
  assert.ok(artifact);
  assert.ok(item);
  assert.equal(artifact.status, NftMintStatus.CONFIRMED);
  assert.equal(item.status, NftMintStatus.CONFIRMED);
  assert.equal(artifact.collectionHex, ARTIFACT_COLLECTION);
  assert.equal(item.collectionHex, ITEM_COLLECTION);
  assert.equal(artifact.tokenIdHex, tokenIdHexForArtifactSerial(7));
  assert.equal(
    item.tokenIdHex,
    tokenIdHexForCompressedItem(CompressedItemKind.POTION_VITALITY.itemKindId),
  );
  assert.equal(item.amount, 3);
  assert.equal(item.itemSlug, "potion.vitality");

  const tables = await repository.readTables();
  assert.ok(tables);
  assert.equal(tables.assetMintLinks.length, 2);
});

test("asset mint hooks are idempotent by mintKey", async () => {
  const store = new MemoryAssetMintLinkStore();
  const client = createFakeClient();
  const edge = createMintEdge(enabledConfig(), client, undefined, store);
  const job = {
    worldId: 1,
    mintKey: "lineage:2:first-child",
    tokenSerial: 9,
    lineageId: 2,
    artifactKind: LineageArtifactKind.FIRST_CHILD_COMMEMORATIVE,
    metadataHashHex: null,
  };
  await edge.queueLineageArtifactMint(job);
  await edge.queueLineageArtifactMint(job);
  await edge.drain();
  assert.equal(client.artifactSubmits.length, 1);
  assert.equal((await edge.listAssetLinks()).length, 1);
});

test("disabled minting: no asset links, hashes unchanged", async () => {
  const edge = createDisabledMintEdge();
  assert.equal(edge.enabled, false);
  await edge.queueLineageArtifactMint({
    worldId: 1,
    mintKey: "x",
    tokenSerial: 1,
    lineageId: 1,
    artifactKind: LineageArtifactKind.GRIEF_COMMEMORATIVE,
    metadataHashHex: null,
  });
  await edge.queueCompressedItemMint({
    worldId: 1,
    mintKey: "y",
    itemKindId: 1,
    amount: 1,
    itemSlug: "potion.vitality",
    metadataHashHex: null,
  });
  assert.equal(edge.pendingArtifactJobs().length, 0);
  assert.equal(edge.pendingItemJobs().length, 0);
  assert.equal((await edge.listAssetLinks()).length, 0);

  const baseline = createWorld(1).snapshot;
  for (let i = 0; i < 24; i += 1) step(baseline);
  const withEdge = createWorld(1).snapshot;
  for (let i = 0; i < 24; i += 1) step(withEdge);
  assert.equal(canonicalHash(withEdge), canonicalHash(baseline));
});

test("incomplete item/artifact config fails without submit", async () => {
  const store = new MemoryAssetMintLinkStore();
  const config = readBoingNftConfig({
    LIVING_PETS_BOING_MINTING: "1",
    BOING_SECRET_HEX: SECRET,
    LIVING_PETS_BOING_NFT_RECIPIENT_HEX: RECIPIENT,
    // no collection hexes
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
      throw new Error("unexpected");
    },
    planLineageArtifactMint() {
      throw new Error("unexpected");
    },
    planCompressedItemMint() {
      throw new Error("unexpected");
    },
    async submitCreatureMint() {
      submitCalled = true;
      throw new Error("unexpected");
    },
    async submitLineageArtifactMint() {
      submitCalled = true;
      throw new Error("unexpected");
    },
    async submitCompressedItemMint() {
      submitCalled = true;
      throw new Error("unexpected");
    },
  };
  const edge = createMintEdge(config, client, undefined, store);
  await edge.queueCompressedItemMint({
    worldId: 1,
    mintKey: "grant:1",
    itemKindId: 1,
    amount: 1,
    itemSlug: "potion.vitality",
    metadataHashHex: null,
  });
  assert.equal(submitCalled, false);
  const links = await edge.listAssetLinks();
  assert.equal(links.length, 1);
  assert.equal(links[0]!.status, NftMintStatus.FAILED);
  assert.ok(links[0]!.lastError?.includes("ITEM_COLLECTION"));
});

test("packages/sim has no Boing or asset-mint taxonomy imports", () => {
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
      assert.equal(text.includes("AssetMintClass"), false, path);
      assert.equal(text.includes("asset_mint_link"), false, path);
      assert.equal(text.includes("CompressedItem"), false, path);
    }
  }
});

test("M22: item rewards FAILED before LPIT existed retry and mint once it is configured", async () => {
  const store = new MemoryAssetMintLinkStore();
  const before = createMintEdge(
    enabledConfig({ LIVING_PETS_BOING_ITEM_COLLECTION_HEX: "" }),
    createFakeClient(),
    undefined,
    store,
  );
  await before.queueCompressedItemMint({
    worldId: 1,
    mintKey: "influence:41",
    itemKindId: CompressedItemKind.POTION_CALM.itemKindId,
    amount: 1,
    itemSlug: CompressedItemKind.POTION_CALM.slug,
    metadataHashHex: null,
    recipientHex: RECIPIENT,
  });
  await before.drain();
  const failed = await store.list();
  assert.equal(failed.length, 1);
  assert.equal(failed[0]?.status, NftMintStatus.FAILED);
  assert.match(failed[0]?.lastError ?? "", /ITEM_COLLECTION_HEX required/);

  // Same rows, new boot with LPIT set: the drain retries and mints once.
  const client = createFakeClient();
  const after = createMintEdge(enabledConfig(), client, undefined, store);
  await after.drain();
  await after.drain();
  assert.equal(client.itemSubmits.length, 1);
  const [row] = await store.list();
  assert.equal(row?.status, NftMintStatus.CONFIRMED);
  assert.equal(row?.recipientHex, RECIPIENT);
});

test("M22: the LPIT template has no burn entry point, so item use is tracked off-chain", () => {
  const selectors = [
    0x20, 0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28, 0x29,
  ];
  // Every selector the template decodes is one of the known non-burn calls…
  for (let s = 0; s < 0x40; s += 1) {
    const calldata = `0x${s.toString(16).padStart(2, "0")}${"00".repeat(159)}`;
    const decoded = decodeMultiTokenCalldata(calldata);
    if (decoded != null) {
      assert.ok(selectors.includes(decoded.selector), `selector ${s}`);
      assert.ok(!/burn/i.test(decoded.kind));
    }
  }
  // …and the deploy plan is the pinned multi-token artifact.
  const plan = createBoingNftClient(enabledConfig()).planItemCollectionDeploy();
  assert.equal(plan.templateArtifactId, REFERENCE_MULTI_TOKEN_ARTIFACT_ID);
  assert.equal(plan.deployMeta.asset_symbol, "LPIT");
});
