/**
 * Quarry gather loop. Ticks come from the Worker clock, never from the body.
 * Mint route refuses. `GATHER_MINT` does not submit a transaction in this build.
 */

import { dayOf, hex32 } from "../src/core";
import {
  GATHER_COPY,
  GATHER_FACE_ID,
  GATHER_PACK_UNITS,
  GATHER_RESTART_GAP_MS,
  GATHER_SKILL_QUARRY,
  applyGatherTicks,
  dueTicks,
  gatherMintShipped,
  gatherQuarryEnabled,
  levelsCrossed,
  mintPresets,
  planBankCred,
  quarryNodesFor,
  quarrySeedXp,
  pickTierFromIds,
  rollDepleteTicks,
  skillProgress,
  tickMs,
} from "../src/content/gathering";
import { mulberry32, seedFromParts } from "../src/content/adventures";
import { itemDisplayName } from "../src/content/items";
import { pushLedgerCredit } from "./ledger";
import { resolvePartyBonus } from "./partyBonus";
import { HttpError, requireSocialSession } from "./social";

type SessionRow = {
  id: string;
  owner: string;
  skill: string;
  node_id: string;
  station_id: string;
  tick_ms: number;
  deplete_ticks: number;
  ticks_settled: number;
  seed: string;
  status: string;
  started_at: number;
  updated_at: number;
};

function writeChanges(result: unknown): number {
  if (!result || typeof result !== "object") return 0;
  const row = result as { meta?: { changes?: number }; changes?: number };
  return Number(row.meta?.changes ?? row.changes ?? 0);
}

function dayKey(now: number): string {
  return `d:${dayOf(now)}`;
}

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
  return out;
}

async function requireCharacter(env: Env, owner: string) {
  const pet = await env.DB.prepare("SELECT owner FROM pets WHERE owner=?")
    .bind(owner)
    .first();
  if (!pet)
    throw new HttpError(404, "Hatch a character before you work the face.");
}

async function packRows(env: Env, owner: string) {
  const rows = await env.DB.prepare(
    "SELECT item_id, qty FROM gather_backpack WHERE owner=? ORDER BY item_id",
  )
    .bind(owner)
    .all<{ item_id: string; qty: number }>();
  return rows.results ?? [];
}

function packUnits(rows: Array<{ qty: number }>): number {
  return rows.reduce((sum, row) => sum + row.qty, 0);
}

async function pickTier(env: Env, owner: string): Promise<number> {
  const rows = await env.DB.prepare(
    "SELECT item_id FROM inventory WHERE owner=? AND qty>0 AND item_id LIKE 'tool-pick-%'",
  )
    .bind(owner)
    .all<{ item_id: string }>();
  return pickTierFromIds((rows.results ?? []).map((row) => row.item_id));
}

async function discoveredOres(env: Env, owner: string): Promise<string[]> {
  const rows = await env.DB.prepare(
    "SELECT entry_id FROM collection_unlocks WHERE owner=? AND entry_id LIKE 'discovery:ore:%'",
  )
    .bind(owner)
    .all<{ entry_id: string }>();
  return (rows.results ?? []).map((row) =>
    row.entry_id.replace(/^discovery:ore:/, ""),
  );
}

async function ensureSkill(env: Env, owner: string, now: number) {
  const existing = await env.DB.prepare(
    "SELECT xp FROM gather_skills WHERE owner=? AND skill=?",
  )
    .bind(owner, GATHER_SKILL_QUARRY)
    .first<{ xp: number }>();
  if (existing) return existing.xp;
  const xp = quarrySeedXp({
    pickTier: await pickTier(env, owner),
    discoveredIds: await discoveredOres(env, owner),
  });
  await env.DB.prepare(
    `INSERT INTO gather_skills(owner, skill, xp, updated_at) VALUES(?,?,?,?)
     ON CONFLICT(owner, skill) DO NOTHING`,
  )
    .bind(owner, GATHER_SKILL_QUARRY, xp, now)
    .run();
  const row = await env.DB.prepare(
    "SELECT xp FROM gather_skills WHERE owner=? AND skill=?",
  )
    .bind(owner, GATHER_SKILL_QUARRY)
    .first<{ xp: number }>();
  return row?.xp ?? xp;
}

async function liveSession(env: Env, owner: string) {
  return env.DB.prepare(
    "SELECT * FROM gather_sessions WHERE owner=? AND status='running' LIMIT 1",
  )
    .bind(owner)
    .first<SessionRow>();
}

async function credToday(env: Env, owner: string, now: number) {
  const row = await env.DB.prepare(
    "SELECT cred_items, cred_paid FROM gather_daily WHERE owner=? AND skill=? AND day_key=?",
  )
    .bind(owner, GATHER_SKILL_QUARRY, dayKey(now))
    .first<{ cred_items: number; cred_paid: number }>();
  return { credItems: row?.cred_items ?? 0, credPaid: row?.cred_paid ?? 0 };
}

function publicSession(row: SessionRow | null) {
  if (!row) return null;
  return {
    id: row.id,
    skill: row.skill,
    nodeId: row.node_id,
    stationId: row.station_id,
    tickMs: row.tick_ms,
    status: row.status,
    ticksSettled: row.ticks_settled,
    startedAt: row.started_at,
  };
}

async function publicState(env: Env, owner: string, now: number) {
  const xp = await ensureSkill(env, owner, now);
  const progress = skillProgress(xp);
  const tier = await pickTier(env, owner);
  const nodes = quarryNodesFor(progress.level, tier);
  const pack = await packRows(env, owner);
  const cred = await credToday(env, owner, now);
  const session =
    (await liveSession(env, owner)) ??
    (await env.DB.prepare(
      `SELECT * FROM gather_sessions WHERE owner=? AND skill=?
       ORDER BY updated_at DESC LIMIT 1`,
    )
      .bind(owner, GATHER_SKILL_QUARRY)
      .first<SessionRow>());
  const show =
    session && now - session.updated_at < 10 * 60_000 ? session : null;
  return {
    enabled: true,
    mintEnabled: gatherMintShipped(),
    skill: {
      id: GATHER_SKILL_QUARRY,
      name: "Quarry",
      ...progress,
    },
    pack: {
      units: packUnits(pack),
      cap: GATHER_PACK_UNITS,
      items: pack.map((row) => ({
        itemId: row.item_id,
        name: itemDisplayName(row.item_id),
        qty: row.qty,
      })),
    },
    session: publicSession(show),
    cred: {
      paidUnits: cred.credItems,
      paid: cred.credPaid,
      cap: 80,
    },
    pickaxeTier: tier,
    nodes: nodes.map((node) => ({
      id: node.id,
      name: node.name,
      minLevel: node.minLevel,
      minTier: node.minTier,
    })),
    mintPresets: mintPresets(0),
    copy: GATHER_COPY,
    now,
  };
}

async function settleOwner(env: Env, owner: string, now: number) {
  const session = await liveSession(env, owner);
  if (!session) return { levelUps: [] as Array<{ label: string }> };
  const due = dueTicks({
    now,
    startedAt: session.started_at,
    tick: session.tick_ms,
    depleteTicks: session.deplete_ticks,
    ticksSettled: session.ticks_settled,
  });
  const tickCount = due - session.ticks_settled;
  if (tickCount <= 0) return { levelUps: [] as Array<{ label: string }> };

  const xpBefore = await ensureSkill(env, owner, now);
  const progress = skillProgress(xpBefore);
  const tier = await pickTier(env, owner);
  const pack = await packRows(env, owner);
  const applied = applyGatherTicks({
    tickCount,
    seed: session.seed,
    ticksAlreadySettled: session.ticks_settled,
    packUnits: packUnits(pack),
    level: progress.level,
    pickTier: tier,
  });
  const ticksSettled = session.ticks_settled + applied.consumed;
  let status = "running";
  if (applied.packed) status = "packed";
  else if (ticksSettled >= session.deplete_ticks) status = "depleted";

  const locked = await env.DB.prepare(
    `UPDATE gather_sessions
     SET ticks_settled=?, status=?, updated_at=?
     WHERE id=? AND ticks_settled=? AND status='running'`,
  )
    .bind(ticksSettled, status, now, session.id, session.ticks_settled)
    .run();
  if (writeChanges(locked) === 0) {
    return { levelUps: [] as Array<{ label: string }> };
  }

  const statements: D1PreparedStatement[] = [];
  if (applied.xp > 0) {
    statements.push(
      env.DB.prepare(
        `UPDATE gather_skills SET xp=xp+?, updated_at=? WHERE owner=? AND skill=?`,
      ).bind(applied.xp, now, owner, GATHER_SKILL_QUARRY),
    );
  }
  for (const [itemId, qty] of Object.entries(applied.items)) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO gather_backpack(owner, item_id, qty) VALUES(?,?,?)
         ON CONFLICT(owner, item_id) DO UPDATE SET qty=qty+excluded.qty`,
      ).bind(owner, itemId, qty),
    );
  }
  if (statements.length) await env.DB.batch(statements);
  return {
    levelUps: levelsCrossed(xpBefore, xpBefore + applied.xp).map((row) => ({
      label: row.label,
      level: row.level,
      prestige: row.prestige,
    })),
  };
}

export async function gatheringGet(
  req: Request,
  env: Env,
  now: number,
): Promise<Response | null> {
  const url = new URL(req.url);
  if (url.pathname !== "/api/gather/status") return null;
  if (!gatherQuarryEnabled(env)) {
    return Response.json({
      enabled: false,
      mintEnabled: false,
      packCap: GATHER_PACK_UNITS,
      now,
    });
  }
  const ownerParam = url.searchParams.get("owner");
  if (!ownerParam) {
    return Response.json({
      enabled: true,
      mintEnabled: gatherMintShipped(),
      packCap: GATHER_PACK_UNITS,
      copy: GATHER_COPY,
      now,
    });
  }
  const owner = hex32(ownerParam);
  await requireSocialSession(req, env, owner, now);
  await settleOwner(env, owner, now);
  return Response.json(await publicState(env, owner, now));
}

export async function gatheringPost(
  req: Request,
  url: URL,
  env: Env,
  body: Record<string, unknown>,
  now: number,
): Promise<Response | null> {
  const route =
    url.pathname === "/api/gather/start" ||
    url.pathname === "/api/gather/settle" ||
    url.pathname === "/api/gather/stop" ||
    url.pathname === "/api/gather/bank" ||
    url.pathname === "/api/gather/mint";
  if (!route) return null;
  if (!gatherQuarryEnabled(env)) {
    throw new HttpError(403, "Quarry is closed.");
  }
  // This build never signs a mint, including when GATHER_MINT is on.
  if (url.pathname === "/api/gather/mint") {
    throw new HttpError(403, GATHER_COPY.mintClosed);
  }

  const owner = hex32(body.owner);
  await requireSocialSession(req, env, owner, now);
  await requireCharacter(env, owner);

  if (url.pathname === "/api/gather/settle") {
    const levelUps = await settleOwner(env, owner, now);
    const state = await publicState(env, owner, now);
    return Response.json({ ...state, levelUps: levelUps.levelUps });
  }

  if (url.pathname === "/api/gather/stop") {
    const levelUps = await settleOwner(env, owner, now);
    await env.DB.prepare(
      `UPDATE gather_sessions SET status='stopped', updated_at=?
       WHERE owner=? AND status='running'`,
    )
      .bind(now, owner)
      .run();
    const state = await publicState(env, owner, now);
    return Response.json({ ...state, levelUps: levelUps.levelUps });
  }

  if (url.pathname === "/api/gather/start") {
    if (body.skill !== undefined && body.skill !== GATHER_SKILL_QUARRY) {
      throw new HttpError(403, "That skill is not open.");
    }
    const live = await liveSession(env, owner);
    if (live) throw new HttpError(409, "The face is already working.");
    const recent = await env.DB.prepare(
      `SELECT updated_at FROM gather_sessions WHERE owner=? AND status!='running'
       ORDER BY updated_at DESC LIMIT 1`,
    )
      .bind(owner)
      .first<{ updated_at: number }>();
    if (recent && now - recent.updated_at < GATHER_RESTART_GAP_MS) {
      throw new HttpError(429, "Give the face a second.");
    }
    const rows = await packRows(env, owner);
    if (packUnits(rows) >= GATHER_PACK_UNITS) {
      throw new HttpError(409, GATHER_COPY.packed);
    }
    const xp = await ensureSkill(env, owner, now);
    const progress = skillProgress(xp);
    const tier = await pickTier(env, owner);
    if (!quarryNodesFor(progress.level, tier).length) {
      throw new HttpError(403, "No ore on this face for that pick.");
    }
    const tick = tickMs(progress.level);
    const rng = mulberry32(seedFromParts(owner, now, crypto.randomUUID()));
    const deplete = rollDepleteTicks(rng, tick);
    const seed = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
    const id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO gather_sessions(
        id,owner,skill,node_id,station_id,tick_ms,deplete_ticks,ticks_settled,seed,status,started_at,updated_at
      ) VALUES(?,?,?,?,?,?,?,0,?,'running',?,?)`,
    )
      .bind(
        id,
        owner,
        GATHER_SKILL_QUARRY,
        GATHER_FACE_ID,
        "pasture-mine",
        tick,
        deplete,
        seed,
        now,
        now,
      )
      .run();
    const state = await publicState(env, owner, now);
    return Response.json({ ...state, levelUps: [] });
  }

  if (url.pathname === "/api/gather/bank") {
    if (await liveSession(env, owner)) {
      throw new HttpError(409, "Stop the face before you bank.");
    }
    const rows = await packRows(env, owner);
    if (!rows.length) {
      const state = await publicState(env, owner, now);
      return Response.json({
        ...state,
        banked: [],
        credGained: 0,
        levelUps: [],
      });
    }
    const credRow = await credToday(env, owner, now);
    const plan = planBankCred(
      rows.map((row) => ({ itemId: row.item_id, qty: row.qty })),
      credRow.credItems,
    );
    const deleted = await env.DB.prepare(
      "DELETE FROM gather_backpack WHERE owner=?",
    )
      .bind(owner)
      .run();
    if (writeChanges(deleted) === 0) {
      const state = await publicState(env, owner, now);
      return Response.json({
        ...state,
        banked: [],
        credGained: 0,
        levelUps: [],
      });
    }
    const statements: D1PreparedStatement[] = [];
    for (const row of rows) {
      statements.push(
        env.DB.prepare(
          `INSERT INTO inventory(owner, item_id, qty) VALUES(?,?,?)
           ON CONFLICT(owner, item_id) DO UPDATE SET qty=qty+excluded.qty`,
        ).bind(owner, row.item_id, row.qty),
        env.DB.prepare(
          `INSERT INTO inventory_acquisitions(id,owner,item_id,qty,source,from_owner,created_at)
           VALUES(?,?,?,?, 'gather_bank', NULL, ?)`,
        ).bind(crypto.randomUUID(), owner, row.item_id, row.qty, now),
        env.DB.prepare(
          `INSERT INTO gather_bank_log(id,owner,item_id,qty,cred,created_at) VALUES(?,?,?,?,?,?)`,
        ).bind(
          crypto.randomUUID(),
          owner,
          row.item_id,
          row.qty,
          plan.byItem[row.item_id] ?? 0,
          now,
        ),
      );
      const lineCred = plan.byItem[row.item_id] ?? 0;
      if (lineCred > 0) {
        pushLedgerCredit(
          statements,
          env,
          `gather-bank:${crypto.randomUUID()}`,
          owner,
          "boinglets",
          lineCred,
          "gather_bank",
          row.item_id,
          now,
        );
      }
    }
    statements.push(
      env.DB.prepare(
        `INSERT INTO gather_daily(owner, skill, day_key, cred_items, cred_paid)
         VALUES(?,?,?,?,?)
         ON CONFLICT(owner, skill, day_key) DO UPDATE SET
           cred_items=cred_items+excluded.cred_items,
           cred_paid=cred_paid+excluded.cred_paid`,
      ).bind(
        owner,
        GATHER_SKILL_QUARRY,
        dayKey(now),
        plan.paidUnits,
        plan.cred,
      ),
    );
    const party = await resolvePartyBonus(env, owner, "quarry", plan.cred, now);
    statements.push(...party.statements);
    try {
      await env.DB.batch(statements);
    } catch (error) {
      for (const row of rows) {
        await env.DB.prepare(
          `INSERT INTO gather_backpack(owner, item_id, qty) VALUES(?,?,?)
           ON CONFLICT(owner, item_id) DO UPDATE SET qty=qty+excluded.qty`,
        )
          .bind(owner, row.item_id, row.qty)
          .run();
      }
      throw error;
    }
    const state = await publicState(env, owner, now);
    return Response.json({
      ...state,
      banked: rows.map((row) => ({ itemId: row.item_id, qty: row.qty })),
      credGained: plan.cred,
      levelUps: [],
    });
  }

  return null;
}

export function gatheringError(error: unknown): Response | null {
  if (error instanceof HttpError)
    return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof Error && error.message.startsWith("Expected a 32-byte"))
    return Response.json({ error: error.message }, { status: 400 });
  return null;
}
