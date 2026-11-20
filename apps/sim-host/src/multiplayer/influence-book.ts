/**
 * Per-account influence rate-limit book (M22).
 * The kernel still sees one pendingInfluences queue; limits stay host-edge.
 */
import {
  canAcceptInfluence,
  createInfluenceGate,
  pruneInfluenceGate,
  type InfluenceGate,
} from "../influence";
import { LOCAL_ACCOUNT_ID, resolveAccountId } from "./account";

export type InfluenceGateBook = {
  /** accountId → gate */
  byAccount: Map<string, InfluenceGate>;
};

export function createInfluenceGateBook(
  byAccount: Record<string, readonly number[]> = {},
): InfluenceGateBook {
  const map = new Map<string, InfluenceGate>();
  for (const [accountId, acceptedAtMs] of Object.entries(byAccount)) {
    map.set(accountId, createInfluenceGate(acceptedAtMs));
  }
  return { byAccount: map };
}

/** Ensure a gate exists for `accountId` and return it. */
export function gateForAccount(
  book: InfluenceGateBook,
  accountId: string | undefined | null,
): InfluenceGate {
  const id = resolveAccountId(accountId);
  let gate = book.byAccount.get(id);
  if (gate == null) {
    gate = createInfluenceGate();
    book.byAccount.set(id, gate);
  }
  return gate;
}

export function canAcceptForAccount(
  book: InfluenceGateBook,
  accountId: string | undefined | null,
  nowMs: number,
): boolean {
  return canAcceptInfluence(gateForAccount(book, accountId), nowMs);
}

/** Snapshot durable accept times keyed by account. */
export function serializeInfluenceBook(
  book: InfluenceGateBook,
  nowMs?: number,
): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  const accounts = [...book.byAccount.keys()].sort();
  for (const accountId of accounts) {
    const gate = book.byAccount.get(accountId);
    if (gate == null) continue;
    if (nowMs != null) pruneInfluenceGate(gate, nowMs);
    if (gate.acceptedAtMs.length === 0 && accountId !== LOCAL_ACCOUNT_ID) {
      continue;
    }
    out[accountId] = [...gate.acceptedAtMs];
  }
  if (out[LOCAL_ACCOUNT_ID] == null) {
    out[LOCAL_ACCOUNT_ID] = [];
  }
  return out;
}

/**
 * Hydrate a book from durable tables.
 * Legacy saves only have a flat accept array — that becomes the local account.
 */
export function hydrateInfluenceBook(options: {
  influenceAcceptedAtMs?: readonly number[];
  influenceAcceptedByAccount?: Record<string, readonly number[]>;
}): InfluenceGateBook {
  const byAccount: Record<string, number[]> = {};
  if (options.influenceAcceptedByAccount != null) {
    for (const [accountId, times] of Object.entries(
      options.influenceAcceptedByAccount,
    )) {
      byAccount[accountId] = [...times];
    }
  }
  if (
    byAccount[LOCAL_ACCOUNT_ID] == null &&
    options.influenceAcceptedAtMs != null
  ) {
    byAccount[LOCAL_ACCOUNT_ID] = [...options.influenceAcceptedAtMs];
  }
  if (byAccount[LOCAL_ACCOUNT_ID] == null) {
    byAccount[LOCAL_ACCOUNT_ID] = [];
  }
  return createInfluenceGateBook(byAccount);
}

/** Flat local accept list for legacy DurableTables.influenceAcceptedAtMs. */
export function localAcceptedAtMs(book: InfluenceGateBook): number[] {
  return [...gateForAccount(book, LOCAL_ACCOUNT_ID).acceptedAtMs];
}
