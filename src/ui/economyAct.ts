/** Slim economy challenge/confirm helper so pasture menus can list or buy without pulling the market page. */

import { hex32 } from "../core";
import { api, app, notice } from "./appRuntime";
import { assertWallet } from "./careActions";

export async function economyAct(
  kind: string,
  extra: Record<string, unknown> = {},
) {
  await assertWallet();
  const challenge = await api<{
    id: string;
    message: string;
    transaction?: {
      type: string;
      from: string;
      to: string;
      amount: string;
      priority_tip?: string;
      display?: string;
    } | null;
    payload?: {
      payment?: {
        type: string;
        to: string;
        amount: string;
        display?: string;
      };
    };
  }>("/api/economy/challenge", { owner: app.owner, kind, ...extra });

  let txHash: string | undefined;
  const payment =
    challenge.transaction ||
    (challenge.payload?.payment
      ? {
          type: "transfer",
          from: app.owner!,
          to: challenge.payload.payment.to,
          amount: challenge.payload.payment.amount,
          priority_tip: "0",
          display: challenge.payload.payment.display,
        }
      : null);

  if (kind === "buy_listing" && payment) {
    notice(
      payment.display ||
        "Approve the testnet BOING payment in Express, then the purchase signature.",
    );
    const result = (await app.provider!.request({
      method: "boing_sendTransaction",
      params: [payment],
    })) as { tx_id?: string; tx_hash?: string } | string;
    txHash = hex32(
      typeof result === "string" ? result : result.tx_id || result.tx_hash,
    );
  } else {
    notice("Approve the economy signature in Express…");
  }

  const signature = await app.provider!.request({
    method: "boing_signMessage",
    params: [challenge.message, app.owner],
  });
  const confirmBody: Record<string, unknown> = {
    id: challenge.id,
    signature,
  };
  if (txHash) confirmBody.tx_hash = txHash;

  let lastError =
    "Transaction is not included yet. Wait and retry confirmation.";
  for (let i = 0; i < 8; i++) {
    try {
      await api("/api/economy/confirm", confirmBody);
      const { refreshEconomy } = await import("./pages/progressPage");
      await refreshEconomy();
      notice("Economy action confirmed.");
      return;
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError;
      if (!txHash || !/not included yet|Wait and retry/i.test(lastError)) {
        throw error;
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw new Error(lastError);
}
