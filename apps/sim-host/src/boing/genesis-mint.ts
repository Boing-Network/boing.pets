/**
 * Genesis mint: mint every founder (no parents, generation 0) of the shared
 * world into the creature collection, owned by the operator wallet, exactly
 * once. Each link row carries `genesis: true` and the mint tx hash.
 *
 * Idempotent: rows already CONFIRMED are skipped, and a token that is already
 * owned on chain (for example after a crash between submit and the DB write)
 * is recorded without minting again. Mints are sent one at a time and each
 * waits for its receipt, so the operator nonce never races itself.
 *
 * Host edge only (Node). Never imported by packages/sim or the browser worker.
 */
import { createHash } from "node:crypto";
import {
  createClient,
  encodeReferenceMintBatchCalldata,
  encodeReferenceOwnerOfCalldataHex,
  ensure0xHex,
  hexToBytes,
  senderHexFromSecretKey,
  submitContractCallWithSimulationRetry,
} from "@boing-network/boing-sdk";
import type { CreatureRow, WorldSnapshot } from "@boing-pets/sim";
import type { BoingNftConfig } from "./config";
import { operatorTxQueue } from "./serial-queue";
import {
  NftMintStatus,
  tokenIdHexForCreature,
  type CreatureNftLinkRow,
  type CreatureNftLinkStore,
} from "./nft-link";

const ZERO_ACCOUNT = `0x${"00".repeat(32)}`;

/** Founders of the world: no parents, generation 0. */
export function isGenesisFounder(c: CreatureRow): boolean {
  return c.motherId == null && c.fatherId == null && c.generation === 0;
}

/** Stable on-chain metadata hash for a genesis creature (flag included). */
export function genesisMetadataHashHex(input: {
  worldId: number;
  creatureId: number;
  name: string;
  speciesSlug: string | null;
}): string {
  const doc = JSON.stringify({
    v: 1,
    game: "living-pets",
    genesis: true,
    worldId: input.worldId,
    creatureId: input.creatureId,
    name: input.name,
    species: input.speciesSlug,
  });
  return `0x${createHash("sha256").update(doc).digest("hex")}`;
}

/** The chain operations the genesis mint needs (faked in tests). */
export type GenesisChain = {
  /** Operator account that signs and receives the mints. */
  operatorHex(): Promise<string>;
  /** Current owner of a token, or null when it is not minted. */
  ownerOf(collectionHex: string, tokenIdHex: string): Promise<string | null>;
  /** Mint one token to `toHex`; resolves with the tx hash once included. */
  mint(input: {
    collectionHex: string;
    toHex: string;
    tokenIdHex: string;
    metadataHashHex: string;
  }): Promise<string>;
};

export type GenesisMintResult = {
  founders: number;
  minted: { creatureId: number; txHash: string }[];
  alreadyMinted: number;
  recoveredFromChain: number;
  failed: { creatureId: number; error: string }[];
};

export async function runGenesisMint(input: {
  config: BoingNftConfig;
  chain: GenesisChain;
  linkStore: CreatureNftLinkStore;
  snapshot: WorldSnapshot;
  nowMs?: () => number;
  log?: (line: string) => void;
}): Promise<GenesisMintResult> {
  const { config, chain, linkStore, snapshot } = input;
  const now = input.nowMs ?? Date.now;
  const log = input.log ?? (() => {});
  if (!config.enabled) throw new Error("minting is off");
  if (config.collectionHex == null) {
    throw new Error("LIVING_PETS_BOING_NFT_COLLECTION_HEX required");
  }
  const collectionHex = ensure0xHex(config.collectionHex);
  const toHex = ensure0xHex(
    config.recipientHex ?? (await chain.operatorHex()),
  ).toLowerCase();
  const species = new Map(snapshot.species.map((s) => [s.id, s.slug]));
  const worldId = snapshot.world.id;
  const founders = snapshot.creatures
    .filter(isGenesisFounder)
    .sort((a, b) => a.id - b.id);

  const result: GenesisMintResult = {
    founders: founders.length,
    minted: [],
    alreadyMinted: 0,
    recoveredFromChain: 0,
    failed: [],
  };

  for (const c of founders) {
    const existing = await linkStore.getByCreatureId(c.id);
    const tokenIdHex = tokenIdHexForCreature(c.id);
    const base: CreatureNftLinkRow = existing ?? {
      id: c.id,
      worldId,
      creatureId: c.id,
      birthEventId: null,
      collectionHex,
      tokenIdHex,
      chainId: String(config.chainIdDecimal),
      templateArtifact: config.templateArtifactId,
      templateVersion: config.templateVersion,
      mintTxHex: null,
      status: NftMintStatus.PENDING,
      lastError: null,
      createdAtMs: now(),
      updatedAtMs: now(),
    };
    if (
      existing?.status === NftMintStatus.CONFIRMED &&
      existing.collectionHex.toLowerCase() === collectionHex.toLowerCase()
    ) {
      if (existing.genesis !== true) {
        await linkStore.upsert({
          ...existing,
          genesis: true,
          updatedAtMs: now(),
        });
      }
      result.alreadyMinted += 1;
      continue;
    }
    try {
      const owner = await chain.ownerOf(collectionHex, tokenIdHex);
      if (owner != null) {
        // Minted before but never recorded: keep any tx hash we have.
        await linkStore.upsert({
          ...base,
          genesis: true,
          collectionHex,
          tokenIdHex,
          status: NftMintStatus.CONFIRMED,
          lastError: null,
          updatedAtMs: now(),
        });
        result.recoveredFromChain += 1;
        log(`genesis: creature ${c.id} already on chain (owner ${owner})`);
        continue;
      }
      const txHash = await chain.mint({
        collectionHex,
        toHex,
        tokenIdHex,
        metadataHashHex: genesisMetadataHashHex({
          worldId,
          creatureId: c.id,
          name: c.name,
          speciesSlug: species.get(c.speciesId) ?? null,
        }),
      });
      await linkStore.upsert({
        ...base,
        genesis: true,
        collectionHex,
        tokenIdHex,
        mintTxHex: txHash,
        status: NftMintStatus.CONFIRMED,
        lastError: null,
        updatedAtMs: now(),
      });
      result.minted.push({ creatureId: c.id, txHash });
      log(`genesis: creature ${c.id} ${c.name} minted tx ${txHash}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await linkStore.upsert({
        ...base,
        genesis: true,
        status: NftMintStatus.FAILED,
        lastError: message.slice(0, 500),
        updatedAtMs: now(),
      });
      result.failed.push({ creatureId: c.id, error: message });
      log(`genesis: creature ${c.id} failed: ${message}`);
    }
  }
  return result;
}

/** Live chain for the genesis mint (Boing testnet RPC + operator seed). */
export function createSdkGenesisChain(
  config: BoingNftConfig,
  options: { receiptTimeoutMs?: number; pollMs?: number } = {},
): GenesisChain {
  const client = createClient({ baseUrl: config.rpcUrl, maxRetries: 3 });
  const secretHex = config.secretHex;
  if (secretHex == null) throw new Error("BOING_SECRET_HEX required");
  const secretKey32 = hexToBytes(ensure0xHex(secretHex));
  if (secretKey32.length !== 32)
    throw new Error("BOING_SECRET_HEX must be 32 bytes");
  const timeoutMs = options.receiptTimeoutMs ?? 60_000;
  const pollMs = options.pollMs ?? 1_500;
  let sender: string | null = null;
  const operatorHex = async () =>
    (sender ??= await senderHexFromSecretKey(secretKey32));
  return {
    operatorHex,
    async ownerOf(collectionHex, tokenIdHex) {
      const sim = await client.simulateContractCall(
        collectionHex,
        encodeReferenceOwnerOfCalldataHex(tokenIdHex),
        { senderHex: await operatorHex() },
      );
      if (!sim.success) throw new Error(sim.error ?? "owner_of failed");
      const word = ensure0xHex(sim.return_data ?? ZERO_ACCOUNT).toLowerCase();
      return /^0x0*$/.test(word) ? null : word;
    },
    mint(input) {
      // Same queue as the mint edge: one operator nonce at a time.
      return operatorTxQueue.run(() => mintNow(input));
    },
  };

  async function mintNow({
    collectionHex,
    toHex,
    tokenIdHex,
    metadataHashHex,
  }: Parameters<GenesisChain["mint"]>[0]): Promise<string> {
    const senderHex = await operatorHex();
    const sent = await submitContractCallWithSimulationRetry({
      client,
      secretKey32,
      senderHex,
      contractHex: collectionHex,
      calldata: encodeReferenceMintBatchCalldata(
        toHex,
        [tokenIdHex],
        [metadataHashHex],
      ),
    });
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const receipt = await client.getTransactionReceipt(sent.tx_hash);
      if (receipt != null) {
        if (!receipt.success) {
          throw new Error(`mint reverted: ${receipt.error ?? "unknown"}`);
        }
        return sent.tx_hash;
      }
      await new Promise((r) => setTimeout(r, pollMs));
    }
    throw new Error(`no receipt for ${sent.tx_hash} after ${timeoutMs} ms`);
  }
}
