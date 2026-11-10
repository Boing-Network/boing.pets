/**
 * Mining page panel: withdraw mined ore into the Boing multi-token item contract,
 * or deposit wallet items back into the in-game inventory.
 * Self-mounting (no page-body markup) and hidden while the deployment has it disabled.
 */
import { hex32 } from "../core";
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
  operator?: string;
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
  deposits?: Array<{
    tx_hash: string;
    game_item_id: string;
    qty: number;
    status: string;
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

function txHashOf(result: unknown): string {
  if (typeof result === "string") return hex32(result);
  const rec =
    result && typeof result === "object"
      ? (result as Record<string, unknown>)
      : {};
  return hex32(String(rec.tx_id || rec.tx_hash || ""));
}

async function withdraw(gameItemId: string, qty: number) {
  await assertWallet();
  notice("Approve the on-chain withdrawal signature in Express?");
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
    `Withdrawal submitted (${res.withdrawal.tx_hash.slice(0, 12)}?). Items appear in your wallet in a few seconds.`,
  );
  await refreshOnchainItems();
}

async function deposit(gameItemId: string, qty: number) {
  await assertWallet();
  notice("Approve the item transfer to the Pets operator in Express?");
  const prepared = await api<{ transaction: Record<string, unknown> }>(
    "/api/items/deposit/prepare",
    {
      owner: app.owner,
      game_item_id: gameItemId,
      qty,
    },
  );
  const result = await app.provider!.request({
    method: "boing_sendTransaction",
    params: [prepared.transaction],
  });
  const txHash = txHashOf(result);
  notice("Transfer submitted. Crediting your inventory?");
  let lastError =
    "Transaction is not included yet. Wait and retry confirmation.";
  for (let i = 0; i < 8; i++) {
    try {
      const res = await api<{ deposit: { tx_hash: string; qty: number } }>(
        "/api/items/deposit/confirm",
        { owner: app.owner, tx_hash: txHash },
      );
      notice(
        `Deposited ${res.deposit.qty} item${res.deposit.qty === 1 ? "" : "s"} (${res.deposit.tx_hash.slice(0, 12)}?). They are back in your inventory.`,
      );
      await refreshOnchainItems();
      return;
    } catch (e) {
      lastError = e instanceof Error ? e.message : lastError;
      if (!/not included yet|Wait and retry/i.test(lastError)) throw e;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw new Error(lastError);
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
    '<div><p class="eyebrow">ON-CHAIN ITEMS</p><h2>Move items between the game and your wallet</h2></div>';
  const intro = document.createElement("p");
  intro.className = "subtle";
  intro.textContent = app.owner
    ? "Withdraw stackable items as Boing testnet game items, or transfer them back to the Pets operator to deposit them into your inventory. Withdrawn items leave your in-game stack; a deposit credits them once the transfer is included. Equipped cosmetics and furniture on your home plot must be taken off first."
    : "Connect Boing Express to withdraw stackable items as testnet game items, or deposit them back from your wallet.";
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
      ? `In game ${item.offchain_qty ?? 0} ? in wallet ${onchain} ? item #${item.itemId}`
      : `Item #${item.itemId}`;
    card.append(h, p);
    if (app.owner) {
      const have = item.offchain_qty ?? 0;
      const wallet = item.onchain_qty ?? 0;
      const withdrawQty = Math.min(have, status.max_qty ?? 100);
      const depositQty = Math.min(Math.max(wallet, 0), status.max_qty ?? 100);
      const outBtn = document.createElement("button");
      outBtn.className = "secondary";
      outBtn.type = "button";
      outBtn.textContent =
        withdrawQty > 0
          ? `Withdraw ${withdrawQty} ? sign`
          : "Nothing to withdraw";
      outBtn.disabled = app.busy || withdrawQty <= 0;
      outBtn.onclick = () =>
        void run(() => withdraw(item.gameItemId, withdrawQty));
      const inBtn = document.createElement("button");
      inBtn.className = "secondary";
      inBtn.type = "button";
      inBtn.textContent =
        depositQty > 0
          ? `Deposit ${depositQty} ? transfer`
          : "Nothing to deposit";
      inBtn.disabled = app.busy || depositQty <= 0 || item.onchain_qty == null;
      inBtn.onclick = () =>
        void run(() => deposit(item.gameItemId, depositQty));
      card.append(outBtn, inBtn);
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
  const lastWithdraw = status.withdrawals?.[0];
  const lastDeposit = status.deposits?.[0];
  const parts: string[] = [];
  if (lastWithdraw) {
    parts.push(
      `Last withdrawal: ${lastWithdraw.qty} ? ${lastWithdraw.game_item_id} ? ${lastWithdraw.status}${lastWithdraw.error ? ` (${lastWithdraw.error})` : ""}`,
    );
  }
  if (lastDeposit) {
    parts.push(
      `Last deposit: ${lastDeposit.qty} ? ${lastDeposit.game_item_id} ? ${lastDeposit.status}`,
    );
  }
  log.textContent = parts.join(" ? ");
  el.replaceChildren(head, intro, grid, log);
}
