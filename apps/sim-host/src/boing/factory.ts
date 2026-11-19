/**
 * Construct the host-edge Boing NFT client + mint edge from config/env.
 */
import {
  createDisabledBoingNftConfig,
  readBoingNftConfig,
  type BoingNftConfig,
} from "./config";
import { DisabledBoingNftClient } from "./disabled-client";
import { createMintEdge, type MintEdge } from "./mint-edge";
import {
  MemoryCreatureNftLinkStore,
  type CreatureNftLinkStore,
} from "./nft-link";
import { SdkBoingNftClient } from "./sdk-client";
import type { BoingNftClient } from "./types";

export function createBoingNftClient(config: BoingNftConfig): BoingNftClient {
  if (!config.enabled) {
    return new DisabledBoingNftClient(config);
  }
  return new SdkBoingNftClient(config);
}

/** Default: minting off (env unless overridden). */
export function createMintEdgeFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  linkStore: CreatureNftLinkStore = new MemoryCreatureNftLinkStore(),
): MintEdge {
  const config = readBoingNftConfig(env);
  return createMintEdge(config, createBoingNftClient(config), linkStore);
}

/** Explicit offline edge for tests and local play without reading env. */
export function createDisabledMintEdge(
  linkStore: CreatureNftLinkStore = new MemoryCreatureNftLinkStore(),
): MintEdge {
  const config = createDisabledBoingNftConfig();
  return createMintEdge(config, createBoingNftClient(config), linkStore);
}
