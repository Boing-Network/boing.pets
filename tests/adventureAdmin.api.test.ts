import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { URL as NodeURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as ed from "@noble/ed25519";
import { blake3 } from "@noble/hashes/blake3";
import { bytesToHex } from "@noble/hashes/utils";
import app from "../worker/index";
import { clearAdventureAdminCaches } from "../worker/adventureAdmin";
import {
  ADVENTURE_ICONIC_CEILING_WEIGHT,
  ADVENTURE_RARITY_WEIGHTS,
} from "../src/content/adventures";
import { buildAdventureAdminMessage } from "../src/content/adventureAdmin";

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
const adminKey = new Uint8Array(32).fill(3);
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

async function signMessage(message: string, key: Uint8Array = adminKey) {
  return (
    "0x" +
    bytesToHex(
      await ed.signAsync(blake3(new TextEncoder().encode(message)), key),
    )
  );
}

async function adminBody(
  action:
    | "state"
    | "analytics"
    | "popup-create"
    | "popup-update"
    | "popup-end"
    | "override-rarity"
    | "override-luck",
  extra: Record<string, unknown> = {},
  issuedAt = Date.now(),
  key: Uint8Array = adminKey,
) {
  const message = buildAdventureAdminMessage({
    origin,
    issuedAt,
    action,
  });
  return {
    action,
    issued_at: issuedAt,
    message,
    signature: await signMessage(message, key),
    ...extra,
  };
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
    GATHER_QUARRY: "off",
    GATHER_LINE: "off",
    GATHER_PLOT: "off",
    GATHER_SWEEP: "off",
    GATHER_MINT: "off",
    MULTI_TOKEN_ADMIN_SECRET_KEY: bytesToHex(adminKey),
    PLAZA: {
      getByName: () => ({
        fetch: async () => new Response("plaza stub"),
      }),
    } as unknown as Env["PLAZA"],
  };
  clearAdventureAdminCaches();
});

afterEach(() => {
  clearAdventureAdminCaches();
  db.close();
});

describe("adventure admin API", () => {
  it("rejects missing, expired, and non-operator signatures", async () => {
    const unsigned = await request("/api/admin/adventures", {
      action: "analytics",
      issued_at: Date.now(),
    });
    expect(unsigned.status).toBe(400);

    const expired = await request(
      "/api/admin/adventures",
      await adminBody("analytics", {}, Date.now() - 11 * 60_000),
    );
    expect(expired.status).toBe(400);

    const otherKey = new Uint8Array(32).fill(9);
    const forged = await request(
      "/api/admin/adventures",
      await adminBody("analytics", {}, Date.now(), otherKey),
    );
    expect(forged.status).toBe(403);

    const noKey = await request(
      "/api/admin/adventures",
      await adminBody("analytics"),
    );
    // same env has a key; drop it
    delete (env as { MULTI_TOKEN_ADMIN_SECRET_KEY?: string })
      .MULTI_TOKEN_ADMIN_SECRET_KEY;
    clearAdventureAdminCaches();
    const missing = await request(
      "/api/admin/adventures",
      await adminBody("analytics"),
    );
    expect(missing.status).toBe(503);
    expect(noKey.status).toBe(200);
  });

  it("rejects Iconic ceiling and pity-grant violations on the wire", async () => {
    const iconic = await request(
      "/api/admin/adventures/overrides/rarity",
      await adminBody("override-rarity", {
        weights: { iconic: ADVENTURE_ICONIC_CEILING_WEIGHT + 50 },
      }),
    );
    expect(iconic.status).toBe(400);
    expect(await iconic.json()).toMatchObject({
      error: expect.stringMatching(
        /Iconic cannot be set above the hard ceiling/,
      ),
    });

    const pity = await request(
      "/api/admin/adventures",
      await adminBody("override-rarity", { pityGrants: "mythic" }),
    );
    expect(pity.status).toBe(400);
    expect(await pity.json()).toMatchObject({
      error: expect.stringMatching(/Pity can never include Mythic or Iconic/),
    });
  });

  it("stores a rarity override with versioning and falls back to code defaults when it is invalid", async () => {
    const ok = await request(
      "/api/admin/adventures",
      await adminBody("override-rarity", {
        weights: { rare: 100000, iconic: ADVENTURE_ICONIC_CEILING_WEIGHT },
        note: "tighten rare",
      }),
    );
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as {
      version: number;
      applied: { rare: number; common: number; iconic: number };
    };
    expect(body.version).toBe(1);
    expect(body.applied.rare).toBe(100000);
    expect(body.applied.common).toBe(ADVENTURE_RARITY_WEIGHTS.common);
    expect(body.applied.iconic).toBe(ADVENTURE_ICONIC_CEILING_WEIGHT);

    const v2 = await request(
      "/api/admin/adventures",
      await adminBody("override-rarity", { weights: { epic: 40000 } }),
    );
    expect(((await v2.json()) as { version: number }).version).toBe(2);

    const rates = await request("/api/adventures/rates");
    const published = (await rates.json()) as {
      rates: {
        rarities: { id: string; weight: number }[];
        overrideVersion: number | null;
      };
    };
    expect(
      published.rates.rarities.find((row) => row.id === "epic")?.weight,
    ).toBe(40000);
    expect(published.rates.overrideVersion).toBe(2);

    // Corrupt the latest payload: public rates must fall back to defaults.
    db.prepare(
      "UPDATE adventure_overrides SET payload_json=? WHERE kind=? AND version=?",
    ).run("{not-json", "rarity_table", 2);
    clearAdventureAdminCaches();
    const fallback = await request("/api/adventures/rates");
    const recovered = (await fallback.json()) as {
      rates: {
        rarities: { id: string; weight: number }[];
        overrideVersion: number | null;
      };
    };
    expect(
      recovered.rates.rarities.find((row) => row.id === "common")?.weight,
    ).toBe(ADVENTURE_RARITY_WEIGHTS.common);
  });

  it("creates, updates, and ends a Worldwide Pop-Up event", async () => {
    const created = await request(
      "/api/admin/adventures",
      await adminBody("popup-create", {
        event: {
          id: "worldwide-popup-test",
          name: "Block Party",
          startsAt: Date.now() - 1_000,
          endsAt: Date.now() + 86_400_000,
          pool: [{ itemId: "popup-guest-pass", rarity: "rare" }],
        },
      }),
    );
    expect(created.status).toBe(200);
    const started = (await created.json()) as {
      event: { status: string; name: string };
    };
    expect(started.event.status).toBe("live");
    expect(started.event.name).toBe("Block Party");

    const ended = await request(
      "/api/admin/adventures",
      await adminBody("popup-end", { id: "worldwide-popup-test" }),
    );
    expect(ended.status).toBe(200);
    expect(
      ((await ended.json()) as { event: { status: string } }).event.status,
    ).toBe("ended");
  });

  it("counts distinct inventory owners with qty>0 and aggregates analytics on read", async () => {
    const other = "0x" + "11".repeat(32);
    db.prepare(
      "INSERT INTO inventory(owner,item_id,qty) VALUES(?,?,?),(?,?,?),(?,?,?)",
    ).run(
      owner,
      "hat-beanie",
      2,
      other,
      "hat-beanie",
      1,
      owner,
      "jacket-studio",
      0,
    );
    const { ownerCountMap } = await import("../worker/adventureAdmin");
    const counted = await ownerCountMap(env, ["hat-beanie", "jacket-studio"]);
    expect(counted["hat-beanie"]).toBe(2);
    expect(counted["jacket-studio"]).toBe(0);

    const now = Date.now();
    db.prepare(
      `INSERT INTO adventure_events(
         id,at,day_key,owner,type,location_id,duration_id,outcome,rarity,mint_status,run_id,payload_json
       ) VALUES
       ('e1',?,?,'${owner}','start','night-market','quick',NULL,NULL,NULL,'r1',NULL),
       ('e2',?,?,'${owner}','complete','night-market','quick','success',NULL,NULL,'r1',NULL),
       ('e3',?,?,'${owner}','claim','night-market','quick','success','rare',NULL,'r1',NULL),
       ('e4',?,?,'${other}','start','rooftop-sessions','quick',NULL,NULL,NULL,'r2',NULL),
       ('e5',?,?,'${other}','mint','rooftop-sessions','quick',NULL,'legendary','confirmed','r2',NULL)`,
    ).run(
      now,
      "2026-11-14",
      now,
      "2026-11-14",
      now,
      "2026-11-14",
      now,
      "2026-11-14",
      now,
      "2026-11-14",
    );

    const analytics = await request(
      "/api/admin/adventures/analytics",
      await adminBody("analytics"),
    );
    expect(analytics.status).toBe(200);
    const body = (await analytics.json()) as {
      analytics: {
        totals: {
          starts: number;
          completions: number;
          claims: number;
          dau: number;
          avgTripsPerPlayer: number;
          outcomes: { success: number };
          rarities: { rare: number };
          mintOutcomes: { confirmed: number };
        };
        byLocation: { locationId: string; starts: number }[];
        byDuration: { durationId: string; starts: number }[];
      };
    };
    expect(body.analytics.totals.starts).toBe(2);
    expect(body.analytics.totals.completions).toBe(1);
    expect(body.analytics.totals.claims).toBe(1);
    expect(body.analytics.totals.dau).toBe(2);
    expect(body.analytics.totals.avgTripsPerPlayer).toBe(1);
    expect(body.analytics.totals.outcomes.success).toBe(1);
    expect(body.analytics.totals.rarities.rare).toBe(1);
    expect(body.analytics.totals.mintOutcomes.confirmed).toBe(1);
    expect(
      body.analytics.byLocation.find((row) => row.locationId === "night-market")
        ?.starts,
    ).toBe(1);
    expect(
      body.analytics.byDuration.find((row) => row.durationId === "quick")
        ?.starts,
    ).toBe(2);
  });
});
