import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { URL as NodeURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as ed from "@noble/ed25519";
import { blake3 } from "@noble/hashes/blake3";
import { bytesToHex } from "@noble/hashes/utils";
import app from "../worker/index";

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

let db: DatabaseSync;
let env: Parameters<typeof app.fetch>[1];
const origin = "http://localhost:5177";
const fixtureKey = new Uint8Array(32).fill(7);
let owner = "";

async function request(
  path: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {},
) {
  const headers: Record<string, string> = { ...extraHeaders };
  if (body !== undefined) {
    headers.origin = origin;
    headers["content-type"] = "application/json";
  }
  return app.fetch(
    new Request(
      origin + path,
      body === undefined
        ? Object.keys(headers).length
          ? { headers }
          : undefined
        : {
            method: "POST",
            headers,
            body: JSON.stringify(body),
          },
    ),
    env,
  );
}

async function signConfirm(message: string, key: Uint8Array = fixtureKey) {
  return (
    "0x" +
    bytesToHex(
      await ed.signAsync(blake3(new TextEncoder().encode(message)), key),
    )
  );
}

async function sessionToken(key: Uint8Array = fixtureKey) {
  const ow = "0x" + bytesToHex(await ed.getPublicKeyAsync(key));
  const ch = await request("/api/social/session/challenge", { owner: ow });
  const c = (await ch.json()) as { id: string; message: string };
  const conf = await request("/api/social/session/confirm", {
    id: c.id,
    signature: await signConfirm(c.message, key),
  });
  expect(conf.status).toBe(200);
  return ((await conf.json()) as { token: string }).token;
}

beforeEach(async () => {
  vi.useRealTimers();
  owner = "0x" + bytesToHex(await ed.getPublicKeyAsync(fixtureKey));
  db = new DatabaseSync(":memory:");
  const dir = new NodeURL("../migrations/", import.meta.url);
  const files = readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const file of files) {
    db.exec(readFileSync(new NodeURL(file, dir), "utf8"));
  }
  const adapter = {
    prepare: (sql: string) => new Statement(db, sql),
    batch: async (statements: Statement[]) => {
      db.exec("BEGIN");
      try {
        const results = [];
        for (const s of statements) results.push(await s.run());
        db.exec("COMMIT");
        return results;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  };
  env = {
    DB: adapter as unknown as D1Database,
    ASSETS: { fetch: async () => new Response("assets") } as unknown as Fetcher,
    RPC_URL: "https://rpc.example",
    APP_ORIGIN: origin,
    MARKET_WRITES: "on",
    PLAZA: {
      getByName: () => ({
        fetch: async () => new Response("plaza stub"),
      }),
    } as unknown as Env["PLAZA"],
  };
});

afterEach(() => {
  vi.useRealTimers();
  db.close();
});

describe("idle adventures API", () => {
  it("lists rates without a session", async () => {
    const res = await request("/api/adventures/rates");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      rates: { pityCap: number; pityGrants: string; noPityFor: string[] };
    };
    expect(body.rates.pityCap).toBe(40);
    expect(body.rates.pityGrants).toBe("legendary");
    expect(body.rates.noPityFor).toEqual(["mythic", "iconic"]);
  });

  it("ignores a client-supplied clock and only completes on the server timer", async () => {
    const token = await sessionToken();
    const auth = { Authorization: `Bearer ${token}` };
    const start = await request(
      "/api/adventures/start",
      {
        owner,
        location_id: "the-drop",
        duration_id: "flash",
        now: Date.now() + 86_400_000,
      },
      auth,
    );
    expect(start.status).toBe(200);
    const started = (await start.json()) as {
      run: { id: string; status: string; endsAt: number };
    };
    expect(started.run.status).toBe("running");
    expect(started.run.endsAt).toBeGreaterThan(Date.now() + 10 * 60_000);

    const early = await request(
      "/api/adventures/claim",
      {
        owner,
        run_id: started.run.id,
        now: Date.now() + 86_400_000,
      },
      auth,
    );
    expect(early.status).toBe(425);

    const listed = await request(
      `/api/adventures?owner=${owner}`,
      undefined,
      auth,
    );
    const listing = (await listed.json()) as {
      runs: { id: string; status: string }[];
    };
    expect(listing.runs[0]?.status).toBe("running");
  });

  it("lazily completes, claims once, and stays idempotent", async () => {
    const token = await sessionToken();
    const auth = { Authorization: `Bearer ${token}` };
    const start = await request(
      "/api/adventures/start",
      { owner, location_id: "the-canal", duration_id: "flash" },
      auth,
    );
    expect(start.status).toBe(200);
    const started = (await start.json()) as { run: { id: string } };
    db.prepare("UPDATE adventure_runs SET ends_at=? WHERE id=?").run(
      Date.now() - 1,
      started.run.id,
    );

    const first = await request(
      "/api/adventures/claim",
      { owner, run_id: started.run.id, claim_id: "claim-repeat" },
      auth,
    );
    expect(first.status).toBe(200);
    const claimed = (await first.json()) as {
      run: {
        status: string;
        outcome: string;
        rewards: { qty: number; kind: string; currency?: string }[];
      };
      idempotent: boolean;
    };
    expect(claimed.idempotent).toBe(false);
    expect(claimed.run.status).toBe("claimed");
    expect(["fail", "partial", "success", "bonus"]).toContain(
      claimed.run.outcome,
    );
    expect(claimed.run.rewards.length).toBeGreaterThan(0);

    const ledger = db
      .prepare(
        "SELECT COALESCE(SUM(delta),0) AS n FROM ledger WHERE owner=? AND reason='adventure-claim'",
      )
      .get(owner) as { n: number };
    const inv = db
      .prepare("SELECT COALESCE(SUM(qty),0) AS n FROM inventory WHERE owner=?")
      .get(owner) as { n: number };

    const second = await request(
      "/api/adventures/claim",
      { owner, run_id: started.run.id, claim_id: "claim-repeat" },
      auth,
    );
    expect(second.status).toBe(200);
    const again = (await second.json()) as {
      idempotent: boolean;
      run: { status: string };
    };
    expect(again.idempotent).toBe(true);
    expect(again.run.status).toBe("claimed");

    const ledgerAfter = db
      .prepare(
        "SELECT COALESCE(SUM(delta),0) AS n FROM ledger WHERE owner=? AND reason='adventure-claim'",
      )
      .get(owner) as { n: number };
    const invAfter = db
      .prepare("SELECT COALESCE(SUM(qty),0) AS n FROM inventory WHERE owner=?")
      .get(owner) as { n: number };
    expect(ledgerAfter.n).toBe(ledger.n);
    expect(invAfter.n).toBe(inv.n);
  });

  it("claims every ready run through claim-all", async () => {
    const token = await sessionToken();
    const auth = { Authorization: `Bearer ${token}` };
    db.prepare(
      "INSERT INTO adventure_milestones(owner,completed_count,slots,updated_at) VALUES(?,?,?,?)",
    ).run(owner, 5, 2, Date.now());
    const first = await request(
      "/api/adventures/start",
      { owner, location_id: "skate-park", duration_id: "flash" },
      auth,
    );
    const second = await request(
      "/api/adventures/start",
      { owner, location_id: "night-market", duration_id: "flash" },
      auth,
    );
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const a = (await first.json()) as { run: { id: string } };
    const b = (await second.json()) as { run: { id: string } };
    const past = Date.now() - 1;
    db.prepare("UPDATE adventure_runs SET ends_at=? WHERE id IN (?,?)").run(
      past,
      a.run.id,
      b.run.id,
    );
    const res = await request("/api/adventures/claim-all", { owner }, auth);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { count: number };
    expect(body.count).toBe(2);
  });
});
