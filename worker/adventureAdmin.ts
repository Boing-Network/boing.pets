/** Operator-signed Idle Adventures admin: Pop-Ups, overrides, analytics. */
import * as ed from "@noble/ed25519";
import { blake3 } from "@noble/hashes/blake3";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import {
  AdventureAdminValidationError,
  ANALYTICS_CACHE_TTL_MS,
  OWNER_COUNT_TTL_MS,
  assertAdminMessage,
  buildAdventureAdminMessage,
  effectivePityGrants,
  isAdventureAdminAction,
  mergeRarityWeights,
  mergeStyleLuckCap,
  mergeStyleLuckPoints,
  popupStatusAt,
  utcDayKey,
  validatePopupEvent,
  validateRarityOverride,
  validateStyleLuckOverride,
  type AdventureAdminAction,
  type PopupEventPayload,
  type PopupPoolItem,
  type RarityOverridePayload,
  type StyleLuckOverridePayload,
} from "../src/content/adventureAdmin";
import { SEASON_EVENTS } from "../src/content/seasons";
import { itemRarity } from "../src/content/items";
import { isItemRarity, type ItemRarity } from "../src/content/rarities";
import { operatorSigner } from "./marketPayouts";
import { HttpError } from "./social";

export type PopupEventView = {
  id: string;
  name: string;
  description: string;
  startsAt: number;
  endsAt: number;
  status: "scheduled" | "live" | "ended";
  pool: PopupPoolItem[];
  source: "code" | "d1";
};

type OverrideRow = {
  id: string;
  kind: "rarity_table" | "style_luck";
  version: number;
  payload_json: string;
  created_at: number;
  created_by: string;
  note: string | null;
};

type PopupRow = {
  id: string;
  name: string;
  description: string;
  starts_at: number;
  ends_at: number;
  status: string;
  pool_json: string;
  created_at: number;
  updated_at: number;
};

export type AdventureOverrides = {
  rarity: RarityOverridePayload | null;
  rarityVersion: number | null;
  styleLuck: StyleLuckOverridePayload | null;
  styleLuckVersion: number | null;
};

type EventLogInput = {
  at: number;
  owner: string;
  type: "start" | "complete" | "claim" | "mint";
  locationId?: string | null;
  durationId?: string | null;
  outcome?: string | null;
  rarity?: string | null;
  mintStatus?: string | null;
  runId?: string | null;
  payload?: unknown;
};

const ownerCountCache = new Map<string, { at: number; count: number }>();
let analyticsCache: { at: number; key: string; body: unknown } | null = null;
let overrideCache: { at: number; value: AdventureOverrides } | null = null;

export function clearAdventureAdminCaches() {
  ownerCountCache.clear();
  analyticsCache = null;
  overrideCache = null;
}

export async function ownerCountMap(
  env: Env,
  itemIds: string[],
  now = Date.now(),
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  const unique = [...new Set(itemIds.filter(Boolean))];
  const missing: string[] = [];
  for (const id of unique) {
    const hit = ownerCountCache.get(id);
    if (hit && now - hit.at < OWNER_COUNT_TTL_MS) {
      counts[id] = hit.count;
    } else {
      missing.push(id);
    }
  }
  for (const id of missing) {
    const row = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM inventory WHERE item_id=? AND qty>0",
    )
      .bind(id)
      .first<{ n: number }>();
    const count = row?.n ?? 0;
    ownerCountCache.set(id, { at: now, count });
    counts[id] = count;
  }
  return counts;
}

export async function logAdventureEvent(
  env: Env,
  input: EventLogInput,
): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO adventure_events(
         id,at,day_key,owner,type,location_id,duration_id,outcome,rarity,
         mint_status,run_id,payload_json
       ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
      .bind(
        crypto.randomUUID(),
        input.at,
        utcDayKey(input.at),
        input.owner,
        input.type,
        input.locationId ?? null,
        input.durationId ?? null,
        input.outcome ?? null,
        input.rarity ?? null,
        input.mintStatus ?? null,
        input.runId ?? null,
        input.payload != null ? JSON.stringify(input.payload) : null,
      )
      .run();
    analyticsCache = null;
  } catch {
    // Analytics must never block a trip or claim.
  }
}

async function latestOverride(
  env: Env,
  kind: OverrideRow["kind"],
): Promise<OverrideRow | null> {
  return (
    (await env.DB.prepare(
      "SELECT * FROM adventure_overrides WHERE kind=? ORDER BY version DESC LIMIT 1",
    )
      .bind(kind)
      .first<OverrideRow>()) ?? null
  );
}

export async function loadAdventureOverrides(
  env: Env,
  now = Date.now(),
): Promise<AdventureOverrides> {
  if (overrideCache && now - overrideCache.at < OWNER_COUNT_TTL_MS) {
    return overrideCache.value;
  }
  const rarityRow = await latestOverride(env, "rarity_table");
  const luckRow = await latestOverride(env, "style_luck");
  let rarity: RarityOverridePayload | null = null;
  let styleLuck: StyleLuckOverridePayload | null = null;
  try {
    if (rarityRow)
      rarity = validateRarityOverride(JSON.parse(rarityRow.payload_json));
  } catch {
    rarity = null;
  }
  try {
    if (luckRow)
      styleLuck = validateStyleLuckOverride(JSON.parse(luckRow.payload_json));
  } catch {
    styleLuck = null;
  }
  const value = {
    rarity,
    rarityVersion: rarityRow?.version ?? null,
    styleLuck,
    styleLuckVersion: luckRow?.version ?? null,
  };
  overrideCache = { at: now, value };
  return value;
}

export function appliedRarityWeights(overrides: AdventureOverrides) {
  return mergeRarityWeights(overrides.rarity);
}

export function appliedPityGrants(overrides: AdventureOverrides) {
  return effectivePityGrants(overrides.rarity);
}

export function appliedStyleLuck(overrides: AdventureOverrides) {
  return {
    rarityPoints: mergeStyleLuckPoints(overrides.styleLuck),
    multiplierCap: mergeStyleLuckCap(overrides.styleLuck),
    setBonusPoints: overrides.styleLuck?.setBonusPoints ?? {},
  };
}

function defaultPopupEvents(): PopupEventView[] {
  return SEASON_EVENTS.map((event) => ({
    id: event.id,
    name: event.name,
    description: event.description,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    status: "scheduled" as const,
    pool: event.limitedCosmetics.map((itemId) => ({
      itemId,
      rarity: (isItemRarity(itemRarity(itemId))
        ? itemRarity(itemId)
        : "rare") as ItemRarity,
    })),
    source: "code" as const,
  }));
}

function parsePool(raw: string): PopupPoolItem[] {
  try {
    const parsed = JSON.parse(raw) as PopupPoolItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function resolvePopupEvents(
  env: Env,
  now: number,
): Promise<PopupEventView[]> {
  const merged = new Map<string, PopupEventView>();
  for (const event of defaultPopupEvents()) merged.set(event.id, event);
  try {
    const rows = await env.DB.prepare(
      "SELECT * FROM adventure_popup_events",
    ).all<PopupRow>();
    for (const row of rows.results ?? []) {
      merged.set(row.id, {
        id: row.id,
        name: row.name,
        description: row.description,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        status: row.status as PopupEventView["status"],
        pool: parsePool(row.pool_json),
        source: "d1",
      });
    }
  } catch {
    // Fallback to code defaults when 0029 is not applied yet.
  }
  return [...merged.values()].map((event) => ({
    ...event,
    status: popupStatusAt(event, now),
  }));
}

export async function livePopupEvents(env: Env, now: number) {
  return (await resolvePopupEvents(env, now)).filter(
    (event) => event.status === "live",
  );
}

async function verifyOperatorSignature(
  admin: string,
  message: string,
  signature: unknown,
) {
  if (typeof signature !== "string" || !/^(0x)?[0-9a-f]{128}$/i.test(signature))
    throw new HttpError(400, "Invalid signature format");
  const ok = await ed.verifyAsync(
    hexToBytes(signature.replace(/^0x/i, "")),
    blake3(new TextEncoder().encode(message)),
    hexToBytes(admin.slice(2)),
  );
  if (!ok)
    throw new HttpError(403, "Signature does not match the market operator");
}

function actionFrom(
  url: URL,
  body: Record<string, unknown>,
): AdventureAdminAction {
  if (isAdventureAdminAction(String(body.action ?? ""))) {
    return body.action as AdventureAdminAction;
  }
  const path = url.pathname.replace(/\/$/, "");
  if (path.endsWith("/analytics")) return "analytics";
  if (path.endsWith("/state")) return "state";
  if (path.endsWith("/popup/create")) return "popup-create";
  if (path.endsWith("/popup/update")) return "popup-update";
  if (path.endsWith("/popup/end")) return "popup-end";
  if (path.endsWith("/overrides/rarity") || path.endsWith("/override-rarity"))
    return "override-rarity";
  if (path.endsWith("/overrides/luck") || path.endsWith("/override-luck"))
    return "override-luck";
  throw new HttpError(404, "Unknown adventure admin action");
}

function isAdminPath(pathname: string) {
  return (
    pathname === "/api/admin/adventures" ||
    pathname.startsWith("/api/admin/adventures/")
  );
}

async function authorize(
  env: Env,
  body: Record<string, unknown>,
  action: AdventureAdminAction,
  now: number,
): Promise<string> {
  const signer = await operatorSigner(env);
  if (!signer)
    throw new HttpError(503, "Market operator signing is not configured");
  const issuedAt = Number(body.issued_at);
  const message =
    body.message != null
      ? String(body.message)
      : buildAdventureAdminMessage({
          origin: env.APP_ORIGIN,
          issuedAt,
          action,
        });
  try {
    assertAdminMessage({
      message,
      origin: env.APP_ORIGIN,
      issuedAt,
      action,
      now,
    });
  } catch (error) {
    if (error instanceof AdventureAdminValidationError)
      throw new HttpError(400, error.message);
    throw error;
  }
  await verifyOperatorSignature(signer.admin, message, body.signature);
  return signer.admin;
}

async function nextVersion(env: Env, kind: OverrideRow["kind"]) {
  const row = await latestOverride(env, kind);
  return (row?.version ?? 0) + 1;
}

async function writeOverride(
  env: Env,
  input: {
    kind: OverrideRow["kind"];
    payload: unknown;
    actor: string;
    note: string;
    now: number;
    action: string;
  },
) {
  const previous = await latestOverride(env, input.kind);
  const version = await nextVersion(env, input.kind);
  const id = crypto.randomUUID();
  const payload = JSON.stringify(input.payload);
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO adventure_overrides(
         id,kind,version,payload_json,created_at,created_by,note
       ) VALUES(?,?,?,?,?,?,?)`,
    ).bind(
      id,
      input.kind,
      version,
      payload,
      input.now,
      input.actor,
      input.note,
    ),
    env.DB.prepare(
      `INSERT INTO adventure_override_audit(
         id,override_id,version,action,kind,before_json,after_json,actor,created_at,note
       ) VALUES(?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      crypto.randomUUID(),
      id,
      version,
      input.action,
      input.kind,
      previous?.payload_json ?? null,
      payload,
      input.actor,
      input.now,
      input.note,
    ),
  ]);
  overrideCache = null;
  return { id, version, previousVersion: previous?.version ?? null };
}

async function writePopup(
  env: Env,
  event: PopupEventPayload & { id: string },
  actor: string,
  now: number,
  action: "popup-create" | "popup-update" | "popup-end",
  previous: PopupRow | null,
) {
  const status = event.status ?? "scheduled";
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO adventure_popup_events(
         id,name,description,starts_at,ends_at,status,pool_json,created_at,updated_at
       ) VALUES(?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
         name=excluded.name,
         description=excluded.description,
         starts_at=excluded.starts_at,
         ends_at=excluded.ends_at,
         status=excluded.status,
         pool_json=excluded.pool_json,
         updated_at=excluded.updated_at`,
    ).bind(
      event.id,
      event.name,
      event.description ?? "",
      event.startsAt,
      event.endsAt,
      status,
      JSON.stringify(event.pool ?? []),
      previous?.created_at ?? now,
      now,
    ),
    env.DB.prepare(
      `INSERT INTO adventure_override_audit(
         id,override_id,version,action,kind,before_json,after_json,actor,created_at,note
       ) VALUES(?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      crypto.randomUUID(),
      event.id,
      now,
      action,
      "popup_event",
      previous ? JSON.stringify(previous) : null,
      JSON.stringify(event),
      actor,
      now,
      event.name,
    ),
  ]);
}

type EventAggRow = {
  day_key: string;
  type: string;
  location_id: string | null;
  duration_id: string | null;
  outcome: string | null;
  rarity: string | null;
  mint_status: string | null;
  owner: string;
  n: number;
};

function emptyBucket() {
  return {
    starts: 0,
    completions: 0,
    claims: 0,
    mints: 0,
    outcomes: { success: 0, partial: 0, bonus: 0, fail: 0 },
    rarities: {} as Record<string, number>,
    mintOutcomes: { pending: 0, confirmed: 0, failed: 0 },
    owners: new Set<string>(),
  };
}

type Bucket = ReturnType<typeof emptyBucket>;

function addToBucket(bucket: Bucket, row: EventAggRow) {
  const n = row.n || 1;
  bucket.owners.add(row.owner);
  if (row.type === "start") bucket.starts += n;
  if (row.type === "complete") {
    bucket.completions += n;
    const key = row.outcome as keyof Bucket["outcomes"];
    if (key && key in bucket.outcomes) bucket.outcomes[key] += n;
  }
  if (row.type === "claim") {
    bucket.claims += n;
    if (row.rarity)
      bucket.rarities[row.rarity] = (bucket.rarities[row.rarity] ?? 0) + n;
  }
  if (row.type === "mint") {
    bucket.mints += n;
    if (row.mint_status === "pending") bucket.mintOutcomes.pending += n;
    else if (row.mint_status === "confirmed" || row.mint_status === "minted")
      bucket.mintOutcomes.confirmed += n;
    else if (row.mint_status === "failed") bucket.mintOutcomes.failed += n;
  }
}

function publicBucket(bucket: Bucket) {
  const players = bucket.owners.size;
  return {
    starts: bucket.starts,
    completions: bucket.completions,
    claims: bucket.claims,
    mints: bucket.mints,
    outcomes: bucket.outcomes,
    rarities: bucket.rarities,
    mintOutcomes: bucket.mintOutcomes,
    dau: players,
    avgTripsPerPlayer: players
      ? Math.round((bucket.starts / players) * 100) / 100
      : 0,
  };
}

async function buildAnalytics(env: Env, now: number) {
  const rows = await env.DB.prepare(
    `SELECT day_key,type,location_id,duration_id,outcome,rarity,mint_status,owner,COUNT(*) AS n
     FROM adventure_events
     GROUP BY day_key,type,location_id,duration_id,outcome,rarity,mint_status,owner`,
  ).all<EventAggRow>();
  const byDay = new Map<string, Bucket>();
  const byLocation = new Map<string, Bucket>();
  const byDuration = new Map<string, Bucket>();
  const totals = emptyBucket();
  for (const row of rows.results ?? []) {
    addToBucket(totals, row);
    const day = byDay.get(row.day_key) ?? emptyBucket();
    addToBucket(day, row);
    byDay.set(row.day_key, day);
    if (row.location_id) {
      const loc = byLocation.get(row.location_id) ?? emptyBucket();
      addToBucket(loc, row);
      byLocation.set(row.location_id, loc);
    }
    if (row.duration_id) {
      const dur = byDuration.get(row.duration_id) ?? emptyBucket();
      addToBucket(dur, row);
      byDuration.set(row.duration_id, dur);
    }
  }
  return {
    now,
    cached: false,
    totals: publicBucket(totals),
    byDay: [...byDay.entries()]
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .map(([day, bucket]) => ({ day, ...publicBucket(bucket) })),
    byLocation: [...byLocation.entries()].map(([locationId, bucket]) => ({
      locationId,
      ...publicBucket(bucket),
    })),
    byDuration: [...byDuration.entries()].map(([durationId, bucket]) => ({
      durationId,
      ...publicBucket(bucket),
    })),
  };
}

async function analytics(env: Env, now: number) {
  const key = utcDayKey(now);
  if (
    analyticsCache &&
    analyticsCache.key === key &&
    now - analyticsCache.at < ANALYTICS_CACHE_TTL_MS
  ) {
    return { ...(analyticsCache.body as object), cached: true, now };
  }
  const body = await buildAnalytics(env, now);
  analyticsCache = { at: now, key, body };
  return body;
}

async function handleAction(
  env: Env,
  action: AdventureAdminAction,
  body: Record<string, unknown>,
  actor: string,
  now: number,
): Promise<Response> {
  if (action === "analytics") {
    return Response.json({
      ok: true,
      action,
      analytics: await analytics(env, now),
    });
  }
  if (action === "state") {
    const overrides = await loadAdventureOverrides(env, now);
    const events = await resolvePopupEvents(env, now);
    const audit = await env.DB.prepare(
      "SELECT id,action,kind,version,actor,created_at,note FROM adventure_override_audit ORDER BY created_at DESC LIMIT 40",
    ).all();
    return Response.json({
      ok: true,
      action,
      events,
      liveEvents: events.filter((event) => event.status === "live"),
      overrides: {
        rarity: overrides.rarity,
        rarityVersion: overrides.rarityVersion,
        styleLuck: overrides.styleLuck,
        styleLuckVersion: overrides.styleLuckVersion,
        appliedWeights: appliedRarityWeights(overrides),
        appliedPityGrants: appliedPityGrants(overrides),
        appliedStyleLuck: appliedStyleLuck(overrides),
      },
      audit: audit.results ?? [],
      analytics: await analytics(env, now),
    });
  }

  const validate = <T>(fn: (value: unknown) => T, value: unknown): T => {
    try {
      return fn(value);
    } catch (error) {
      if (error instanceof AdventureAdminValidationError)
        throw new HttpError(400, error.message);
      throw error;
    }
  };

  if (action === "popup-create" || action === "popup-update") {
    const event = validate(validatePopupEvent, body.event ?? body);
    const id =
      event.id ||
      (action === "popup-update" ? String(body.id ?? "") : crypto.randomUUID());
    if (!id) throw new HttpError(400, "Pop-Up id is required");
    const previous =
      (await env.DB.prepare("SELECT * FROM adventure_popup_events WHERE id=?")
        .bind(id)
        .first<PopupRow>()) ?? null;
    if (action === "popup-update" && !previous && !event.id) {
      throw new HttpError(404, "Pop-Up event not found");
    }
    const next = {
      ...event,
      id,
      status:
        event.status ??
        (previous
          ? (previous.status as PopupEventPayload["status"])
          : "scheduled"),
    };
    await writePopup(env, next, actor, now, action, previous);
    return Response.json({
      ok: true,
      action,
      event: {
        ...next,
        source: "d1",
        status: popupStatusAt(
          { ...next, status: next.status ?? "scheduled" },
          now,
        ),
      },
    });
  }

  if (action === "popup-end") {
    const id = String(
      body.id ?? (body.event as { id?: string } | undefined)?.id ?? "",
    );
    if (!id) throw new HttpError(400, "Pop-Up id is required");
    const previous =
      (await env.DB.prepare("SELECT * FROM adventure_popup_events WHERE id=?")
        .bind(id)
        .first<PopupRow>()) ?? null;
    const fallback = defaultPopupEvents().find((event) => event.id === id);
    if (!previous && !fallback)
      throw new HttpError(404, "Pop-Up event not found");
    const base = previous
      ? {
          id: previous.id,
          name: previous.name,
          description: previous.description,
          startsAt: previous.starts_at,
          endsAt: previous.ends_at,
          pool: parsePool(previous.pool_json),
        }
      : fallback!;
    const ended = {
      ...base,
      id,
      status: "ended" as const,
      endsAt: Math.min(base.endsAt, now),
    };
    await writePopup(env, ended, actor, now, "popup-end", previous);
    return Response.json({
      ok: true,
      action,
      event: { ...ended, source: "d1" },
    });
  }

  if (action === "override-rarity") {
    const parsed = validate(
      validateRarityOverride,
      (body.override as unknown) ?? body,
    );
    const note = String(body.note ?? "");
    const saved = await writeOverride(env, {
      kind: "rarity_table",
      payload: parsed,
      actor,
      note,
      now,
      action,
    });
    return Response.json({
      ok: true,
      action,
      version: saved.version,
      override: parsed,
      applied: mergeRarityWeights(parsed),
      pityGrants: effectivePityGrants(parsed),
    });
  }

  if (action === "override-luck") {
    const parsed = validate(
      validateStyleLuckOverride,
      (body.override as unknown) ?? body,
    );
    const saved = await writeOverride(env, {
      kind: "style_luck",
      payload: parsed,
      actor,
      note: String(body.note ?? ""),
      now,
      action,
    });
    return Response.json({
      ok: true,
      action,
      version: saved.version,
      override: parsed,
      applied: appliedStyleLuck({
        rarity: null,
        rarityVersion: null,
        styleLuck: parsed,
        styleLuckVersion: saved.version,
      }),
    });
  }

  throw new HttpError(404, "Unknown adventure admin action");
}

export async function adventureAdminPost(
  url: URL,
  env: Env,
  body: Record<string, unknown>,
  now: number,
): Promise<Response | null> {
  if (!isAdminPath(url.pathname)) return null;
  const action = actionFrom(url, body);
  const actor = await authorize(env, body, action, now);
  return handleAction(env, action, body, actor, now);
}

export function adventureAdminError(error: unknown): Response | null {
  if (error instanceof HttpError)
    return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof AdventureAdminValidationError)
    return Response.json({ error: error.message }, { status: 400 });
  return null;
}

export { bytesToHex };
