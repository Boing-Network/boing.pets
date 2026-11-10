/**
 * Mining page panel: withdraw mined ore into the Boing multi-token item contract.
 * Self-mounting (no page-body markup) and hidden while the deployment has it disabled.
 */
import { api, app, $maybe, notice } from "./appRuntime";
import { assertWallet, run } from "./careActions";

interface OnchainItemView {
  gameItemId: string;
  itemId: number;
  name: string;
  offchain_qty?: number;
  onchain_qty?: number | null;
}

interface OnchainStatus {
  enabled: boolean;
  reason?: string;
  contract?: string;
  max_qty?: number;
  items: OnchainItemView[];
  withdrawals?: Array<{
    id: string;
    game_item_id: string;
    qty: number;
    status: string;
    tx_hash: string;
    error: string | null;
  }>;
}

const OBSERVER = "https://boing.observer";

function mount(): HTMLElement | null {
  let el = $maybe("#onchain-items");
  if (el) return el;
  const anchor = $maybe("#mining");
  if (!anchor) return null;
  el = document.createElement("section");
  el.id = "onchain-items";
  el.className = "panel";
  el.hidden = true;
  anchor.after(el);
  return el;
}

async function withdraw(gameItemId: string, qty: number) {
  await assertWallet();
  notice("Approve the on-chain withdrawal signature in Express…");
  const challenge = await api<{ id: string; message: string }>(
    "/api/items/withdraw/challenge",
    {
      owner: app.owner,
      game_item_id: gameItemId,
      qty,
    },
  );
  const signature = await app.provider!.request({
    method: "boing_signMessage",
    params: [challenge.message, app.owner],
  });
  const res = await api<{ withdrawal: { tx_hash: string } }>(
    "/api/items/withdraw/confirm",
    {
      id: challenge.id,
      signature,
    },
  );
  notice(
    `Withdrawal submitted (${res.withdrawal.tx_hash.slice(0, 12)}…). Items appear in your wallet in a few seconds.`,
  );
  await refreshOnchainItems();
}

export async function refreshOnchainItems() {
  const el = mount();
  if (!el) return;
  const status = await api<OnchainStatus>(
    "/api/items/onchain" + (app.owner ? "?owner=" + app.owner : ""),
  );
  if (!status.enabled) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  const contract = status.contract || "";
  const head = document.createElement("div");
  head.className = "section-title";
  head.innerHTML =
    '<div><p class="eyebrow">ON-CHAIN ITEMS</p><h2>Withdraw ore to your wallet</h2></div>';
  const intro = document.createElement("p");
  intro.className = "subtle";
  intro.textContent = app.owner
    ? "Move mined ore out of the game into Boing testnet game items (one shared item type per ore). Withdrawn ore leaves your in-game inventory."
    : "Connect Boing Express to withdraw mined ore as testnet game items.";
  const grid = document.createElement("div");
  grid.className = "market-grid";
  for (const item of status.items) {
    const card = document.createElement("article");
    card.className = "market-card";
    const h = document.createElement("h3");
    h.textContent = item.name;
    const p = document.createElement("p");
    p.className = "subtle";
    const onchain = item.onchain_qty == null ? "?" : String(item.onchain_qty);
    p.textContent = app.owner
      ? `In game ${item.offchain_qty ?? 0} · in wallet ${onchain} · item #${item.itemId}`
      : `Item #${item.itemId}`;
    card.append(h, p);
    if (app.owner) {
      const have = item.offchain_qty ?? 0;
      const qty = Math.min(have, status.max_qty ?? 100);
      const btn = document.createElement("button");
      btn.className = "secondary";
      btn.type = "button";
      btn.textContent =
        qty > 0 ? `Withdraw ${qty} · sign` : "Nothing to withdraw";
      btn.disabled = app.busy || qty <= 0;
      btn.onclick = () => void run(() => withdraw(item.gameItemId, qty));
      card.append(btn);
    }
    if (contract) {
      const link = document.createElement("a");
      link.className = "small";
      link.href = `${OBSERVER}/items/${contract.replace(/^0x/, "")}/${item.itemId}?network=testnet`;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = "View item on Observer";
      card.append(link);
    }
    grid.append(card);
  }
  const log = document.createElement("p");
  log.className = "small";
  const last = status.withdrawals?.[0];
  if (last) {
    log.textContent = `Last withdrawal: ${last.qty} × ${last.game_item_id} — ${last.status}${last.error ? ` (${last.error})` : ""}`;
  }
  el.replaceChildren(head, intro, grid, log);
}
