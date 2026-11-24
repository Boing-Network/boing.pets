/**
 * SdkBoingNftClient unique mints check the token's owner slot instead of trusting
 * "nonce advanced": a faulted mint_batch still bumps the nonce and pays its fee.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readBoingNftConfig, SdkBoingNftClient } from "../src/index";

const COLLECTION = `0x${"ab".repeat(32)}`;
const RECIPIENT = `0x${"cd".repeat(32)}`;
const OTHER = `0x${"ee".repeat(32)}`;
const ZERO = `0x${"00".repeat(32)}`;

function clientWithOwner(owner: string): {
  client: SdkBoingNftClient;
  reads: number;
} {
  const client = new SdkBoingNftClient(
    readBoingNftConfig({
      LIVING_PETS_BOING_MINTING: "1",
      LIVING_PETS_BOING_NFT_COLLECTION_HEX: COLLECTION,
      LIVING_PETS_BOING_NFT_RECIPIENT_HEX: RECIPIENT,
      BOING_SECRET_HEX: `0x${"11".repeat(32)}`,
    }),
  );
  const state = { client, reads: 0 };
  // Replace the RPC client: no network in unit tests. Any submit attempt fails loudly.
  (client as unknown as { rpc: unknown }).rpc = {
    getContractStorage: async () => {
      state.reads++;
      return { value: owner };
    },
    getAccount: async () => {
      throw new Error("submit attempted");
    },
  };
  return state;
}

function plan(client: SdkBoingNftClient) {
  return client.planCreatureMint({
    collectionHex: COLLECTION,
    toHex: RECIPIENT,
    creatureId: 7,
    metadataHashHex: null,
  });
}

test("unique mint is skipped when the recipient already owns the token", async () => {
  const s = clientWithOwner(RECIPIENT);
  const res = await s.client.submitCreatureMint(plan(s.client));
  assert.equal(res.txHash, "already-minted");
  assert.equal(s.reads, 1);
});

test("unique mint refuses a token owned by someone else", async () => {
  const s = clientWithOwner(OTHER);
  await assert.rejects(
    () => s.client.submitCreatureMint(plan(s.client)),
    /already owned/,
  );
});

test("unique mint of an unowned token proceeds to submit", async () => {
  const s = clientWithOwner(ZERO);
  await assert.rejects(() => s.client.submitCreatureMint(plan(s.client)));
  assert.equal(s.reads, 1);
});
