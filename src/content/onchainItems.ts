/**
 * Optional on-chain withdrawal of mined resources into a Boing reference multi-token v1
 * contract (ERC-1155-style shared item types, see boing.network docs/BOING-REFERENCE-MULTI-TOKEN.md).
 *
 * Off-chain inventory stays the source of truth for play. A withdrawal moves a stack out of
 * the D1 inventory and the Pets operator key mints the same quantity of the mapped item id
 * to the player's wallet. On-chain item ids are permanent: never renumber or reuse one.
 */

export interface OnchainItemDef {
  /** Off-chain inventory id (`inventory.item_id`). */
  gameItemId: string;
  /** u64 item id inside the multi-token contract. */
  itemId: number;
  name: string;
}

export const ONCHAIN_ITEMS: readonly OnchainItemDef[] = [
  { gameItemId: "ore-pebble", itemId: 1, name: "Pasture Pebble" },
  { gameItemId: "ore-spark", itemId: 2, name: "Spark Ore" },
  { gameItemId: "ore-crystal", itemId: 3, name: "Boing Crystal" },
];

/** Largest quantity one withdrawal can mint (keeps abuse and refunds small). */
export const ONCHAIN_WITHDRAW_MAX_QTY = 100;

export function onchainItemByGameId(id: string): OnchainItemDef | undefined {
  return ONCHAIN_ITEMS.find((i) => i.gameItemId === id);
}

const strip = (h: string) => h.replace(/^0x/i, "").toLowerCase();

export function hex64(h: string): string {
  const s = strip(h);
  if (!/^[0-9a-f]{64}$/.test(s)) throw new Error("Expected a 32-byte hex id");
  return s;
}

function tag32(ascii: string): Uint8Array {
  const out = new Uint8Array(32);
  for (let i = 0; i < ascii.length && i < 32; i++) out[i] = ascii.charCodeAt(i);
  return out;
}

const BAL_TAG = tag32("BOING_REFMT_BAL_V1");
export const MT_ADMIN_STORAGE_KEY = "0x" + "00".repeat(31) + "e0";
export const MT_SELECTOR_MINT = 0x22;

function hexToBytes(h: string): Uint8Array {
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++)
    out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function bytesToHex(b: Uint8Array): string {
  let s = "";
  for (const x of b) s += x.toString(16).padStart(2, "0");
  return s;
}

function word(n: bigint): Uint8Array {
  const out = new Uint8Array(32);
  let x = n;
  for (let i = 31; i >= 0 && x > BigInt(0); i--) {
    out[i] = Number(x & BigInt(255));
    x >>= BigInt(8);
  }
  return out;
}

/** `balance_of` storage key: `(account[0..24] || itemId_be8) ^ "BOING_REFMT_BAL_V1"`. */
export function mtBalanceStorageKey(account: string, itemId: number): string {
  const raw = new Uint8Array(32);
  raw.set(hexToBytes(hex64(account)).subarray(0, 24), 0);
  raw.set(word(BigInt(itemId)).subarray(24), 24);
  for (let i = 0; i < 32; i++) raw[i] = raw[i]! ^ BAL_TAG[i]!;
  return "0x" + bytesToHex(raw);
}

/** 128-byte `mint(to, itemId, amount)` calldata (admin only). */
export function mtMintCalldata(
  to: string,
  itemId: number,
  amount: number,
): Uint8Array {
  if (!Number.isSafeInteger(itemId) || itemId < 0)
    throw new Error("Invalid item id");
  if (!Number.isSafeInteger(amount) || amount <= 0)
    throw new Error("Invalid amount");
  const out = new Uint8Array(128);
  out.set(word(BigInt(MT_SELECTOR_MINT)), 0);
  out.set(hexToBytes(hex64(to)), 32);
  out.set(word(BigInt(itemId)), 64);
  out.set(word(BigInt(amount)), 96);
  return out;
}

/** Parse a `boing_getContractStorage` result (`{ value }` or bare hex) as a word. */
export function storageWordHex(result: unknown): string {
  let raw: unknown = result;
  if (raw && typeof raw === "object" && "value" in raw)
    raw = (raw as { value: unknown }).value;
  if (typeof raw !== "string") return "00".repeat(32);
  const s = strip(raw);
  return /^[0-9a-f]{64}$/.test(s) ? s : "00".repeat(32);
}

/** Storage word as a JS number quantity (saturates at MAX_SAFE_INTEGER). */
export function storageWordQty(result: unknown): number {
  const n = BigInt("0x" + storageWordHex(result));
  return n > BigInt(Number.MAX_SAFE_INTEGER)
    ? Number.MAX_SAFE_INTEGER
    : Number(n);
}
