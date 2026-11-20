import { create } from "zustand";
import type { PlayerPresence, WalletProof } from "@boing-pets/contract";

/** Shared-world extras the HUD and scene drive (null in local play). */
export type SharedWorldControls = {
  /** Ask the server for a sign-in message for `address`. */
  requestChallenge(
    address: string,
  ): Promise<{ nonce: string; message: string }>;
  /** Reconnect as the wallet that signed the challenge. */
  signIn(proof: WalletProof): void;
  /** Forget the session and rejoin as a new guest. */
  signOut(): void;
  /** Report the camera focus; throttled inside the transport. */
  sendPresence(x: number, z: number): void;
};

type SharedWorldState = {
  controls: SharedWorldControls | null;
  sessionId: string | null;
  wallet: string | null;
  players: PlayerPresence[];
  signingIn: boolean;
  walletError: string | null;
  setSigningIn: (signingIn: boolean, walletError?: string | null) => void;
};

export const useSharedWorldStore = create<SharedWorldState>((set) => ({
  controls: null,
  sessionId: null,
  wallet: null,
  players: [],
  signingIn: false,
  walletError: null,
  setSigningIn: (signingIn, walletError = null) =>
    set({ signingIn, walletError }),
}));

/** Other players only (never your own marker). */
export function otherPlayers(
  players: readonly PlayerPresence[],
  sessionId: string | null,
): PlayerPresence[] {
  return players.filter((player) => player.id !== sessionId);
}
