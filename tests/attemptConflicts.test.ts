import { describe, expect, it } from "vitest";
import {
  isAlreadyClaimedFinish,
  isStaleAttemptError,
} from "../src/ui/minigames/attemptConflicts";

describe("stale activity attempt errors", () => {
  it("treats late finish/claim conflicts as already resolved by this client", () => {
    expect(isStaleAttemptError(new Error("Attempt already resolved"))).toBe(
      true,
    );
    expect(
      isStaleAttemptError(new Error("Nothing to claim for this attempt")),
    ).toBe(true);
    expect(isStaleAttemptError(new Error("Reward already claimed."))).toBe(
      true,
    );
    expect(isStaleAttemptError(new Error("Daily attempts done"))).toBe(false);
  });

  it("recognizes an idempotent claimed finish payload", () => {
    expect(isAlreadyClaimedFinish({ ok: true, status: "claimed" })).toBe(true);
    expect(
      isAlreadyClaimedFinish({
        ok: true,
        status: "success_pending",
        claim_message: "sign me",
      }),
    ).toBe(false);
  });
});
