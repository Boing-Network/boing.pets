import {
  DROP_TABLE_VERSION,
  isDropCareSource,
  publicDropTable,
  rollCosmeticDrop,
  utcDayKey,
  utcWeekKey,
  type DropPityState,
} from "../src/drops";
import { hex32 } from "../src/core";

export type CareDropGrant = {
  itemId: string;
  itemOnchainId: number;
  name: string;
  tier: string;
  reason: string;
  digestHex: string;
};

async function loadPity(env: Env, owner: string): Promise<DropPityState> {
  const row = await env.DB.prepare(
    "SELECT hits_since_rare, hits_since_premium FROM drop_pity WHERE owner=?",
  )
    .bind(owner)
    .first<{ hits_since_rare: number; hits_since_premium: number }>();
  return {
    hitsSinceRare: Number(row?.hits_since_rare || 0),
    hitsSincePremium: Number(row?.hits_since_premium || 0),
  };
}

export async function maybeGrantCareDrop(
  env: Env,
  owner: string,
  action: string,
  now: number,
  nonce: string,
): Promise<CareDropGrant | null> {
  if (!isDropCareSource(action)) return null;
  const day = utcDayKey(now);
  const week = utcWeekKey(now);
  const already = await env.DB.prepare(
    "SELECT id FROM drop_rolls WHERE owner=? AND source=? AND utc_day=?",
  )
    .bind(owner, action, day)
    .first();
  if (already) return null;

  const pity = await loadPity(env, owner);
  const dropsToday = Number(
    (
      await env.DB.prepare(
        "SELECT COUNT(*) AS n FROM drop_rolls WHERE owner=? AND utc_day=? AND hit=1",
      )
        .bind(owner, day)
        .first<{ n: number }>()
    )?.n || 0,
  );
  const premiumRows = await env.DB.prepare(
    "SELECT created_at FROM drop_rolls WHERE owner=? AND hit=1 AND item_id IN ('hat-stardust','frame-aurora')",
  )
    .bind(owner)
    .all<{ created_at: number }>();
  const premiumsWeek = premiumRows.results.filter(
    (row) => utcWeekKey(row.created_at) === week,
  ).length;

  const rolled = rollCosmeticDrop({
    owner,
    source: action,
    day,
    nonce,
    pity,
    dropsToday,
    premiumsThisWeek: premiumsWeek,
  });

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO drop_rolls(
         id,owner,source,utc_day,nonce,digest_hex,table_version,hit,reason,
         item_id,item_onchain_id,qty,pity_rare_before,pity_premium_before,
         pity_rare_after,pity_premium_after,created_at
       ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      nonce,
      owner,
      action,
      day,
      nonce,
      rolled.digestHex,
      DROP_TABLE_VERSION,
      rolled.hit ? 1 : 0,
      rolled.reason,
      rolled.entry?.gameItemId ?? null,
      rolled.entry?.itemId ?? null,
      rolled.hit ? 1 : null,
      pity.hitsSinceRare,
      pity.hitsSincePremium,
      rolled.pity.hitsSinceRare,
      rolled.pity.hitsSincePremium,
      now,
    ),
    env.DB.prepare(
      "INSERT INTO drop_pity(owner,hits_since_rare,hits_since_premium,updated_at) VALUES(?,?,?,?) ON CONFLICT(owner) DO UPDATE SET hits_since_rare=excluded.hits_since_rare, hits_since_premium=excluded.hits_since_premium, updated_at=excluded.updated_at",
    ).bind(owner, rolled.pity.hitsSinceRare, rolled.pity.hitsSincePremium, now),
  ]);

  if (!rolled.hit || !rolled.entry) return null;

  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO inventory(owner,item_id,qty) VALUES(?,?,1) ON CONFLICT(owner,item_id) DO UPDATE SET qty=qty+1",
    ).bind(owner, rolled.entry.gameItemId),
    env.DB.prepare(
      "INSERT INTO inventory_acquisitions(id,owner,item_id,qty,source,from_owner,created_at) VALUES(?,?,?,?,?,?,?)",
    ).bind(
      nonce + ":drop",
      owner,
      rolled.entry.gameItemId,
      1,
      "drop:" + action,
      null,
      now,
    ),
  ]);

  return {
    itemId: rolled.entry.gameItemId,
    itemOnchainId: rolled.entry.itemId,
    name: rolled.entry.name,
    tier: rolled.entry.tier,
    reason: rolled.reason,
    digestHex: rolled.digestHex,
  };
}

export async function dropsGet(
  req: Request,
  env: Env,
  now: number,
): Promise<Response | null> {
  const url = new URL(req.url);
  if (url.pathname === "/api/drops/table") {
    return Response.json({ ...publicDropTable(), now });
  }
  if (url.pathname === "/api/drops/history") {
    const owner = hex32(url.searchParams.get("owner"));
    const rows = await env.DB.prepare(
      "SELECT id,source,utc_day,hit,reason,item_id,item_onchain_id,qty,digest_hex,table_version,created_at FROM drop_rolls WHERE owner=? ORDER BY created_at DESC LIMIT 80",
    )
      .bind(owner)
      .all();
    return Response.json({ owner, rolls: rows.results, now });
  }
  return null;
}
