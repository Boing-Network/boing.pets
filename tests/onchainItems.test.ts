import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { URL as NodeURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as ed from "@noble/ed25519";
import { blake3 } from "@noble/hashes/blake3";
import { bytesToHex } from "@noble/hashes/utils";
import app from "../worker/index";
import {
  REF_MT_TOPIC_TRANSFER_HEX,
  multiTokenAmountWord,
  multiTokenItemIdWord,
} from "@boing-network/boing-sdk";
import { CATALOG } from "../src/economy";
import { RECIPES } from "../src/content/cooking";
import { FISH } from "../src/content/fishing";
import { CROPS } from "../src/content/gardening";
import { PICKAXES } from "../src/content/mining";
import {
  MT_ADMIN_STORAGE_KEY,
  ONCHAIN_ITEMS,
  ONCHAIN_RESERVED_ITEM_IDS,
  mtBalanceStorageKey,
  mtMintCalldata,
  mtTransferCalldata,
  onchainItemByGameId,
  onchainItemByItemId,
  storageWordQty,
} from "../src/content/onchainItems";
import { RIBBONS } from "../src/content/racing";
import { TREASURES } from "../src/content/treasure";

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
    return this.db.prepare(this.sql).run(...this.values);
  }
}

const origin = "http://localhost:5177";
const playerKey = new Uint8Array(32).fill(7);
const adminKey = new Uint8Array(32).fill(3);
const CONTRACT = "0x" + "07".repeat(32);
let db: DatabaseSync;
let env: Parameters<typeof app.fetch>[1];
let owner = "";
let admin = "";
let rpcState: {
  adminWord: string;
  nonce: number;
  simulate: { success: boolean; error?: string };
  submitError: { code: number; message: string } | null;
  receipt: Record<string, unknown> | null;
  receiptsByHash: Record<string, Record<string, unknown> | null> | null;
  block: Record<string, unknown> | null;
  balance: number;
  operatorBalance: number;
  calls: string[];
};

function withdrawalLegs(id?: string) {
  const sql = id
    ? "SELECT signed_tx, tx_hash, admin_nonce, qty, status, error FROM onchain_withdrawals WHERE id=?"
    : "SELECT signed_tx, tx_hash, admin_nonce, qty, status, error FROM onchain_withdrawals";
  const row = (id ? db.prepare(sql).get(id) : db.prepare(sql).get()) as {
    signed_tx: string;
    tx_hash: string;
    admin_nonce: number;
    qty: number;
    status: string;
    error: string | null;
  };
  const parsed = JSON.parse(row.signed_tx) as {
    v: number;
    legs: Array<{
      kind: string;
      qty: number;
      nonce: number;
      signed: string;
      hash: string;
    }>;
  };
  return { row, legs: parsed.legs };
}

async function post(path: string, body: unknown) {
  return app.fetch(
    new Request(origin + path, {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    env,
  );
}
const get = (path: string) => app.fetch(new Request(origin + path), env);

async function sign(message: string) {
  return (
    "0x" +
    bytesToHex(
      await ed.signAsync(blake3(new TextEncoder().encode(message)), playerKey),
    )
  );
}

function inventoryQty(item: string) {
  const row = db
    .prepare("SELECT qty FROM inventory WHERE owner=? AND item_id=?")
    .get(owner, item) as { qty: number } | undefined;
  return row?.qty ?? 0;
}

async function withdraw(qty: number, item = "ore-spark") {
  const ch = await post("/api/items/withdraw/challenge", {
    owner,
    game_item_id: item,
    qty,
  });
  expect(ch.status).toBe(200);
  const c = (await ch.json()) as { id: string; message: string };
  expect(c.message).toContain(`Quantity: ${qty}`);
  return post("/api/items/withdraw/confirm", {
    id: c.id,
    signature: await sign(c.message),
  });
}

beforeEach(async () => {
  owner = "0x" + bytesToHex(await ed.getPublicKeyAsync(playerKey));
  admin = "0x" + bytesToHex(await ed.getPublicKeyAsync(adminKey));
  db = new DatabaseSync(":memory:");
  const dir = new NodeURL("../migrations/", import.meta.url);
  for (const f of readdirSync(dir)
    .filter((n) => /^00(0\d|1\d|2[0-4])_.*\.sql$/.test(n))
    .sort())
    db.exec(readFileSync(new NodeURL(f, dir), "utf8"));
  db.prepare("INSERT INTO inventory(owner,item_id,qty) VALUES(?,?,?)").run(
    owner,
    "ore-spark",
    5,
  );
  rpcState = {
    adminWord: admin,
    nonce: 7,
    simulate: { success: true },
    submitError: null,
    receipt: null,
    receiptsByHash: null,
    block: null,
    balance: 0,
    operatorBalance: 0,
    calls: [],
  };
  env = {
    DB: {
      prepare: (sql: string) => new Statement(db, sql),
      batch: async (statements: Statement[]) => {
        db.exec("BEGIN");
        try {
          for (const s of statements) await s.run();
          db.exec("COMMIT");
        } catch (e) {
          db.exec("ROLLBACK");
          throw e;
        }
      },
    },
    APP_ORIGIN: origin,
    RPC_URL: "https://testnet-rpc.boing.network",
    MULTI_TOKEN_CONTRACT: CONTRACT,
    MULTI_TOKEN_ADMIN_SECRET_KEY: bytesToHex(adminKey),
    ASSETS: { fetch: async () => new Response("ok") },
    PLAZA: { getByName: () => ({ fetch: async () => new Response("ok") }) },
  } as unknown as Parameters<typeof app.fetch>[1];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: unknown, init: RequestInit) => {
      const { method, params } = JSON.parse(String(init?.body || "{}")) as {
        method: string;
        params: unknown[];
      };
      rpcState.calls.push(method);
      const ok = (result: unknown) =>
        Response.json({ jsonrpc: "2.0", id: 1, result });
      if (method === "boing_getContractStorage") {
        const key = String(params[1]);
        if (key === MT_ADMIN_STORAGE_KEY)
          return ok({ value: rpcState.adminWord });
        const operatorKeys = new Set(
          ONCHAIN_ITEMS.map((item) => mtBalanceStorageKey(admin, item.itemId)),
        );
        if (operatorKeys.has(key))
          return ok({
            value:
              "0x" + rpcState.operatorBalance.toString(16).padStart(64, "0"),
          });
        return ok({
          value: "0x" + rpcState.balance.toString(16).padStart(64, "0"),
        });
      }
      if (method === "boing_getAccount")
        return ok({ nonce: rpcState.nonce, balance: "0" });
      if (method === "boing_simulateTransaction") return ok(rpcState.simulate);
      if (method === "boing_submitTransaction") {
        if (rpcState.submitError)
          return Response.json({
            jsonrpc: "2.0",
            id: 1,
            error: rpcState.submitError,
          });
        return ok({ tx_hash: "ok" });
      }
      if (method === "boing_getTransactionReceipt") {
        const hash = String(params[0] || "").toLowerCase();
        if (rpcState.receiptsByHash && hash in rpcState.receiptsByHash)
          return ok(rpcState.receiptsByHash[hash]);
        return ok(rpcState.receipt);
      }
      if (method === "boing_getBlockByHeight") return ok(rpcState.block);
      return ok(null);
    }),
  );
});

afterEach(() => {
  db.close();
  vi.unstubAllGlobals();
});

describe("on-chain item encoders", () => {
  it("encodes mint calldata and balance keys like the reference contract", () => {
    const cd = mtMintCalldata("0x" + "ab".repeat(32), 2, 40);
    expect(cd.length).toBe(128);
    expect(cd[31]).toBe(0x22);
    expect(cd[32]).toBe(0xab);
    expect(cd[95]).toBe(2);
    expect(cd[127]).toBe(40);
    // zero account, item 0 -> the XOR tag itself
    const tag = Array.from("BOING_REFMT_BAL_V1", (ch) =>
      ch.charCodeAt(0).toString(16).padStart(2, "0"),
    ).join("");
    expect(mtBalanceStorageKey("0x" + "00".repeat(32), 0)).toBe(
      "0x" + tag.padEnd(64, "0"),
    );
    expect(storageWordQty({ value: "0x" + "00".repeat(31) + "3c" })).toBe(60);
  });
});

describe("on-chain item withdrawals", () => {
  it("is disabled without operator config", async () => {
    (env as unknown as Record<string, unknown>).MULTI_TOKEN_ADMIN_SECRET_KEY =
      undefined;
    const res = await get("/api/items/onchain?owner=" + owner);
    expect(((await res.json()) as { enabled: boolean }).enabled).toBe(false);
    const ch = await post("/api/items/withdraw/challenge", {
      owner,
      game_item_id: "ore-spark",
      qty: 1,
    });
    expect(ch.status).toBe(503);
    expect(rpcState.calls).toEqual([]);
  });

  it("debits inventory, mints, and settles as minted", async () => {
    const res = await withdraw(3);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      withdrawal: { status: string; tx_hash: string };
    };
    expect(body.withdrawal.status).toBe("submitted");
    expect(body.withdrawal.tx_hash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(inventoryQty("ore-spark")).toBe(2);
    const row = db
      .prepare("SELECT admin_nonce, status FROM onchain_withdrawals")
      .get() as {
      admin_nonce: number;
      status: string;
    };
    expect(row).toEqual({ admin_nonce: 7, status: "submitted" });
    expect(rpcState.calls).toContain("boing_simulateTransaction");

    rpcState.receipt = { success: true };
    rpcState.balance = 3;
    const status = (await (
      await get("/api/items/onchain?owner=" + owner)
    ).json()) as {
      items: Array<{
        gameItemId: string;
        offchain_qty: number;
        onchain_qty: number;
      }>;
      withdrawals: Array<{ status: string }>;
    };
    expect(status.withdrawals[0]!.status).toBe("minted");
    const spark = status.items.find((i) => i.gameItemId === "ore-spark")!;
    expect(spark).toMatchObject({ offchain_qty: 2, onchain_qty: 3 });
  });

  it("queues a second mint on the next operator nonce", async () => {
    expect((await withdraw(1)).status).toBe(200);
    expect((await withdraw(1)).status).toBe(200);
    const nonces = db
      .prepare(
        "SELECT admin_nonce FROM onchain_withdrawals ORDER BY admin_nonce",
      )
      .all();
    expect(nonces).toEqual([{ admin_nonce: 7 }, { admin_nonce: 8 }]);
    expect(inventoryQty("ore-spark")).toBe(3);
  });

  it("refuses to overdraw and leaves inventory untouched", async () => {
    const ch = await post("/api/items/withdraw/challenge", {
      owner,
      game_item_id: "ore-spark",
      qty: 6,
    });
    expect(ch.status).toBe(409);
    const ok = await post("/api/items/withdraw/challenge", {
      owner,
      game_item_id: "ore-spark",
      qty: 5,
    });
    const c = (await ok.json()) as { id: string; message: string };
    db.prepare("UPDATE inventory SET qty=1 WHERE owner=?").run(owner);
    const res = await post("/api/items/withdraw/confirm", {
      id: c.id,
      signature: await sign(c.message),
    });
    expect(res.status).toBe(409);
    expect(inventoryQty("ore-spark")).toBe(1);
    expect(
      db.prepare("SELECT COUNT(*) AS n FROM onchain_withdrawals").get(),
    ).toEqual({ n: 0 });
    expect(rpcState.calls).not.toContain("boing_submitTransaction");
  });

  it("refunds when the network rejects the mint", async () => {
    rpcState.submitError = {
      code: -32000,
      message: "Insufficient balance for fee",
    };
    const res = await withdraw(2);
    expect(res.status).toBe(502);
    expect(inventoryQty("ore-spark")).toBe(5);
    expect(db.prepare("SELECT status FROM onchain_withdrawals").get()).toEqual({
      status: "refunded",
    });
  });

  it("refunds exactly once when the mint is dropped", async () => {
    expect((await withdraw(2)).status).toBe(200);
    rpcState.nonce = 8; // operator nonce moved on, no receipt
    await get("/api/items/onchain?owner=" + owner);
    await get("/api/items/onchain?owner=" + owner);
    expect(inventoryQty("ore-spark")).toBe(5);
    expect(db.prepare("SELECT status FROM onchain_withdrawals").get()).toEqual({
      status: "refunded",
    });
  });

  it("pauses when the operator key is not the contract admin", async () => {
    rpcState.adminWord = "0x" + "99".repeat(32);
    const res = await withdraw(1);
    expect(res.status).toBe(503);
    expect(inventoryQty("ore-spark")).toBe(5);
  });

  it("rejects a forged signature", async () => {
    const ch = await post("/api/items/withdraw/challenge", {
      owner,
      game_item_id: "ore-spark",
      qty: 1,
    });
    const c = (await ch.json()) as { id: string };
    const res = await post("/api/items/withdraw/confirm", {
      id: c.id,
      signature: "0x" + "11".repeat(64),
    });
    expect(res.status).toBe(403);
    expect(inventoryQty("ore-spark")).toBe(5);
  });

  it("transfers from the operator when it already holds enough", async () => {
    rpcState.operatorBalance = 5;
    const res = await withdraw(3);
    expect(res.status).toBe(200);
    const { row, legs } = withdrawalLegs();
    expect(legs).toHaveLength(1);
    expect(legs[0]).toMatchObject({ kind: "transfer", qty: 3, nonce: 7 });
    expect(row).toMatchObject({ admin_nonce: 7, status: "submitted", qty: 3 });
    expect(inventoryQty("ore-spark")).toBe(2);
    expect(
      rpcState.calls.filter((m) => m === "boing_submitTransaction"),
    ).toHaveLength(1);
    expect(rpcState.calls).toContain("boing_simulateTransaction");

    rpcState.receipt = { success: true };
    rpcState.balance = 3;
    const status = (await (
      await get("/api/items/onchain?owner=" + owner)
    ).json()) as { withdrawals: Array<{ status: string }> };
    expect(status.withdrawals[0]!.status).toBe("minted");
    expect(inventoryQty("ore-spark")).toBe(2);
  });

  it("splits a transfer of the operator balance and a mint of the remainder", async () => {
    rpcState.operatorBalance = 2;
    const res = await withdraw(5);
    expect(res.status).toBe(200);
    const { row, legs } = withdrawalLegs();
    expect(
      legs.map((leg) => ({ kind: leg.kind, qty: leg.qty, nonce: leg.nonce })),
    ).toEqual([
      { kind: "transfer", qty: 2, nonce: 7 },
      { kind: "mint", qty: 3, nonce: 8 },
    ]);
    expect(row).toMatchObject({ admin_nonce: 8, status: "submitted", qty: 5 });
    expect(inventoryQty("ore-spark")).toBe(0);
    expect(
      rpcState.calls.filter((m) => m === "boing_submitTransaction"),
    ).toHaveLength(2);

    rpcState.receiptsByHash = {
      [legs[0]!.hash]: { success: true },
      [legs[1]!.hash]: { success: true },
    };
    rpcState.balance = 5;
    const status = (await (
      await get("/api/items/onchain?owner=" + owner)
    ).json()) as {
      withdrawals: Array<{ status: string; tx_hashes?: string[] }>;
    };
    expect(status.withdrawals[0]!.status).toBe("minted");
    expect(status.withdrawals[0]!.tx_hashes).toEqual([
      legs[0]!.hash,
      legs[1]!.hash,
    ]);
    expect(inventoryQty("ore-spark")).toBe(0);
  });

  it("refunds only the undelivered mint when a split transfer already landed", async () => {
    rpcState.operatorBalance = 2;
    expect((await withdraw(5)).status).toBe(200);
    const { legs } = withdrawalLegs();
    rpcState.receiptsByHash = {
      [legs[0]!.hash]: { success: true },
      [legs[1]!.hash]: { success: false, error: "mint failed" },
    };
    await get("/api/items/onchain?owner=" + owner);
    await get("/api/items/onchain?owner=" + owner);
    expect(inventoryQty("ore-spark")).toBe(3);
    const row = db
      .prepare("SELECT status, error FROM onchain_withdrawals")
      .get() as { status: string; error: string };
    expect(row.status).toBe("minted");
    expect(row.error).toMatch(/mint of 3/);
  });

  it("refunds the full amount once when a transfer-only withdrawal is dropped", async () => {
    rpcState.operatorBalance = 5;
    expect((await withdraw(3)).status).toBe(200);
    expect(inventoryQty("ore-spark")).toBe(2);
    rpcState.nonce = 8;
    await get("/api/items/onchain?owner=" + owner);
    await get("/api/items/onchain?owner=" + owner);
    expect(inventoryQty("ore-spark")).toBe(5);
    expect(db.prepare("SELECT status FROM onchain_withdrawals").get()).toEqual({
      status: "refunded",
    });
  });
});

const DEPOSIT_TX = "0x" + "ab".repeat(32);

function transferLog(from: string, to: string, itemId: number, amount: number) {
  return {
    topics: [REF_MT_TOPIC_TRANSFER_HEX, from, to],
    data:
      "0x" +
      multiTokenItemIdWord(itemId).slice(2) +
      multiTokenAmountWord(amount).slice(2),
  };
}

function mockIncludedTransfer(
  from: string,
  to: string,
  itemId = 2,
  amount = 2,
) {
  rpcState.receipt = {
    success: true,
    tx_id: DEPOSIT_TX,
    block_height: 10,
    tx_index: 0,
    logs: [transferLog(from, to, itemId, amount)],
  };
  rpcState.block = {
    header: { height: 10 },
    transactions: [
      {
        sender: from,
        payload: { ContractCall: { contract: CONTRACT } },
      },
    ],
  };
}

describe("on-chain item deposits", () => {
  it("encodes transfer calldata for a deposit to the operator", () => {
    const cd = mtTransferCalldata("0x" + "cd".repeat(32), 2, 2);
    expect(cd.length).toBe(128);
    expect(cd[31]).toBe(0x21);
    expect(cd[32]).toBe(0xcd);
    expect(cd[95]).toBe(2);
    expect(cd[127]).toBe(2);
  });

  it("is disabled without operator config", async () => {
    (env as unknown as Record<string, unknown>).MULTI_TOKEN_ADMIN_SECRET_KEY =
      undefined;
    const res = await post("/api/items/deposit/prepare", {
      owner,
      game_item_id: "ore-spark",
      qty: 1,
    });
    expect(res.status).toBe(503);
  });

  it("prepares an Express contract_call to the operator", async () => {
    const res = await post("/api/items/deposit/prepare", {
      owner,
      game_item_id: "ore-spark",
      qty: 2,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      operator: string;
      contract: string;
      transaction: { type: string; contract: string; calldata: string };
    };
    expect(body.operator).toBe(admin);
    expect(body.contract).toBe(CONTRACT);
    expect(body.transaction.type).toBe("contract_call");
    expect(body.transaction.contract).toBe(CONTRACT);
    expect(body.transaction.calldata.startsWith("0x")).toBe(true);
    const expected = mtTransferCalldata(admin, 2, 2);
    expect(body.transaction.calldata).toBe(
      "0x" +
        Array.from(expected)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join(""),
    );
  });

  it("credits inventory once from a verified transfer and rejects a replay", async () => {
    expect(inventoryQty("ore-spark")).toBe(5);
    mockIncludedTransfer(owner, admin, 2, 2);
    const first = await post("/api/items/deposit/confirm", {
      owner,
      tx_hash: DEPOSIT_TX,
    });
    expect(first.status).toBe(200);
    const body = (await first.json()) as {
      deposit: { qty: number; tx_hash: string; status: string };
    };
    expect(body.deposit).toMatchObject({
      qty: 2,
      tx_hash: DEPOSIT_TX,
      status: "credited",
    });
    expect(inventoryQty("ore-spark")).toBe(7);

    const replay = await post("/api/items/deposit/confirm", {
      owner,
      tx_hash: DEPOSIT_TX,
    });
    expect(replay.status).toBe(409);
    expect(inventoryQty("ore-spark")).toBe(7);
    expect(
      db.prepare("SELECT COUNT(*) AS n FROM onchain_deposits").get(),
    ).toEqual({ n: 1 });

    const status = (await (
      await get("/api/items/onchain?owner=" + owner)
    ).json()) as {
      items: Array<{ gameItemId: string; offchain_qty: number }>;
      deposits: Array<{ tx_hash: string; qty: number }>;
    };
    expect(status.deposits[0]).toMatchObject({ tx_hash: DEPOSIT_TX, qty: 2 });
    expect(
      status.items.find((i) => i.gameItemId === "ore-spark")?.offchain_qty,
    ).toBe(7);
  });

  it("rejects a mint log, a transfer to the wrong account, and a pending receipt", async () => {
    mockIncludedTransfer("0x" + "00".repeat(32), owner, 2, 2);
    // mint: from zero to owner (qualifyingDepositTransfer skips isMint)
    const mint = await post("/api/items/deposit/confirm", {
      owner,
      tx_hash: DEPOSIT_TX,
    });
    expect(mint.status).toBe(400);
    expect(inventoryQty("ore-spark")).toBe(5);

    mockIncludedTransfer(owner, "0x" + "99".repeat(32), 2, 2);
    const wrongTo = await post("/api/items/deposit/confirm", {
      owner,
      tx_hash: "0x" + "11".repeat(32),
    });
    expect(wrongTo.status).toBe(400);

    rpcState.receipt = null;
    const pending = await post("/api/items/deposit/confirm", {
      owner,
      tx_hash: "0x" + "22".repeat(32),
    });
    expect(pending.status).toBe(425);
    expect(inventoryQty("ore-spark")).toBe(5);
  });
});

describe("on-chain item id table", () => {
  it("keeps ores at 1-3 and maps every approved stackable item once", () => {
    expect(onchainItemByGameId("ore-pebble")?.itemId).toBe(1);
    expect(onchainItemByGameId("ore-spark")?.itemId).toBe(2);
    expect(onchainItemByGameId("ore-crystal")?.itemId).toBe(3);
    const ids = ONCHAIN_ITEMS.map((i) => i.itemId);
    const games = ONCHAIN_ITEMS.map((i) => i.gameItemId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(games).size).toBe(games.length);
    const required = [
      ...FISH.map((i) => i.id),
      ...TREASURES.map((i) => i.id),
      ...CROPS.map((i) => i.id),
      ...RECIPES.map((i) => i.foodId),
      ...PICKAXES.filter((i) => i.id !== "tool-pick-wood").map((i) => i.id),
      ...CATALOG.map((i) => i.id),
    ];
    for (const id of required) {
      expect(onchainItemByGameId(id), id).toBeDefined();
    }
    expect(onchainItemByGameId("recipe-sprout-salad")).toBeUndefined();
    expect(onchainItemByGameId("species:boingle")).toBeUndefined();
    expect(onchainItemByGameId("tool-pick-wood")).toBeUndefined();
    for (const ribbon of RIBBONS) {
      expect(onchainItemByGameId(ribbon.id), ribbon.id).toBeUndefined();
    }
    for (const reserved of ONCHAIN_RESERVED_ITEM_IDS) {
      expect(ids).not.toContain(reserved.itemId);
      expect(onchainItemByGameId(reserved.gameItemId)).toBeUndefined();
      expect(onchainItemByItemId(reserved.itemId)).toBeUndefined();
    }
  });

  it("rejects wood pick and race ribbons as unmapped", async () => {
    for (const item of [
      "tool-pick-wood",
      "ribbon-gold",
      "ribbon-silver",
      "ribbon-bronze",
    ]) {
      db.prepare(
        "INSERT INTO inventory(owner,item_id,qty) VALUES(?,?,?) ON CONFLICT(owner,item_id) DO UPDATE SET qty=5",
      ).run(owner, item, 5);
      const res = await post("/api/items/withdraw/challenge", {
        owner,
        game_item_id: item,
        qty: 1,
      });
      expect(res.status, item).toBe(400);
      expect(await res.json()).toMatchObject({
        error: "This item cannot be withdrawn on-chain",
      });
    }
  });
});

describe("withdrawal guards", () => {
  it("refuses to withdraw an equipped cosmetic", async () => {
    db.prepare("INSERT INTO inventory(owner,item_id,qty) VALUES(?,?,?)").run(
      owner,
      "hat-ribbon",
      1,
    );
    db.prepare(
      "INSERT INTO pet_cosmetics(owner,slot,item_id,updated_at) VALUES(?,?,?,?)",
    ).run(owner, "hat", "hat-ribbon", 1);
    const res = await post("/api/items/withdraw/challenge", {
      owner,
      game_item_id: "hat-ribbon",
      qty: 1,
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      error: "Unequip this cosmetic before withdrawing it",
    });
  });

  it("refuses to withdraw furniture sitting on a home plot", async () => {
    db.prepare("INSERT INTO inventory(owner,item_id,qty) VALUES(?,?,?)").run(
      owner,
      "furn-cushion",
      1,
    );
    db.prepare(
      "INSERT INTO housing_placements(id,owner,item_id,x,y,created_at) VALUES(?,?,?,?,?,?)",
    ).run("place-1", owner, "furn-cushion", 0, 0, 1);
    const res = await post("/api/items/withdraw/challenge", {
      owner,
      game_item_id: "furn-cushion",
      qty: 1,
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      error: "Pick this item up from your home plot before withdrawing it",
    });
  });
});
