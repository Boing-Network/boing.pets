/**
 * Host mint edge. M19 installs the seam; M20 calls queueCreatureMint after
 * BIRTH history commit. Never invoked from packages/sim or step().
 */
import type { BoingNftConfig } from "./config";
import type { BoingNftClient } from "./types";
import type { CreatureMintJob } from "./types";

export type QueuedCreatureMint = CreatureMintJob & {
  queuedAtMs: number;
};

export type MintEdge = {
  readonly enabled: boolean;
  readonly config: BoingNftConfig;
  readonly client: BoingNftClient;
  /**
   * M20 hook: enqueue a creature mint after durable BIRTH commit.
   * M19 does not call this from the birth path. When disabled, no-ops.
   * When enabled, records the job for a later worker (M20) without minting yet.
   */
  queueCreatureMint(job: CreatureMintJob, nowMs?: number): Promise<void>;
  /** Pending jobs recorded while enabled (in-memory until M20 persistence). */
  pendingJobs(): readonly QueuedCreatureMint[];
};

export function createMintEdge(
  config: BoingNftConfig,
  client: BoingNftClient,
): MintEdge {
  const pending: QueuedCreatureMint[] = [];

  return {
    enabled: config.enabled,
    config,
    client,
    async queueCreatureMint(job, nowMs = Date.now()) {
      // Disable switch: leave hashes and offline play unchanged.
      if (!config.enabled) return;
      // M19 records the hook call only — no RPC submit, no step() coupling.
      // M20 will persist CreatureNftLink rows and call client.submitCreatureMint.
      pending.push({ ...job, queuedAtMs: nowMs });
    },
    pendingJobs() {
      return pending;
    },
  };
}
