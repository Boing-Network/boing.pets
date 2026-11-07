import { mkdtempSync, writeFileSync } from "node:fs";
import { request, type IncomingHttpHeaders } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { databaseMode, openSqlite, toPg } from "../server/db";
import { startServer } from "../server/index";

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
});

function raw(
  port: number,
  method: string,
  path: string,
  headers: Record<string, string>,
  body?: string,
) {
  return new Promise<{
    status: number;
    body: string;
    headers: IncomingHttpHeaders;
  }>((resolve, reject) => {
    const req = request(
      { hostname: "127.0.0.1", port, path, method, headers },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () =>
          resolve({
            status: res.statusCode || 0,
            body: Buffer.concat(chunks).toString("utf8"),
            headers: res.headers,
          }),
        );
      },
    );
    req.on("error", reject);
    if (body) req.end(body);
    else req.end();
  });
}

describe("Cursor Apps hosting", () => {
  it("selects Postgres from the injected URL and keeps sqlite opt-in", () => {
    expect(databaseMode({})).toBe("missing");
    expect(databaseMode({ PETS_DB: "sqlite" })).toBe("sqlite");
    expect(
      databaseMode({
        DATABASE_URL: "postgres://db.example/pets",
        PETS_DB: "sqlite",
      }),
    ).toBe("postgres");
    expect(databaseMode({ POSTGRES_URL: "postgres://db.example/pets" })).toBe(
      "postgres",
    );
    expect(toPg("SELECT * FROM pets WHERE owner=? AND day=?")).toBe(
      "SELECT * FROM pets WHERE owner=$1 AND day=$2",
    );
    expect(toPg("SELECT '?'")).toBe("SELECT '?'");
  });

  it("serves the client and same-origin API, and refuses another origin", async () => {
    const directory = mkdtempSync(join(tmpdir(), "pets-"));
    writeFileSync(join(directory, "index.html"), "<title>Boing Pets</title>");
    const { db } = await openSqlite();
    const server = await startServer({
      port: 0,
      host: "127.0.0.1",
      database: db,
      staticRoot: directory,
    });
    close = server.close;
    const page = await raw(server.port, "GET", "/", {});
    expect(page.status).toBe(200);
    expect(page.body).toContain("Boing Pets");
    expect(page.headers["content-security-policy"]).toContain(
      "frame-ancestors",
    );
    expect(page.headers["x-frame-options"]).toBeUndefined();
    const pasture = await raw(server.port, "GET", "/api/pasture", {});
    expect(pasture.status).toBe(200);
    expect(JSON.parse(pasture.body)).toMatchObject({ pets: [], next: null });
    const blocked = await raw(
      server.port,
      "POST",
      "/api/challenge",
      { origin: "https://evil.example", "content-type": "application/json" },
      JSON.stringify({ owner: "0x" + "11".repeat(32), action: "hatch" }),
    );
    expect(blocked.status).toBe(403);
    const published = await raw(
      server.port,
      "POST",
      "/api/challenge",
      {
        host: "pets.cursor.app",
        "x-forwarded-host": "pets.cursor.app",
        "x-forwarded-proto": "https",
        origin: "https://pets.cursor.app",
        "content-type": "application/json",
      },
      JSON.stringify({ owner: "0x" + "11".repeat(32), action: "hatch" }),
    );
    expect(published.status).toBe(200);
    const secret = await raw(server.port, "GET", "/../package.json", {});
    expect(secret.status).not.toBe(200);
    expect(secret.body).not.toContain("boing-pets");
  });
});
