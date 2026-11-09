/** D1-backed per-IP soft rate limits (no Cloudflare dashboard binding required). */

class RateLimitError extends Error {
  status = 429;
  constructor(message: string) {
    super(message);
  }
}

function clientIp(req: Request): string {
  const cf = req.headers.get("CF-Connecting-IP");
  if (cf) return cf.trim().slice(0, 64);
  const xff = req.headers.get("X-Forwarded-For");
  if (xff) return xff.split(",")[0]!.trim().slice(0, 64);
  return "local";
}

function classify(pathname: string): { name: string; limit: number } {
  if (pathname === "/api/pasture") return { name: "pasture", limit: 30 };
  if (pathname.startsWith("/api/")) return { name: "api", limit: 120 };
  return { name: "other", limit: 180 };
}

export async function enforceIpRateLimit(
  req: Request,
  env: Env,
  pathname: string,
  now: number,
): Promise<void> {
  const { name, limit } = classify(pathname);
  const windowStart = Math.floor(now / 60_000) * 60_000;
  const ip = clientIp(req);
  const bucketKey = `${ip}:${name}:${windowStart}`;
  try {
    await env.DB.prepare(
      "DELETE FROM rate_limit_buckets WHERE window_start < ?",
    )
      .bind(windowStart - 5 * 60_000)
      .run();
  } catch {
    /* table may be missing until migration 0017 */
  }
  try {
    await env.DB.prepare(
      `INSERT INTO rate_limit_buckets(bucket_key, window_start, count) VALUES(?,?,1)
       ON CONFLICT(bucket_key) DO UPDATE SET count = count + 1`,
    )
      .bind(bucketKey, windowStart)
      .run();
    const row = await env.DB.prepare(
      "SELECT count FROM rate_limit_buckets WHERE bucket_key=?",
    )
      .bind(bucketKey)
      .first<{ count: number }>();
    if ((row?.count || 0) > limit) {
      throw new RateLimitError(
        name === "pasture"
          ? "Pasture is busy. Slow down and try again in a minute."
          : "Too many requests from this network. Try again shortly.",
      );
    }
  } catch (e) {
    if (e instanceof RateLimitError) throw e;
  }
}

export function rateLimitError(error: unknown): Response | null {
  if (error instanceof RateLimitError)
    return Response.json(
      { error: error.message },
      {
        status: 429,
        headers: {
          "Retry-After": "60",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  return null;
}
