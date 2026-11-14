/** Late finish/claim retries after this client already resolved the attempt. */
export function isStaleAttemptError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /attempt already resolved|nothing to claim for this attempt|reward already claimed/i.test(
    message,
  );
}

export function isAlreadyClaimedFinish(finish: {
  ok?: boolean;
  status?: string;
  claim_message?: string;
}): boolean {
  return (
    finish.ok === true && finish.status === "claimed" && !finish.claim_message
  );
}
