/**
 * Shared-world server configuration from flags and environment.
 *
 * Local runs stay safe by default: bind 127.0.0.1, generate an owner key,
 * keep the token secret in the data dir, accept only localhost origins.
 * Production (`NODE_ENV=production`, e.g. on Fly.io) fails fast unless the
 * owner key, the session secret and DATABASE_URL all come from the
 * environment, because a generated key would be lost on the next deploy and
 * the machine's disk is not durable.
 */
import {
  MP_DEFAULT_PORT,
  TIME_SCALES,
  type TimeScale,
} from "@boing-pets/contract";

export type ServerFlags = {
  host?: string;
  port?: string;
  data?: string;
  seed?: string;
  scale?: string;
};

export type ServerConfig = {
  production: boolean;
  hostname: string;
  port: number;
  dataDir: string;
  seed: number;
  scale: TimeScale;
  /** From the environment; null means "generate one and print it" (local only). */
  ownerKey: string | null;
  /** From the environment; null means "load or create <data>/session-secret". */
  sessionSecret: string | null;
  databaseUrl: string | null;
  allowedOrigins: string[];
};

/** Origins every local run accepts: the Vite dev server and previews. */
export const LOCAL_ORIGINS = [
  "http://localhost",
  "http://localhost:*",
  "http://127.0.0.1",
  "http://127.0.0.1:*",
];

/** Minimum lengths for production secrets (characters). */
export const MIN_OWNER_KEY_LENGTH = 24;
export const MIN_SESSION_SECRET_LENGTH = 32;

export class ServerConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServerConfigError";
  }
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed == null || trimmed === "" ? undefined : trimmed;
}

export function parseAllowedOrigins(raw: string | undefined): string[] {
  if (raw == null) return [];
  return raw
    .split(",")
    .map((entry) => entry.trim().replace(/\/+$/, ""))
    .filter((entry) => entry !== "");
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Compile origin patterns. `*` matches one run of letters, digits and dashes
 * (never a dot or slash), so `https://boing-pets-*-nico-builds.vercel.app`
 * covers that team's preview URLs but not `evil.com/…` or other subdomains,
 * and `http://localhost:*` covers any port.
 */
export function compileOriginMatcher(
  patterns: readonly string[],
): (origin: string | undefined) => boolean {
  const regexes = patterns.map(
    (pattern) =>
      new RegExp(
        `^${escapeRegex(pattern.toLowerCase()).replace(/\\\*/g, "[a-z0-9-]+")}$`,
      ),
  );
  return (origin) => {
    // Non-browser clients send no Origin. The check exists to stop other
    // websites from driving a visitor's browser; tokens and rate limits
    // still apply to everyone.
    if (origin == null || origin === "") return true;
    const normalized = origin.toLowerCase().replace(/\/+$/, "");
    return regexes.some((regex) => regex.test(normalized));
  };
}

export function resolveServerConfig(
  flags: ServerFlags,
  env: Record<string, string | undefined>,
): ServerConfig {
  const production = env.NODE_ENV === "production";
  const hostname =
    nonEmpty(flags.host) ?? nonEmpty(env.LIVING_PETS_MP_HOST) ?? "127.0.0.1";
  const port = Number(
    nonEmpty(flags.port) ??
      nonEmpty(env.LIVING_PETS_MP_PORT) ??
      nonEmpty(env.PORT) ??
      MP_DEFAULT_PORT,
  );
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new ServerConfigError(`invalid port ${String(port)}`);
  }
  const seed = Number(
    nonEmpty(flags.seed) ?? nonEmpty(env.LIVING_PETS_MP_SEED) ?? 1,
  );
  if (!Number.isSafeInteger(seed) || seed <= 0) {
    throw new ServerConfigError("invalid seed");
  }
  const scale = Number(
    nonEmpty(flags.scale) ?? nonEmpty(env.LIVING_PETS_MP_SCALE) ?? 64,
  );
  if (!(TIME_SCALES as readonly number[]).includes(scale)) {
    throw new ServerConfigError(
      `scale must be one of ${TIME_SCALES.join(", ")}`,
    );
  }
  const dataDir =
    nonEmpty(flags.data) ??
    nonEmpty(env.LIVING_PETS_MP_DATA) ??
    ".living-pets-mp";
  const ownerKey = nonEmpty(env.LIVING_PETS_MP_OWNER_KEY) ?? null;
  const sessionSecret = nonEmpty(env.LIVING_PETS_MP_SECRET) ?? null;
  const databaseUrl = nonEmpty(env.DATABASE_URL) ?? null;
  const extraOrigins = parseAllowedOrigins(env.LIVING_PETS_MP_ALLOWED_ORIGINS);
  const allowedOrigins = production
    ? extraOrigins
    : [...LOCAL_ORIGINS, ...extraOrigins];

  if (production) {
    const missing: string[] = [];
    if (ownerKey == null || ownerKey.length < MIN_OWNER_KEY_LENGTH) {
      missing.push(
        `LIVING_PETS_MP_OWNER_KEY (at least ${MIN_OWNER_KEY_LENGTH} characters)`,
      );
    }
    if (
      sessionSecret == null ||
      sessionSecret.length < MIN_SESSION_SECRET_LENGTH
    ) {
      missing.push(
        `LIVING_PETS_MP_SECRET (at least ${MIN_SESSION_SECRET_LENGTH} characters)`,
      );
    }
    if (databaseUrl == null) missing.push("DATABASE_URL");
    if (allowedOrigins.length === 0)
      missing.push("LIVING_PETS_MP_ALLOWED_ORIGINS");
    if (missing.length > 0) {
      throw new ServerConfigError(
        `production config incomplete; set: ${missing.join(", ")}`,
      );
    }
  }

  return {
    production,
    hostname,
    port,
    dataDir,
    seed,
    scale: scale as TimeScale,
    ownerKey,
    sessionSecret,
    databaseUrl,
    allowedOrigins,
  };
}
