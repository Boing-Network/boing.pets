import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import app from "../worker/index";
import { openDatabase, type PetsDb } from "./db";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

export function securityHeaders() {
  const file = join(root, "public", "_headers");
  const headers: Record<string, string> = {};
  if (!existsSync(file)) return headers;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (
      !trimmed ||
      trimmed.startsWith("#") ||
      trimmed.startsWith("/") ||
      trimmed === "/*"
    )
      continue;
    const index = trimmed.indexOf(":");
    if (index <= 0) continue;
    headers[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim();
  }
  return headers;
}

function publicOrigin(req: IncomingMessage) {
  if (process.env.APP_ORIGIN) return process.env.APP_ORIGIN;
  const forwardedHost = first(req.headers["x-forwarded-host"]);
  const host = forwardedHost || req.headers.host || "localhost";
  const forwarded = first(req.headers["x-forwarded-proto"]);
  const local = /^localhost(?::|$)|127\.0\.0\.1(?::|$)|\[::1\](?::|$)/.test(
    host,
  );
  const proto = forwarded || (local ? "http" : "https");
  return `${proto}://${host}`;
}

function first(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.split(",")[0]?.trim() || "";
}

function staticPath(directory: string, pathname: string) {
  let decoded = pathname;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;
  const base = normalize(directory + sep);
  const resolved = normalize(join(directory, decoded.replace(/^\/+/, "")));
  if (resolved !== base.slice(0, -1) && !resolved.startsWith(base)) return null;
  return resolved;
}

function send(
  res: ServerResponse,
  status: number,
  body: Buffer | string,
  headers: Record<string, string>,
) {
  res.writeHead(status, headers);
  res.end(body);
}

async function readBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 64 * 1024) {
      req.destroy();
      return null;
    }
    if (size > 4096) continue;
    chunks.push(buffer);
  }
  return size > 4096 ? null : Buffer.concat(chunks);
}

export async function startServer(
  options: {
    port?: number;
    host?: string;
    database?: PetsDb;
    staticRoot?: string;
    env?: Record<string, string | undefined>;
  } = {},
) {
  const opened = options.database ? null : await openDatabase(options.env);
  const database = options.database ?? opened?.db;
  if (!database) throw new Error("Database did not open");
  const staticRoot = options.staticRoot ?? join(root, "dist", "client");
  const shared = securityHeaders();
  const server = createServer(async (req, res) => {
    try {
      const origin = publicOrigin(req);
      const url = new URL(req.url || "/", origin);
      if (!url.pathname.startsWith("/api/")) {
        serveStatic(req, res, staticRoot, url.pathname, shared);
        return;
      }
      const body =
        req.method === "GET" || req.method === "HEAD"
          ? undefined
          : await readBody(req);
      if (body === null) {
        send(res, 413, JSON.stringify({ error: "Request too large" }), {
          "content-type": "application/json; charset=utf-8",
          ...shared,
          "cache-control": "no-store",
        });
        return;
      }
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (value === undefined) continue;
        if (Array.isArray(value))
          for (const item of value) headers.append(key, item);
        else headers.set(key, value);
      }
      const response = await app.fetch(
        new Request(url, {
          method: req.method,
          headers,
          body: body?.length ? body : undefined,
        }),
        {
          DB: database as unknown as D1Database,
          ASSETS: {
            fetch: async () => new Response("Not found", { status: 404 }),
          } as unknown as Fetcher,
          RPC_URL: process.env.RPC_URL || "https://testnet-rpc.boing.network",
          APP_ORIGIN: origin,
        },
      );
      const bytes = Buffer.from(await response.arrayBuffer());
      const out: Record<string, string> = { ...shared };
      response.headers.forEach((value, key) => {
        out[key] = value;
      });
      send(res, response.status, bytes, out);
    } catch (error) {
      console.error(error instanceof Error ? error.message : "Request failed");
      send(
        res,
        500,
        JSON.stringify({ error: "Request could not be processed" }),
        {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
        },
      );
    }
  });
  await new Promise<void>((resolve) => {
    server.listen(
      options.port ?? Number(process.env.PORT || 3000),
      options.host ?? "0.0.0.0",
      () => resolve(),
    );
  });
  const address = server.address();
  const port =
    typeof address === "object" && address
      ? address.port
      : Number(process.env.PORT || 3000);
  return {
    port,
    close: async () => {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      await opened?.close();
    },
  };
}

function serveStatic(
  req: IncomingMessage,
  res: ServerResponse,
  directory: string,
  pathname: string,
  shared: Record<string, string>,
) {
  const index = join(directory, "index.html");
  const target = pathname === "/" ? index : staticPath(directory, pathname);
  const file =
    target && existsSync(target) && statSync(target).isFile() ? target : null;
  const leaf = pathname.split("/").pop() || "";
  const fallback =
    !file &&
    (req.method === "GET" || req.method === "HEAD") &&
    !leaf.includes(".")
      ? index
      : file;
  if (!fallback || !existsSync(fallback)) {
    send(res, 404, "Not found", {
      "content-type": "text/plain; charset=utf-8",
      ...shared,
    });
    return;
  }
  const extension = fallback.slice(fallback.lastIndexOf("."));
  send(res, 200, req.method === "HEAD" ? "" : readFileSync(fallback), {
    ...shared,
    "content-type": types[extension] || "application/octet-stream",
    "cache-control": pathname.startsWith("/assets/")
      ? "public, max-age=31536000, immutable"
      : "no-cache",
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  startServer()
    .then(({ port }) => {
      const mode =
        process.env.DATABASE_URL ||
        process.env.POSTGRES_URL ||
        process.env.POSTGRES_PRISMA_URL
          ? "postgres"
          : "sqlite";
      console.log(`Boing Pets listening on ${port} (${mode})`);
    })
    .catch((error: unknown) => {
      console.error(
        error instanceof Error ? error.message : "Boing Pets failed to start",
      );
      process.exit(1);
    });
}
