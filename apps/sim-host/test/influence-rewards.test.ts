/**
 * In-game mint triggers: landed influences from wallet players mint a reward
 * to that player's wallet; guests earn nothing; minting stays off by default.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  InfluenceKind,
  type HostToClient,
  type InfluenceSubmit,
} from "@boing-pets/contract";
import {
  artifactSerial,
  CompressedItemKind,
  createBoingNftClient,
  createDisabledMintEdge,
  createMintEdge,
  createRepositoryAssetMintLinkStore,
  influenceRewardJobs,
  LineageArtifactKind,
  readBoingNftConfig,
  walletFromAccountId,
  type BoingCompressedItemMintPlan,
  type BoingMintBatchPlan,
  type BoingNftClient,
} from "../src/index";
import { MemoryWorldRepository } from "../src/persist/memory-repository";
import { createHostRuntime } from "../src/runtime/host-runtime";

const WALLET = `0x${"ab".repeat(32)}`;
const OPERATOR = `0x${"ee".repeat(32)}`;

function config() {
  return readBoingNftConfig({
    LIVING_PETS_BOING_MINTING: "1",
    LIVING_PETS_BOING_NFT_COLLECTION_HEX: `0x${"a1".repeat(32)}`,
    LIVING_PETS_BOING_ARTIFACT_COLLECTION_HEX: `0x${"a2".repeat(32)}`,
    LIVING_PETS_BOING_ITEM_COLLECTION_HEX: `0x${"a3".repeat(32)}`,
    LIVING_PETS_BOING_NFT_RECIPIENT_HEX: OPERATOR,
    BOING_SECRET_HEX: `0x${"11".repeat(32)}`,
  });
}

function recordingClient(): BoingNftClient & {
  items: BoingCompressedItemMintPlan[];
  artifacts: BoingMintBatchPlan[];
} {
  const real = createBoingNftClient(config());
  const items: BoingCompressedItemMintPlan[] = [];
  const artifacts: BoingMintBatchPlan[] = [];
  const tx = (plan: { collectionHex: string; tokenIdHex: string }) => ({
    txHash: `0x${"e0".repeat(32)}`,
    collectionHex: plan.collectionHex,
    tokenIdHex: plan.tokenIdHex,
  });
  return {
    ...real,
    enabled: true,
    items,
    artifacts,
    planCreatureMint: (input) => real.planCreatureMint(input),
    planLineageArtifactMint: (input) => real.planLineageArtifactMint(input),
    planCompressedItemMint: (input) => real.planCompressedItemMint(input),
    planCollectionDeploy: () => real.planCollectionDeploy(),
    planArtifactCollectionDeploy: () => real.planArtifactCollectionDeploy(),
    planItemCollectionDeploy: () => real.planItemCollectionDeploy(),
    probe: async () => null,
    submitCreatureMint: async (plan) => tx(plan),
    async submitLineageArtifactMint(plan) {
      artifacts.push(plan);
      return tx(plan);
    },
    async submitCompressedItemMint(plan) {
      items.push(plan);
      return tx(plan);
    },
  };
}

test("wallet account ids map to addresses; others do not", () => {
  assert.equal(walletFromAccountId(`w:${"ab".repeat(32)}`), WALLET);
  assert.equal(walletFromAccountId("g:abc123"), null);
  assert.equal(walletFromAccountId("local"), null);
  assert.equal(walletFromAccountId(`w:${"AB".repeat(32)}`), null);
  assert.equal(walletFromAccountId(undefined), null);
});

test("each influence kind maps to one reward with a stable mint key", () => {
  const enrich = influenceRewardJobs(
    1,
    7,
    { kind: InfluenceKind.ENRICH_TERRITORY, payload: { territoryId: 2 } },
    WALLET,
  );
  assert.equal(enrich.items[0]!.mintKey, "influence:7");
  assert.equal(enrich.items[0]!.itemSlug, CompressedItemKind.RATIONS_PACK.slug);
  assert.equal(enrich.items[0]!.recipientHex, WALLET);
  const calm = influenceRewardJobs(
    1,
    8,
    { kind: InfluenceKind.CALM_TERRITORY, payload: { territoryId: 2 } },
    WALLET,
  );
  assert.equal(calm.items[0]!.itemSlug, CompressedItemKind.POTION_CALM.slug);
  const favor = influenceRewardJobs(
    1,
    9,
    { kind: InfluenceKind.FAVOR_BLOODLINE, payload: { lineageId: 3 } },
    WALLET,
  );
  assert.equal(
    favor.items[0]!.itemSlug,
    CompressedItemKind.POTION_VITALITY.slug,
  );
  const keepsake = influenceRewardJobs(
    1,
    10,
    {
      kind: InfluenceKind.NAME_LINEAGE,
      payload: { lineageId: 3, name: "Ash" },
    },
    WALLET,
  );
  assert.equal(keepsake.artifacts[0]!.mintKey, "keepsake:3");
  assert.equal(
    keepsake.artifacts[0]!.tokenSerial,
    artifactSerial(3, LineageArtifactKind.LINEAGE_KEEPSAKE),
  );
  const named = influenceRewardJobs(
    1,
    11,
    {
      kind: InfluenceKind.NAME_CREATURE,
      payload: { creatureId: 1, name: "Bo" },
    },
    WALLET,
  );
  assert.equal(named.items.length + named.artifacts.length, 0);
  // Serials never collide across lineages and kinds.
  const serials = new Set<number>();
  for (let lineage = 1; lineage <= 50; lineage += 1) {
    for (const kind of Object.values(LineageArtifactKind)) {
      serials.add(artifactSerial(lineage, kind));
    }
  }
  assert.equal(serials.size, 150);
});

async function startRuntime(
  mintEdge: ReturnType<typeof createMintEdge>,
  repository = new MemoryWorldRepository(),
) {
  const messages: HostToClient[] = [];
  const runtime = createHostRuntime({
    repository,
    seed: 1,
    nowMs: () => 9_000_000,
    autoFrame: false,
    mintEdge,
    emit: (message) => messages.push(message),
  });
  await runtime.start();
  return { runtime, repository };
}

async function submit(
  runtime: Awaited<ReturnType<typeof startRuntime>>["runtime"],
  body: InfluenceSubmit,
  accountId: string,
) {
  const outcome = await runtime.handleCommand(
    { message: "influence.submit", body },
    { accountId },
  );
  assert.equal(outcome.ok, true, `influence ${body.kind} lands`);
  // Reward minting runs off the command path.
  await new Promise((resolve) => setTimeout(resolve, 20));
}

test("landed influences mint to the player's wallet, never the operator", async () => {
  const client = recordingClient();
  const repository = new MemoryWorldRepository();
  const edge = createMintEdge(
    config(),
    client,
    undefined,
    createRepositoryAssetMintLinkStore(repository),
  );
  // Links persist in the world's repository (the server wires it the same).
  const { runtime } = await startRuntime(edge, repository);
  const snapshot = runtime.session.snapshot;
  const territoryId = snapshot.territories[0]!.id;
  const lineageId = snapshot.lineages[0]!.id;
  const wallet = `w:${"ab".repeat(32)}`;
  const other = `w:${"cd".repeat(32)}`;

  await submit(
    runtime,
    { kind: InfluenceKind.ENRICH_TERRITORY, payload: { territoryId } },
    wallet,
  );
  await submit(
    runtime,
    { kind: InfluenceKind.NAME_LINEAGE, payload: { lineageId, name: "Ember" } },
    wallet,
  );
  // A guest's influence lands but earns nothing.
  await submit(
    runtime,
    { kind: InfluenceKind.CALM_TERRITORY, payload: { territoryId } },
    "g:guest01",
  );
  // A second wallet naming the same lineage does not get a second keepsake.
  await submit(
    runtime,
    {
      kind: InfluenceKind.NAME_LINEAGE,
      payload: { lineageId, name: "Cinder" },
    },
    other,
  );

  assert.equal(client.items.length, 1, "one item minted");
  assert.equal(client.items[0]!.toHex.toLowerCase(), WALLET);
  assert.equal(
    client.items[0]!.itemKindId,
    CompressedItemKind.RATIONS_PACK.itemKindId,
  );
  assert.equal(client.artifacts.length, 1, "one keepsake per lineage");
  assert.equal(client.artifacts[0]!.toHex.toLowerCase(), WALLET);
  assert.ok(
    [...client.items, ...client.artifacts].every(
      (plan) => plan.toHex.toLowerCase() !== OPERATOR,
    ),
    "nothing goes to the operator",
  );
  const links = await edge.listAssetLinks();
  assert.equal(links.length, 2);
  assert.ok(
    links.every((link) => link.recipientHex === WALLET),
    "links remember the recipient",
  );
  await runtime.quit();
});

test("minting off (the default): influences land and nothing is queued", async () => {
  const edge = createDisabledMintEdge();
  const { runtime } = await startRuntime(edge);
  const territoryId = runtime.session.snapshot.territories[0]!.id;
  await submit(
    runtime,
    { kind: InfluenceKind.ENRICH_TERRITORY, payload: { territoryId } },
    `w:${"ab".repeat(32)}`,
  );
  assert.equal((await edge.listAssetLinks()).length, 0);
  await runtime.quit();
});
