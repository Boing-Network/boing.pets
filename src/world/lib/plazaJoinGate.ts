/** Pure helpers for plaza WebSocket join/move gating. */

export type PlazaJoinPhase = "connecting" | "handshaking" | "live" | "error";

/**
 * Moves are only safe after the server welcome. Sending earlier races the
 * Durable Object's async presence-token DB lookup and surfaces "Send hello first"
 * (easy to confuse with the daily care hello).
 */
export function canSendPlazaMove(phase: PlazaJoinPhase): boolean {
  return phase === "live";
}

export function phaseAfterSocketOpen(phase: PlazaJoinPhase): PlazaJoinPhase {
  if (phase === "connecting") return "handshaking";
  return phase;
}

export function phaseAfterWelcome(phase: PlazaJoinPhase): PlazaJoinPhase {
  if (phase === "handshaking" || phase === "connecting") return "live";
  return phase;
}

/** Map server errors to user-facing copy (avoid care-hello confusion). */
export function plazaErrorMessage(serverMessage: string): string {
  if (serverMessage === "Send hello first") {
    return "Plaza handshake incomplete — try Join plaza again.";
  }
  return serverMessage;
}
