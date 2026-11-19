/**
 * Offline-safe no-op client. Used when minting is disabled (default).
 */
import type { BoingNftConfig } from "./config";
import type {
  BoingCollectionDeployPlan,
  BoingMintBatchPlan,
  BoingMintSubmitResult,
  BoingNftClient,
  BoingNftProbeResult,
} from "./types";

export class DisabledBoingNftClient implements BoingNftClient {
  readonly enabled = false;

  constructor(readonly config: BoingNftConfig) {}

  async probe(): Promise<BoingNftProbeResult | null> {
    return null;
  }

  planCollectionDeploy(): BoingCollectionDeployPlan {
    throw new Error("Boing minting disabled");
  }

  planCreatureMint(): BoingMintBatchPlan {
    throw new Error("Boing minting disabled");
  }

  async submitCreatureMint(): Promise<BoingMintSubmitResult> {
    throw new Error("Boing minting disabled");
  }
}
