/**
 * Keep the off-chain inventory in step with the LPIT item escrow
 * (`contracts/escrow/src/items.rs`). Pure: chain state in, lot changes out.
 *
 * LPIT has no burn, so a used potion stays in the wallet on chain while the
 * world inventory (DB) says it is gone. The DB stays the source of truth for
 * what is *usable*, and every unit is conserved inside `inventory_lot`:
 *
 * - **Lock** (`ilist:<escrow>:<id>`): when a listing first appears, up to
 *   `listed` units are debited from the seller's *minted* lots (units that
 *   exist as LPIT) into a lot held by the pseudo-account
 *   `escrow:<escrow>:<id>`. Listed units can no longer be used in the world.
 *   If the seller had fewer minted unused units than they listed (they listed
 *   tokens they had already used), the lock is smaller and the listing is
 *   only partly *backed*; the market does not offer it. Unminted units never
 *   back a listing: they are minted on demand first.
 * - **Fill** (`ibuy:<escrow>:<id>:<k>`): each on-chain fill credits the buyer
 *   with up to its quantity, taken from the lock.
 * - **Return** (`iret:<escrow>:<id>`): a cancelled listing credits the seller
 *   with up to the returned units, taken from the lock.
 *
 * Every step is keyed by its source key, so replaying the same chain state is
 * a no-op, and steps apply in order (lock, fills by index, return). Every lot
 * created here is minted: it mirrors LPIT units that exist on chain.
 */
import { lpitItemSlug } from "@boing-pets/contract";
import { balanceOf, mergeLots, nextLotId, planDebit } from "./inventory";
import type { InventoryLotRow } from "./types";

export type ChainItemListing = {
  id: number;
  sellerHex: string;
  itemId: number;
  listed: number;
  remaining: number;
  open: boolean;
  /** On-chain fill count. */
  fillCount: number;
  /** Fills 0..n-1 read so far (must be a prefix, in order). */
  fills: readonly { buyerHex: string; qty: number }[];
};

export type ItemListingStatus = {
  /** Units of the listing still backed by locked in-game inventory. */
  backed: number;
  /** The lock exists and every known fill and return is applied. */
  reconciled: boolean;
};

export function walletAccountId(hex: string): string {
  return `w:${hex.replace(/^0x/i, "").toLowerCase()}`;
}

const strip = (hex: string) => hex.replace(/^0x/i, "").toLowerCase();

export function itemLockKey(escrowHex: string, id: number): string {
  return `ilist:${strip(escrowHex)}:${id}`;
}
export function itemFillKey(escrowHex: string, id: number, k: number): string {
  return `ibuy:${strip(escrowHex)}:${id}:${k}`;
}
export function itemReturnKey(escrowHex: string, id: number): string {
  return `iret:${strip(escrowHex)}:${id}`;
}
export function itemEscrowAccount(escrowHex: string, id: number): string {
  return `escrow:${strip(escrowHex)}:${id}`;
}

export function planItemEscrowReconcile(input: {
  lots: readonly InventoryLotRow[];
  worldId: number;
  escrowHex: string;
  listings: readonly ChainItemListing[];
  tick: number;
  nowMs: number;
}): {
  changed: InventoryLotRow[];
  status: Map<number, ItemListingStatus>;
} {
  const { worldId, escrowHex, tick, nowMs } = input;
  let working: InventoryLotRow[] = [...input.lots];
  const changed = new Map<string, InventoryLotRow>();
  const status = new Map<number, ItemListingStatus>();

  const apply = (rows: readonly InventoryLotRow[]) => {
    working = mergeLots(working, rows);
    for (const row of rows) changed.set(row.sourceKey, row);
  };
  const find = (key: string) => working.find((lot) => lot.sourceKey === key);
  const credit = (
    sourceKey: string,
    accountId: string,
    slug: string,
    amount: number,
  ): InventoryLotRow => {
    const row: InventoryLotRow = {
      id: nextLotId(working),
      worldId,
      accountId,
      sourceKey,
      itemSlug: slug,
      amount,
      remaining: amount,
      gainedTick: tick,
      spoilsAtTick: null,
      minted: true,
      createdAtMs: nowMs,
      updatedAtMs: nowMs,
    };
    apply([row]);
    return row;
  };

  for (const l of [...input.listings].sort((a, b) => a.id - b.id)) {
    const slug = lpitItemSlug(l.itemId);
    if (slug == null) {
      status.set(l.id, { backed: 0, reconciled: true });
      continue;
    }
    const seller = walletAccountId(l.sellerHex);
    let lock = find(itemLockKey(escrowHex, l.id));
    if (lock == null) {
      const usable = balanceOf(working, seller, slug, tick, "minted");
      const amount = Math.max(0, Math.min(l.listed, usable));
      const debit =
        amount > 0
          ? planDebit(working, seller, slug, amount, tick, nowMs, {
              only: "minted",
            })
          : [];
      if (debit == null) {
        status.set(l.id, { backed: 0, reconciled: false });
        continue;
      }
      apply(debit);
      lock = credit(
        itemLockKey(escrowHex, l.id),
        itemEscrowAccount(escrowHex, l.id),
        slug,
        amount,
      );
    }
    const take = (n: number): number => {
      const current = find(lock!.sourceKey)!;
      const got = Math.max(0, Math.min(n, current.remaining));
      if (got > 0) {
        apply([
          {
            ...current,
            remaining: current.remaining - got,
            updatedAtMs: nowMs,
          },
        ]);
      }
      return got;
    };
    const complete = l.fills.length >= l.fillCount;
    const fills = l.fills.slice(0, l.fillCount);
    fills.forEach((fill, k) => {
      const key = itemFillKey(escrowHex, l.id, k);
      if (find(key) != null) return;
      credit(key, walletAccountId(fill.buyerHex), slug, take(fill.qty));
    });
    if (!l.open && l.remaining > 0 && complete) {
      const key = itemReturnKey(escrowHex, l.id);
      if (find(key) == null) credit(key, seller, slug, take(l.remaining));
    }
    status.set(l.id, {
      backed: find(lock.sourceKey)!.remaining,
      reconciled: complete,
    });
  }
  return { changed: [...changed.values()], status };
}
