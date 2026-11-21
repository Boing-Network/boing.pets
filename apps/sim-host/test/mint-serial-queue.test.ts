/**
 * Mint retries and new mints share one operator nonce. They go through one
 * serial queue, so a boot drain retrying several rows while new mints are
 * queued never signs two txs with the same nonce ("underpriced replacement").
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CompressedItemKind,
  createBoingNftClient,
  createMintEdge,
  MemoryAssetMintLinkStore,
  NftMintStatus,
  readBoingNftConfig,
  type BoingMintSubmitResult,
  type BoingNftClient,
} from "../src/index";
import {
  createSerialQueue,
  waitForNonceAfter,
  type SerialQueue,
} from "../src/boing/serial-queue";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const config = readBoingNftConfig({
  LIVING_PETS_BOING_MINTING: "1",
  LIVING_PETS_BOING_NFT_COLLECTION_HEX: `0x${"ab".repeat(32)}`,
  LIVING_PETS_BOING_ARTIFACT_COLLECTION_HEX: `0x${"ac".repeat(32)}`,
  LIVING_PETS_BOING_ITEM_COLLECTION_HEX: `0x${"ad".repeat(32)}`,
  LIVING_PETS_BOING_NFT_RECIPIENT_HEX: `0x${"cd".repeat(32)}`,
  BOING_SECRET_HEX: `0x${"11".repeat(32)}`,
});

/**
 * A chain with one account nonce. Like the SDK, a submit reads the committed
 * nonce (pending txs not counted); a second tx with a pending nonce is
 * rejected, and a tx commits a few ms after it is sent.
 */
function nonceChainClient(): BoingNftClient & {
  nonces: number[];
  maxInFlight: number;
} {
  const real = createBoingNftClient(config);
  let committed = 0;
  let inFlight = 0;
  const pending = new Set<number>();
  const nonces: number[] = [];
  const state = { maxInFlight: 0 };
  async function submit(collectionHex: string, tokenIdHex: string) {
    inFlight += 1;
    state.maxInFlight = Math.max(state.maxInFlight, inFlight);
    try {
      const nonce = committed;
      await sleep(1);
      if (pending.has(nonce)) {
        throw new Error(
          "underpriced replacement: pending tip is 0, replacement tip is 0 (must be higher)",
        );
      }
      pending.add(nonce);
      nonces.push(nonce);
      await sleep(4);
      pending.delete(nonce);
      committed += 1;
      const result: BoingMintSubmitResult = {
        txHash: `0x${nonce.toString(16).padStart(64, "0")}`,
        collectionHex,
        tokenIdHex,
      };
      return result;
    } finally {
      inFlight -= 1;
    }
  }
  return {
    enabled: true,
    nonces,
    get maxInFlight() {
      return state.maxInFlight;
    },
    async probe() {
      return null;
    },
    planCollectionDeploy: () => real.planCollectionDeploy(),
    planArtifactCollectionDeploy: () => real.planArtifactCollectionDeploy(),
    planItemCollectionDeploy: () => real.planItemCollectionDeploy(),
    planCreatureMint: (input) => real.planCreatureMint(input),
    planLineageArtifactMint: (input) => real.planLineageArtifactMint(input),
    planCompressedItemMint: (input) => real.planCompressedItemMint(input),
    submitCreatureMint: (plan) => submit(plan.collectionHex, plan.tokenIdHex),
    submitLineageArtifactMint: (plan) =>
      submit(plan.collectionHex, plan.tokenIdHex),
    submitCompressedItemMint: (plan) =>
      submit(plan.collectionHex, plan.tokenIdHex),
  };
}

/**
 * Three FAILED item rows, made the way the live world made them: rewards
 * queued while the item collection was not configured.
 */
async function failedItemRows(store: MemoryAssetMintLinkStore) {
  const noItems = readBoingNftConfig({
    LIVING_PETS_BOING_MINTING: "1",
    LIVING_PETS_BOING_NFT_COLLECTION_HEX: `0x${"ab".repeat(32)}`,
    LIVING_PETS_BOING_NFT_RECIPIENT_HEX: `0x${"cd".repeat(32)}`,
    BOING_SECRET_HEX: `0x${"11".repeat(32)}`,
  });
  const before = createMintEdge(
    noItems,
    nonceChainClient(),
    undefined,
    store,
    createSerialQueue(),
  );
  for (const n of [1, 2, 3]) {
    await before.queueCompressedItemMint(
      {
        worldId: 1,
        mintKey: `influence:${n}`,
        itemKindId: CompressedItemKind.RATIONS_PACK.itemKindId,
        amount: 1,
        itemSlug: CompressedItemKind.RATIONS_PACK.slug,
        metadataHashHex: null,
      },
      1,
    );
  }
  const rows = await store.list();
  assert.equal(rows.length, 3);
  assert.ok(rows.every((r) => r.status === NftMintStatus.FAILED));
}

async function bootDrainWithNewMints(queue: SerialQueue) {
  const client = nonceChainClient();
  const store = new MemoryAssetMintLinkStore();
  await failedItemRows(store);
  const edge = createMintEdge(config, client, undefined, store, queue);
  // Boot drain retries the FAILED rows while two new rewards arrive.
  await Promise.all([
    edge.drain(1000),
    edge.queueCompressedItemMint(
      {
        worldId: 1,
        mintKey: "influence:4",
        itemKindId: CompressedItemKind.POTION_CALM.itemKindId,
        amount: 1,
        itemSlug: CompressedItemKind.POTION_CALM.slug,
        metadataHashHex: null,
      },
      1000,
    ),
    edge.queueCompressedItemMint(
      {
        worldId: 1,
        mintKey: "influence:5",
        itemKindId: CompressedItemKind.POTION_VITALITY.itemKindId,
        amount: 1,
        itemSlug: CompressedItemKind.POTION_VITALITY.slug,
        metadataHashHex: null,
      },
      1000,
    ),
  ]);
  return { client, links: await edge.listAssetLinks() };
}

test("drain retries and new mints never share a nonce", async () => {
  const { client, links } = await bootDrainWithNewMints(createSerialQueue());
  assert.equal(links.length, 5);
  for (const link of links) {
    assert.equal(link.status, NftMintStatus.CONFIRMED, link.mintKey);
    assert.equal(link.lastError, null);
  }
  assert.equal(client.maxInFlight, 1);
  assert.deepEqual(
    [...client.nonces].sort((a, b) => a - b),
    [0, 1, 2, 3, 4],
  );
  // Each tx hash is its own nonce: no two rows point at the same tx.
  assert.equal(new Set(links.map((l) => l.mintTxHex)).size, 5);
});

test("without the queue the same burst collides (the live-world bug)", async () => {
  const noQueue: SerialQueue = { run: (task) => task(), size: () => 0 };
  const { client, links } = await bootDrainWithNewMints(noQueue);
  assert.ok(client.maxInFlight > 1);
  assert.ok(
    links.some(
      (l) =>
        l.status === NftMintStatus.FAILED &&
        /underpriced replacement/.test(l.lastError ?? ""),
    ),
  );
});

test("serial queue runs one task at a time, in order, past failures", async () => {
  const queue = createSerialQueue();
  const order: string[] = [];
  let running = 0;
  let max = 0;
  const task = (name: string, ms: number, fail = false) =>
    queue.run(async () => {
      running += 1;
      max = Math.max(max, running);
      order.push(`start ${name}`);
      await sleep(ms);
      order.push(`end ${name}`);
      running -= 1;
      if (fail) throw new Error(name);
      return name;
    });
  const results = await Promise.allSettled([
    task("a", 6),
    task("b", 1, true),
    task("c", 2),
  ]);
  assert.equal(max, 1);
  assert.deepEqual(order, [
    "start a",
    "end a",
    "start b",
    "end b",
    "start c",
    "end c",
  ]);
  assert.deepEqual(
    results.map((r) => r.status),
    ["fulfilled", "rejected", "fulfilled"],
  );
  await sleep(0);
  assert.equal(queue.size(), 0);
});

test("waitForNonceAfter waits for the committed nonce to move", async () => {
  const seen = [5n, 5n, 6n];
  let calls = 0;
  let clock = 0;
  const ok = await waitForNonceAfter(async () => seen[calls++] ?? 6n, 5n, {
    pollMs: 10,
    timeoutMs: 1000,
    sleep: async (ms) => {
      clock += ms;
    },
    now: () => clock,
  });
  assert.equal(ok, true);
  assert.equal(calls, 3);

  clock = 0;
  const timedOut = await waitForNonceAfter(async () => 5n, 5n, {
    pollMs: 100,
    timeoutMs: 300,
    sleep: async (ms) => {
      clock += ms;
    },
    now: () => clock,
  });
  assert.equal(timedOut, false);
});
