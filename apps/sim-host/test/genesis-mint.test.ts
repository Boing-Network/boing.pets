import assert from "node:assert/strict";
import { test } from "node:test";
import { createWorld } from "@boing-pets/sim";
import { readBoingNftConfig } from "../src/boing/config";
import {
  genesisMetadataHashHex,
  isGenesisFounder,
  runGenesisMint,
  type GenesisChain,
} from "../src/boing/genesis-mint";
import { createMintEdge } from "../src/boing/mint-edge";
import {
  MemoryCreatureNftLinkStore,
  NftMintStatus,
  tokenIdHexForCreature,
} from "../src/boing/nft-link";
import { DisabledBoingNftClient } from "../src/boing/disabled-client";

const OPERATOR = `0x${"c8".repeat(32)}`;
const COLLECTION = `0x${"c0".repeat(32)}`;

function fakeChain(opts: { failOn?: Set<string> } = {}) {
  const owners = new Map<string, string>();
  const metadata = new Map<string, string>();
  let n = 0;
  const chain: GenesisChain = {
    async operatorHex() {
      return OPERATOR;
    },
    async ownerOf(_collection, tokenIdHex) {
      return owners.get(tokenIdHex) ?? null;
    },
    async mint({ toHex, tokenIdHex, metadataHashHex }) {
      if (opts.failOn?.has(tokenIdHex)) throw new Error("sim failed");
      if (owners.has(tokenIdHex)) throw new Error("already minted");
      owners.set(tokenIdHex, toHex);
      metadata.set(tokenIdHex, metadataHashHex);
      n += 1;
      return `0x${n.toString(16).padStart(64, "0")}`;
    },
  };
  return { chain, owners, metadata, mints: () => n };
}

const config = readBoingNftConfig({
  LIVING_PETS_BOING_MINTING: "1",
  LIVING_PETS_BOING_NFT_COLLECTION_HEX: COLLECTION,
});

test("genesis: mints every founder once, to the operator, with flag and tx hash", async () => {
  const { snapshot } = createWorld(1);
  const founders = snapshot.creatures.filter(isGenesisFounder);
  assert.ok(founders.length > 0);
  const links = new MemoryCreatureNftLinkStore();
  const fake = fakeChain();

  const first = await runGenesisMint({
    config,
    chain: fake.chain,
    linkStore: links,
    snapshot,
  });
  assert.equal(first.founders, founders.length);
  assert.equal(first.minted.length, founders.length);
  assert.equal(first.failed.length, 0);
  const rows = await links.list();
  assert.equal(rows.length, founders.length);
  for (const row of rows) {
    assert.equal(row.genesis, true);
    assert.equal(row.status, NftMintStatus.CONFIRMED);
    assert.match(row.mintTxHex ?? "", /^0x[0-9a-f]{64}$/);
    assert.equal(fake.owners.get(row.tokenIdHex), OPERATOR);
  }
  const c = founders[0]!;
  assert.equal(
    fake.metadata.get(tokenIdHexForCreature(c.id)),
    genesisMetadataHashHex({
      worldId: snapshot.world.id,
      creatureId: c.id,
      name: c.name,
      speciesSlug: snapshot.species.find((s) => s.id === c.speciesId)!.slug,
    }),
  );

  // Second run is a no-op.
  const again = await runGenesisMint({
    config,
    chain: fake.chain,
    linkStore: links,
    snapshot,
  });
  assert.equal(again.minted.length, 0);
  assert.equal(again.alreadyMinted, founders.length);
  assert.equal(fake.mints(), founders.length);
});

test("genesis: recovers tokens minted on chain but not recorded, retries failures", async () => {
  const { snapshot } = createWorld(1);
  const founders = snapshot.creatures.filter(isGenesisFounder);
  const links = new MemoryCreatureNftLinkStore();
  const failTok = tokenIdHexForCreature(founders[1]!.id);
  const fake = fakeChain({ failOn: new Set([failTok]) });
  fake.owners.set(tokenIdHexForCreature(founders[0]!.id), OPERATOR);

  const r = await runGenesisMint({
    config,
    chain: fake.chain,
    linkStore: links,
    snapshot,
  });
  assert.equal(r.recoveredFromChain, 1);
  assert.equal(r.failed.length, 1);
  assert.equal(r.minted.length, founders.length - 2);
  const failed = await links.getByCreatureId(founders[1]!.id);
  assert.equal(failed?.status, NftMintStatus.FAILED);
  assert.equal(failed?.genesis, true);

  // The regular drain leaves genesis rows to the genesis mint.
  const edge = createMintEdge(
    config,
    new DisabledBoingNftClient(config),
    links,
  );
  await edge.drain();
  const untouched = await links.getByCreatureId(founders[1]!.id);
  assert.equal(untouched?.status, NftMintStatus.FAILED);
  assert.equal(untouched?.lastError, "sim failed");

  const fixed = fakeChain();
  for (const [k, v] of fake.owners) fixed.owners.set(k, v);
  const r2 = await runGenesisMint({
    config,
    chain: fixed.chain,
    linkStore: links,
    snapshot,
  });
  assert.equal(r2.minted.length, 1);
  assert.equal(r2.minted[0]!.creatureId, founders[1]!.id);
});

test("genesis: refuses to run with minting off or no collection", async () => {
  const { snapshot } = createWorld(1);
  const links = new MemoryCreatureNftLinkStore();
  const { chain } = fakeChain();
  await assert.rejects(
    runGenesisMint({
      config: readBoingNftConfig({}),
      chain,
      linkStore: links,
      snapshot,
    }),
    /minting is off/,
  );
  await assert.rejects(
    runGenesisMint({
      config: readBoingNftConfig({ LIVING_PETS_BOING_MINTING: "1" }),
      chain,
      linkStore: links,
      snapshot,
    }),
    /COLLECTION_HEX/,
  );
});
