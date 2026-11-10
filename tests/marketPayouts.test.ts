import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { readFileSync } from "node:fs";
import { URL as NodeURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as ed from "@noble/ed25519";
import { bytesToHex } from "@noble/hashes/utils";
import { parseBoing } from "@boing-network/boing-sdk";
import {
  listingFeeBaseUnits,
  MARKET_SINK_ADDRESS,
  marketPayoutId,
  payoutSplit,
  sellerProceedsBaseUnits,
} from "../src/market";
import {
  processMarketPayoutsWithSigner,
  type MarketPayoutRow,
} from "../worker/marketPayouts";

class Statement {
  values: SQLInputValue[] = [];
  constructor(
    public db: DatabaseSync,
    public sql: string,
  ) {}
  bind(...values: SQLInputValue[]) {
    this.values = values;
    return this;
  }
  async first() {
    return this.db.prepare(this.sql).get(...this.values) ?? null;
  }
  async all() {
    return { results: this.db.prepare(this.sql).all(...this.values) };
  }
  async run() {
    const result = this.db.prepare(this.sql).run(...this.values);
    return {
      success: true,
      meta: { changes: result.changes },
      changes: result.changes,
    };
  }
}

const seller = "0x" + "11".repeat(32);
const paymentTx = "0x" + "ab".repeat(32);
const listingId = "listing-1";
const now = Date.UTC(2026, 10, 10, 16);
const fixtureKey = new Uint8Array(32).fill(23);

type RpcAccount = { balance: string; nonce: number };
type Harness = {
  db: DatabaseSync;
  env: Env;
  signer: { secret: Uint8Array; admin: string };
  account: RpcAccount;
  receipts: Map<string, { success: boolean } | null>;
  submissions: string[];
};

async function setup(): Promise<Harness> {
  const db = new DatabaseSync(":memory:");
  for (const file of [
    "../migrations/0004_economy.sql",
    "../migrations/0025_market_boing_and_drops.sql",
    "../migrations/0026_market_payouts_auto.sql",
  ]) {
    db.exec(readFileSync(new NodeURL(file, import.meta.url), "utf8"));
  }
  const admin = "0x" + bytesToHex(await ed.getPublicKeyAsync(fixtureKey));
  const account: RpcAccount = {
    balance: parseBoing("20").toString(),
    nonce: 7,
  };
  const receipts = new Map<string, { success: boolean } | null>();
  const submissions: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: { body?: string }) => {
      const body = JSON.parse(String(init?.body || "{}")) as {
        method?: string;
        params?: unknown[];
      };
      if (body.method === "boing_getAccount") {
        return Response.json({ result: { ...account } });
      }
      if (body.method === "boing_submitTransaction") {
        const signed = String(body.params?.[0] || "");
        submissions.push(signed);
        account.nonce += 1;
        return Response.json({ result: { tx_hash: "ok" } });
      }
      if (body.method === "boing_getTransactionReceipt") {
        const hash = String(body.params?.[0] || "");
        const receipt = receipts.has(hash) ? receipts.get(hash) : null;
        return Response.json({ result: receipt ?? null });
      }
      return Response.json({ error: { message: "unknown method" } });
    }),
  );
  const adapter = {
    prepare: (sql: string) => new Statement(db, sql),
    batch: async (statements: Statement[]) => {
      db.exec("BEGIN");
      try {
        for (const s of statements) await s.run();
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  };
  const env = {
    DB: adapter,
    RPC_URL: "https://testnet-rpc.boing.network",
  } as unknown as Env;
  return {
    db,
    env,
    signer: { secret: fixtureKey, admin },
    account,
    receipts,
    submissions,
  };
}

function insertLeg(
  db: DatabaseSync,
  kind: "seller" | "sink",
  recipient: string,
  amount: string,
  status = "pending",
  extra: { payout_tx?: string; signed_tx?: string; attempts?: number } = {},
) {
  db.prepare(
    `INSERT INTO market_payouts(
       id,payment_tx,listing_id,kind,recipient,amount_boing,status,payout_tx,signed_tx,attempts,last_error,created_at,updated_at
     ) VALUES(?,?,?,?,?,?,?,?,?,?,NULL,?,?)`,
  ).run(
    marketPayoutId(paymentTx, kind),
    paymentTx,
    listingId,
    kind,
    recipient,
    amount,
    status,
    extra.payout_tx ?? null,
    extra.signed_tx ?? null,
    extra.attempts ?? 0,
    now - 60_000,
    now - 60_000,
  );
}

function row(db: DatabaseSync, kind: "seller" | "sink"): MarketPayoutRow {
  return db
    .prepare("SELECT * FROM market_payouts WHERE id=?")
    .get(marketPayoutId(paymentTx, kind)) as MarketPayoutRow;
}

describe("market payout split", () => {
  it("keeps exact base-unit conservation and gives remainder to the seller", () => {
    const price = parseBoing("1");
    expect(listingFeeBaseUnits(price)).toBe(price / 20n);
    expect(sellerProceedsBaseUnits(price) + listingFeeBaseUnits(price)).toBe(
      price,
    );
    const odd = 3n;
    const split = payoutSplit(odd);
    expect(split.fee + split.seller).toBe(odd);
    expect(split.seller).toBe(3n);
    expect(split.fee).toBe(0n);
    const price20 = 20n;
    expect(payoutSplit(price20)).toEqual({ fee: 1n, seller: 19n });
  });
});

describe("automatic native payouts", () => {
  let h: Harness;
  beforeEach(async () => {
    h = await setup();
  });
  afterEach(() => {
    h.db.close();
    vi.unstubAllGlobals();
  });

  it("sends the seller and sink legs and does not double-pay on retry", async () => {
    const price = parseBoing("1");
    const split = payoutSplit(price);
    insertLeg(h.db, "seller", seller, split.seller.toString());
    insertLeg(h.db, "sink", MARKET_SINK_ADDRESS, split.fee.toString());
    const first = await processMarketPayoutsWithSigner(h.env, h.signer, {
      now,
      paymentTx,
      force: true,
    });
    expect(first.map((r) => r.status)).toEqual(["sent", "sent"]);
    expect(h.submissions).toHaveLength(2);
    const sellerRow = row(h.db, "seller");
    const sinkRow = row(h.db, "sink");
    expect(sellerRow.payout_tx).toMatch(/^0x[0-9a-f]{64}$/);
    expect(sinkRow.payout_tx).toMatch(/^0x[0-9a-f]{64}$/);
    expect(sellerRow.payout_tx).not.toBe(sinkRow.payout_tx);

    const before = h.submissions.length;
    await processMarketPayoutsWithSigner(h.env, h.signer, {
      now: now + 1,
      paymentTx,
      force: true,
    });
    // Still in flight (no receipt): may resubmit the same signed txs, but hashes stay put.
    expect(row(h.db, "seller").payout_tx).toBe(sellerRow.payout_tx);
    expect(row(h.db, "sink").payout_tx).toBe(sinkRow.payout_tx);
    expect(h.submissions.length).toBeGreaterThanOrEqual(before);

    h.receipts.set(sellerRow.payout_tx!, { success: true });
    h.receipts.set(sinkRow.payout_tx!, { success: true });
    const confirmed = await processMarketPayoutsWithSigner(h.env, h.signer, {
      now: now + 2,
      paymentTx,
      force: true,
    });
    expect(confirmed.every((r) => r.status === "confirmed")).toBe(true);
    const after = h.submissions.length;
    await processMarketPayoutsWithSigner(h.env, h.signer, {
      now: now + 3,
      paymentTx,
      force: true,
    });
    expect(h.submissions.length).toBe(after);
    expect(row(h.db, "seller").status).toBe("confirmed");
  });

  it("leaves a payout pending and records an alert when the operator is short", async () => {
    h.account.balance = "1";
    insertLeg(h.db, "seller", seller, parseBoing("1").toString());
    const result = await processMarketPayoutsWithSigner(h.env, h.signer, {
      now,
      paymentTx,
      force: true,
    });
    expect(result[0]?.status).toBe("pending");
    expect(result[0]?.last_error).toBe("insufficient-balance");
    expect(h.submissions).toHaveLength(0);
    expect(row(h.db, "seller").payout_tx).toBeNull();
    const alert = h.db
      .prepare(
        "SELECT code, message FROM market_payout_alerts WHERE payout_id=?",
      )
      .get(marketPayoutId(paymentTx, "seller")) as {
      code: string;
      message: string;
    };
    expect(alert.code).toBe("insufficient-balance");
    expect(alert.message).toMatch(/below the seller payout/i);
  });

  it("retries a failed payout by signing only after the previous slot is dead", async () => {
    const amount = parseBoing("0.2").toString();
    insertLeg(h.db, "seller", seller, amount);
    await processMarketPayoutsWithSigner(h.env, h.signer, {
      now,
      paymentTx,
      force: true,
    });
    const firstHash = row(h.db, "seller").payout_tx!;
    h.receipts.set(firstHash, { success: false });
    await processMarketPayoutsWithSigner(h.env, h.signer, {
      now: now + 1,
      paymentTx,
      force: true,
    });
    expect(row(h.db, "seller").status).toBe("failed");

    const failed = await processMarketPayoutsWithSigner(h.env, h.signer, {
      now: now + 2,
      paymentTx,
      force: true,
    });
    expect(failed[0]?.status).toBe("sent");
    expect(row(h.db, "seller").payout_tx).not.toBe(firstHash);
    expect(row(h.db, "seller").attempts).toBeGreaterThanOrEqual(2);
  });

  it("treats a balance equal to the payout but short the network fee as pending", async () => {
    const amount = parseBoing("1");
    h.account.balance = amount.toString();
    insertLeg(h.db, "seller", seller, amount.toString());
    const result = await processMarketPayoutsWithSigner(h.env, h.signer, {
      now,
      paymentTx,
      force: true,
    });
    expect(result[0]?.status).toBe("pending");
    expect(result[0]?.last_error).toBe("insufficient-balance");
    expect(h.submissions).toHaveLength(0);
    expect(row(h.db, "seller").payout_tx).toBeNull();
  });

  it("does not double-pay when two processors run at once", async () => {
    insertLeg(h.db, "seller", seller, parseBoing("0.5").toString());
    const [a, b] = await Promise.all([
      processMarketPayoutsWithSigner(h.env, h.signer, {
        now,
        paymentTx,
        force: true,
      }),
      processMarketPayoutsWithSigner(h.env, h.signer, {
        now,
        paymentTx,
        force: true,
      }),
    ]);
    const hashes = [row(h.db, "seller").payout_tx];
    expect(hashes[0]).toMatch(/^0x[0-9a-f]{64}$/);
    const unique = new Set(
      [...a, ...b]
        .filter((r) => r.kind === "seller" && r.payout_tx)
        .map((r) => r.payout_tx),
    );
    expect(unique.size).toBe(1);
    expect(row(h.db, "seller").status).toBe("sent");
  });
});
