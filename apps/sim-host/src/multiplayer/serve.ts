/**
 * Shared-world server entrypoint: `npm run mp:serve [-- --port 8787]`.
 *
 * One HostRuntime (the single writer) behind a WebSocket server. Every
 * browser that opens the client with `?mp=ws://HOST:PORT` joins the same
 * living world. Storage is a JSON file under `--data` (default
 * `.living-pets-mp/`), or Postgres when DATABASE_URL is set.
 *
 * Options (flags or env; see server-config.ts):
 *   --host / LIVING_PETS_MP_HOST        bind address (default 127.0.0.1)
 *   --port / LIVING_PETS_MP_PORT / PORT port (default 8787)
 *   --data / LIVING_PETS_MP_DATA        data dir (default .living-pets-mp)
 *   --seed / LIVING_PETS_MP_SEED        seed for a new world (default 1)
 *   --scale / LIVING_PETS_MP_SCALE      time scale for a new world (default 64)
 *   LIVING_PETS_MP_OWNER_KEY            owner key (local default: generated)
 *   LIVING_PETS_MP_SECRET               token HMAC key (local default: saved
 *                                       in the data dir)
 *   LIVING_PETS_MP_ALLOWED_ORIGINS      extra allowed browser origins, comma
 *                                       separated, `*` wildcards
 *   LIVING_PETS_BOING_MINTING           mint creatures and player rewards on
 *                                       Boing (default off; see README)
 *   NODE_ENV=production                 require the secrets, DATABASE_URL and
 *                                       an origin list from the environment
 *   LIVING_PETS_SAVE_DOWN_AFTER_S       report /healthz unhealthy (503) once
 *                                       world saves have failed this long
 *                                       (default 600)
 *
 * Database trouble (timeouts, dropped connections) never exits the process:
 * boot retries with backoff, live saves retry with backoff while the world
 * keeps ticking in memory, and `/healthz` reports `db` / `save` status.
 */
import path from "node:path";
import { parseArgs } from "node:util";
import {
  createMintEdgeFromEnv,
  createRepositoryAssetMintLinkStore,
  createRepositoryNftLinkStore,
} from "../boing";
import { BrowserWorldRepository } from "../persist/browser-repository";
import { createFileStringStore } from "../persist/file-string-store";
import type { WorldRepository } from "../persist/repository";
import { describeError } from "../runtime/save-tracker";
import {
  ServerConfigError,
  compileOriginMatcher,
  resolveServerConfig,
  type ServerConfig,
} from "./server-config";
import { createSharedWorldHost } from "./shared-world-host";
import { generateOwnerKey, loadOrCreateSecret } from "./tokens";
import { createClient } from "@boing-network/boing-sdk";
import { DEFAULT_BOING_RPC_URL } from "../boing/config";
import { itemMarketEnabled, readMarketConfig } from "../market/config";
import {
  createListingIndex,
  mintedTokens,
  rpcReadBatch,
} from "../market/listings";
import { createSdkGenesisChain, runGenesisMint } from "../boing/genesis-mint";
import { createCatalogCache } from "../market/cache";
import {
  createItemListingIndex,
  disabledItemsResponse,
} from "../market/item-listings";
import { walletAccountId } from "../items/escrow-reconcile";
import { createWalletChallenges, normalizeWalletAddress } from "./wallet-auth";
import {
  MARKET_ITEMS_MINT_CHALLENGE_PATH,
  MARKET_ITEMS_MINT_PATH,
  MARKET_ITEMS_MINT_RETRY_PATH,
} from "@boing-pets/contract";
import { createCreatureOwners } from "../market/creature-owners";
import { createItemMintEndpoints } from "../market/item-mint";
import { mintFeeFromEnv, verifyMintPayment } from "../market/mint-payment";
import { listenSharedWorldWs } from "./ws-server";

const { values } = parseArgs({
  options: {
    host: { type: "string" },
    port: { type: "string" },
    data: { type: "string" },
    seed: { type: "string" },
    scale: { type: "string" },
  },
  allowPositionals: false,
});

function log(line: string): void {
  console.log(`[${new Date().toISOString()}] ${line}`);
}

// Last line of defense: a stray rejected promise (e.g. a database call in
// a fire-and-forget path) is logged, never fatal. Saves have their own retry.
let unhandledRejections = 0;
process.on("unhandledRejection", (reason) => {
  unhandledRejections += 1;
  log(`unhandled rejection #${unhandledRejections}: ${describeError(reason)}`);
});

function saveDownAfterMs(): number | undefined {
  const raw = process.env.LIVING_PETS_SAVE_DOWN_AFTER_S;
  if (raw == null || raw.trim() === "") return undefined;
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined;
}

function loadConfig(): ServerConfig {
  try {
    return resolveServerConfig(values, process.env);
  } catch (error) {
    if (error instanceof ServerConfigError) {
      // Fail fast with a clear message; never echo secret values.
      console.error(`living-pets shared world: ${error.message}`);
      process.exit(1);
    }
    throw error;
  }
}
const config = loadConfig();
const dataDir = path.resolve(config.dataDir);

async function openRepository(): Promise<{
  repository: WorldRepository;
  label: string;
  dispose: () => Promise<void>;
}> {
  if (config.databaseUrl != null) {
    const [{ PrismaWorldRepository }, { createPrismaHostMetaStore }, db] =
      await Promise.all([
        import("../persist/prisma-repository"),
        import("../persist/prisma-host-meta"),
        import("@boing-pets/db"),
      ]);
    const client = db.createDbClient();
    const repository = new PrismaWorldRepository({
      client,
      hostMeta: createPrismaHostMetaStore(client),
    });
    return {
      repository,
      label: "Postgres (DATABASE_URL)",
      dispose: () => client.$disconnect(),
    };
  }
  return {
    repository: new BrowserWorldRepository({
      store: createFileStringStore(dataDir),
    }),
    label: `file store ${dataDir}`,
    dispose: async () => {},
  };
}

const { repository, label, dispose } = await openRepository();
const tokenSecret =
  config.sessionSecret != null
    ? Buffer.from(config.sessionSecret)
    : await loadOrCreateSecret(path.join(dataDir, "session-secret"));
const ownerKeyFromEnv =
  config.ownerKey != null && config.ownerKey.length >= 8
    ? config.ownerKey
    : null;
const ownerKey = ownerKeyFromEnv ?? generateOwnerKey();

// Off unless LIVING_PETS_BOING_MINTING is set (see apps/sim-host/src/boing).
const creatureLinks = createRepositoryNftLinkStore(repository);
const assetLinks = createRepositoryAssetMintLinkStore(repository);
const mintEdge = createMintEdgeFromEnv(process.env, creatureLinks, assetLinks);
// Marketplace: read-only catalog; trading stays off until the operator and
// escrow accounts are configured (see apps/sim-host/src/market).
const marketConfig = readMarketConfig(process.env);
// With an escrow contract configured, read its listings (and on-chain owners)
// with read-only simulated calls every 30 s. No key is involved.
const marketRead = rpcReadBatch(
  createClient({
    baseUrl: process.env.BOING_RPC_URL?.trim() || DEFAULT_BOING_RPC_URL,
    maxRetries: 2,
  }),
);
// Mint-on-demand fee checks read receipts and blocks (no key).
const paymentChain = createClient({
  baseUrl: process.env.BOING_RPC_URL?.trim() || DEFAULT_BOING_RPC_URL,
  maxRetries: 2,
});
const itemMintFeeWei = mintFeeFromEnv(process.env);
const listingIndex =
  marketConfig.escrowHex == null
    ? null
    : createListingIndex({
        escrowHex: marketConfig.escrowHex,
        read: marketRead,
        tokens: async () => {
          const [c, a] = await Promise.all([
            creatureLinks.list(),
            assetLinks.list(),
          ]);
          return mintedTokens([...c, ...a]);
        },
        log,
      });
listingIndex?.start();
// M22: relic recipients and relic ownership read owner_of on chain. Read-only
// simulate calls; null when minting is off or no operator seed is configured.
const relicChain = (() => {
  if (!mintEdge.enabled || mintEdge.config.secretHex == null) return null;
  try {
    const chain = createSdkGenesisChain(mintEdge.config);
    return {
      operatorHex: () => chain.operatorHex(),
      ownerOf: (collectionHex: string, tokenIdHex: string) =>
        chain.ownerOf(collectionHex, tokenIdHex),
    };
  } catch {
    return null;
  }
})();
const host = createSharedWorldHost({
  repository,
  seed: config.seed,
  initialScale: config.scale,
  mintEdge,
  relicChain,
  // Creature autonomy: loot goes to the wallet that holds the creature NFT
  // (adopted creatures); anyone else's finds stay in the creature's pouch.
  creatureOwners: createCreatureOwners({
    links: () => creatureLinks.list(),
    chain: () => listingIndex?.snapshot() ?? null,
    operatorHex: marketConfig.operatorHex,
    escrowHex: marketConfig.escrowHex,
  }),
  // Off-chain-first item rewards unless explicitly asked to mint at once.
  itemRewardMode:
    process.env.LIVING_PETS_ITEM_REWARD_AUTOMINT === "1"
      ? "automint"
      : "offchain",
  // Mint on demand is player-paid: LIVING_PETS_ITEM_MINT_FEE BOING per
  // request, sent to the operator wallet (which pays the mint gas).
  itemMintFee: { feeWei: itemMintFeeWei, payToHex: marketConfig.operatorHex },
  saveRetry: { downAfterMs: saveDownAfterMs() },
  log,
});
// Boot: a database that is restarting or slow must not crash-loop the
// machine. Retry with backoff (1 s .. 60 s) until the world loads.
for (let attempt = 1; ; attempt += 1) {
  try {
    await host.start();
    if (attempt > 1) log(`world loaded on attempt ${attempt}`);
    break;
  } catch (error) {
    const waitMs = Math.min(60_000, 1_000 * 2 ** Math.min(attempt - 1, 6));
    log(
      `boot: world load failed (attempt ${attempt}), retrying in ${Math.round(waitMs / 1000)}s: ${describeError(error)}`,
    );
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
}
// LPIT item market: read the item escrow every 30 s and reconcile listings,
// fills and cancels into the world inventory (read-only calls, no key).
const itemIndex = (() => {
  const items = host.runtime.items;
  if (!itemMarketEnabled(marketConfig) || items == null || !items.enabled) {
    return null;
  }
  const worldNow = () => host.runtime.session.snapshot.world;
  return createItemListingIndex({
    itemEscrowHex: marketConfig.itemEscrowHex!,
    collectionHex: marketConfig.itemCollectionHex!,
    read: marketRead,
    reconcile: (listings) =>
      items.reconcileItemEscrow({
        worldId: worldNow().id,
        tick: worldNow().lastTick,
        escrowHex: marketConfig.itemEscrowHex!,
        listings,
        nowMs: Date.now(),
      }),
    usable: (wallet, slug) =>
      items.usableUnits(
        worldNow().id,
        walletAccountId(wallet),
        slug,
        worldNow().lastTick,
        "minted",
      ),
    offchain: (wallet, slug) =>
      items.offchainUnits(worldNow().id, wallet, slug, worldNow().lastTick),
    mintInfo: (wallet) => items.mintInfo(worldNow().id, wallet, Date.now()),
    log,
  });
})();
itemIndex?.start();
// Mint on demand: wallet-signed, player-paid POSTs; the operator mints
// through its nonce queue.
const itemMint = (() => {
  const items = host.runtime.items;
  const payToHex = marketConfig.operatorHex;
  if (itemIndex == null || items == null || !items.enabled) return null;
  if (payToHex == null) return null;
  return createItemMintEndpoints({
    chainId: config.chainId,
    enabled: () => items.mintEnabled,
    feeWei: itemMintFeeWei,
    payToHex,
    verifyPayment: (paymentTx, walletHex) =>
      verifyMintPayment({
        chain: paymentChain,
        txId: paymentTx,
        walletHex,
        payToHex,
        feeWei: itemMintFeeWei,
        nowMs: Date.now(),
      }),
    precheck: async ({ walletHex, slug, qty }) => {
      const world = host.runtime.session.snapshot.world;
      const info = await items.mintInfo(world.id, walletHex, Date.now());
      if (info.requestsLeft === 0) {
        return `${info.maxRequestsPerDay} mints per day; try again tomorrow`;
      }
      const off = await items.offchainUnits(
        world.id,
        walletHex,
        slug,
        world.lastTick,
      );
      return off.unminted < qty
        ? `only ${off.unminted} unminted to mint`
        : null;
    },
    request: async ({ walletHex, slug, qty, paymentTx }) => {
      const world = host.runtime.session.snapshot.world;
      const result = await items.requestMint({
        worldId: world.id,
        walletHex,
        slug,
        qty,
        paymentTx,
        tick: world.lastTick,
        nowMs: Date.now(),
      });
      if (result.ok) itemIndex.forget(walletHex);
      return result;
    },
    retry: async (paymentTx) => {
      const world = host.runtime.session.snapshot.world;
      return items.retryPaidMint({ worldId: world.id, paymentTx });
    },
  });
})();
const server = await listenSharedWorldWs({
  host,
  hostname: config.hostname,
  port: config.port,
  tokenSecret,
  ownerKey,
  ownerWallets: config.ownerWallets,
  walletChallenges: createWalletChallenges({ chainId: config.chainId }),
  log,
  allowOrigin: compileOriginMatcher(config.allowedOrigins),
  marketCatalog: createCatalogCache({
    snapshot: () => host.runtime.session.snapshot,
    creatureLinks,
    assetLinks,
    config: marketConfig,
    index: listingIndex,
  }),
  ...(listingIndex != null
    ? { marketListings: async () => listingIndex.response() }
    : {}),
  ...(itemMint != null
    ? {
        marketPost: {
          [MARKET_ITEMS_MINT_CHALLENGE_PATH]: (body, origin) =>
            itemMint.challenge(body, origin),
          [MARKET_ITEMS_MINT_PATH]: (body) => itemMint.mint(body),
          [MARKET_ITEMS_MINT_RETRY_PATH]: (body) => itemMint.retry(body),
        },
      }
    : {}),
  marketItems: async (query) => {
    if (itemIndex == null) {
      return disabledItemsResponse(
        "Browse only: no item escrow is configured on this server.",
      );
    }
    const wallet = normalizeWalletAddress(query.get("wallet") ?? "");
    return itemIndex.response(wallet);
  },
  health: () => {
    const snapshot = host.runtime.session.snapshot;
    const clock = host.runtime.clock;
    const save = host.runtime.persistenceStatus();
    return {
      tick: snapshot.world.lastTick,
      paused: clock.paused,
      scale: clock.scale,
      // "ok" | "retrying" (world ticking in memory, saves backing off) |
      // "down" (saves failing past LIVING_PETS_SAVE_DOWN_AFTER_S: 503).
      db: save.db,
      save,
      unhandledRejections,
      ...(save.db === "down" ? { ok: false } : {}),
    };
  },
});

const world = host.runtime.session.snapshot.world;
const lines = [
  `Living Pets shared world on ${server.url}${config.production ? " (production)" : ""}`,
  `  world ${world.id} seed ${world.seed} tick ${world.lastTick}, storage: ${label}`,
  `  allowed origins: ${config.allowedOrigins.join(", ")} (and non-browser clients)`,
];
if (!config.production) {
  lines.push(
    "",
    "Open the client (npm run dev -w @boing-pets/client) with:",
    `  player: http://127.0.0.1:5173/world/?mp=${server.url}`,
    ownerKeyFromEnv != null
      ? "  owner:  add &owner=<LIVING_PETS_MP_OWNER_KEY> to the player link"
      : `  owner:  http://127.0.0.1:5173/world/?mp=${server.url}&owner=${ownerKey}`,
    "Only the owner can pause or change the speed. Ctrl+C saves and exits.",
  );
  if (config.hostname !== "127.0.0.1" && config.hostname !== "localhost") {
    lines.push(
      "",
      `WARNING: bound to ${config.hostname}. Anyone who can reach this port can join.`,
    );
  }
}
console.log(lines.join("\n"));

function envFlag(value: string | undefined): boolean {
  const v = value?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

// Genesis mint of the founders (see apps/sim-host/src/boing/genesis-mint.ts).
// Runs in the background, once per boot while the flag is set; idempotent.
if (mintEdge.enabled && envFlag(process.env.LIVING_PETS_BOING_GENESIS_MINT)) {
  void (async () => {
    try {
      const result = await runGenesisMint({
        config: mintEdge.config,
        chain: createSdkGenesisChain(mintEdge.config),
        linkStore: creatureLinks,
        snapshot: host.runtime.session.snapshot,
        log,
      });
      log(
        `genesis: done. founders ${result.founders}, minted ${result.minted.length}, already ${result.alreadyMinted}, recovered ${result.recoveredFromChain}, failed ${result.failed.length}`,
      );
    } catch (error) {
      log(
        `genesis: stopped: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  })();
}

let stopping = false;
async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  log(`${signal}: closing connections and saving the world`);
  // Hard stop in case a save hangs; Fly's kill_timeout is longer than this.
  const watchdog = setTimeout(() => {
    console.error("shutdown timed out");
    process.exit(1);
  }, 25_000);
  watchdog.unref();
  try {
    await server.close();
    await host.quit();
    await dispose();
    log(`saved at tick ${host.runtime.session.snapshot.world.lastTick}. bye.`);
    process.exit(0);
  } catch (error) {
    // e.g. "world not saved on quit ...: last durable tick N" — never claim
    // a save that did not happen.
    log(`shutdown: ${describeError(error)}`);
    process.exit(1);
  }
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
