import app from "../worker/index";
import { openPostgres, postgresConnectionString, type PetsDb } from "./db";
import { originFrom } from "./origin";

let ready: Promise<{ db: PetsDb }> | undefined;

function pasture() {
  const url = postgresConnectionString();
  if (!url) throw new Error("DATABASE_URL is not set");
  ready ??= openPostgres(url).catch((error: unknown) => {
    ready = undefined;
    throw error;
  });
  return ready;
}

async function handle(request: Request) {
  try {
    const { db } = await pasture();
    const url = new URL(request.url);
    return await app.fetch(request, {
      DB: db as unknown as D1Database,
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      } as unknown as Fetcher,
      RPC_URL: process.env.RPC_URL || "https://testnet-rpc.boing.network",
      APP_ORIGIN: originFrom(request.headers, url),
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Pets API failed");
    return Response.json(
      { error: "Pasture unavailable. Try again in a moment." },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}

export const GET = handle;
export const POST = handle;
export default { fetch: handle };
