import { useEffect } from "react";
import { useSharedWorldStore } from "../state/sharedWorldStore";
import { useWorldViewStore } from "../state/worldViewStore";
import {
  prepareBoingWallet,
  signInWithBoing,
  walletErrorText,
} from "../wallet/boing-wallet";

/** "Sign in with Boing" / "Sign out" for the shared world. */
export function WalletButton() {
  const connection = useWorldViewStore((s) => s.connection);
  const controls = useSharedWorldStore((s) => s.controls);
  const wallet = useSharedWorldStore((s) => s.wallet);
  const signingIn = useSharedWorldStore((s) => s.signingIn);
  const walletError = useSharedWorldStore((s) => s.walletError);
  const setSigningIn = useSharedWorldStore((s) => s.setSigningIn);

  useEffect(() => {
    if (controls != null && wallet == null) void prepareBoingWallet();
  }, [controls, wallet]);

  if (controls == null || connection === "local") return null;

  if (wallet != null) {
    return (
      <button
        type="button"
        className="clock-btn wallet-btn"
        title={`Signed in with Boing wallet ${wallet}`}
        onClick={() => controls.signOut()}
      >
        Sign out
      </button>
    );
  }
  return (
    <>
      <button
        type="button"
        className="clock-btn wallet-btn wallet-btn--primary"
        disabled={signingIn || connection !== "live"}
        title="Sign a message in Boing Express (no transaction, no fee). Guests can keep playing."
        onClick={() => {
          setSigningIn(true);
          signInWithBoing(controls).catch((error: unknown) => {
            setSigningIn(false, walletErrorText(error));
          });
        }}
      >
        {signingIn ? "Check Boing Express…" : "Sign in with Boing"}
      </button>
      {walletError ? (
        <span className="wallet-error" role="alert">
          {walletError}
        </span>
      ) : null}
    </>
  );
}
