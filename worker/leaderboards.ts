import * as ed from "@noble/ed25519";
import { blake3 } from "@noble/hashes/blake3";
import { hexToBytes } from "@noble/hashes/utils";
import { hex32 } from "../src/core";
import { shortWallet } from "../src/social";
import {
  fishingCatchScore,
  LEADERBOARDS,
  leaderboardById,
  racingFinishScore,
  rankLeaderboard,
  weekRange,
  winnerOf,
  type LeaderboardDef,
  type LeaderboardEntry,
} from "../src/content/leaderboards";
import { ledgerCreditPair } from "./ledger";

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function verifySignature(
  owner: string,
  message: string,
  signature: unknown,
) {
  if (typeof signature !== "string" || !/^(0x)?[0-9a-f]{128}$/i.test(signature))
    throw new HttpError(400, "Invalid signature format");
  const ok = await ed.verifyAsync(
    hexToBytes(signature.replace(/^0x/i, "")),
    blake3(new TextEncoder().encode(message)),
    hexToBytes(owner.slice(2)),
  );
  if (!ok) throw new HttpError(403, "Signature does not match");
}

type AttemptRow = {
  owner: string;
  activity: string;
  reward_json: string | null;
};

function scoreRow(board: LeaderboardDef, row: AttemptRow): number | null {
  let reward: { rarity?: string; rewardBoinglets?: number; score?: number } =
    {};
  try {
    reward = JSON.parse(row.reward_json || "null") || {};
  } catch {
    return null;
  }
  if (board.activity === "fishing") return fishingCatchScore(reward);
  if (board.activity === "racing") return racingFinishScore(null, reward);
  return null;
}

async function loadNames(env: Env, owners: string[]) {
  const names = new Map<string, string>();
  if (!owners.length) return names;
  const placeholders = owners.map(() => "?").join(",");
  const rows = await env.DB.prepare(
    "SELECT owner, display_name FROM profiles WHERE owner IN (" +
      placeholders +
      ")",
  )
    .bind(...owners)
    .all<{ owner: string; display_name: string | null }>();
  for (const row of rows.results) {
    if (row.display_name) names.set(row.owner, row.display_name);
  }
  return names;
}

async function loadBoard(
  env: Env,
  board: LeaderboardDef,
  start: number,
  end: number,
  names: Map<string, string>,
  viewer: string | null,
) {
  const rows = await env.DB.prepare(
    "SELECT owner, activity, reward_json FROM activity_attempts WHERE status='claimed' AND activity=? AND created_at>=? AND created_at<?",
  )
    .bind(board.activity, start, end)
    .all<AttemptRow>();
  const entries: LeaderboardEntry[] = [];
  for (const row of rows.results) {
    const score = scoreRow(board, row);
    if (score === null || score === Number.MAX_SAFE_INTEGER) continue;
    let detail: string | undefined;
    try {
      const reward = JSON.parse(row.reward_json || "null") as {
        name?: string;
        rarity?: string;
      } | null;
      detail = reward?.name || reward?.rarity || undefined;
    } catch {
      detail = undefined;
    }
    entries.push({
      owner: row.owner,
      score,
      label: names.get(row.owner) || shortWallet(row.owner),
      detail,
    });
  }
  const ranked = rankLeaderboard(entries, board.better);
  const all = rankLeaderboard(entries, board.better, 1000);
  const mine = viewer ? all.find((row) => row.owner === viewer) : undefined;
  const you = mine ? { score: mine.score, rank: mine.rank } : null;
  return { ranked, you, winner: winnerOf(ranked) };
}

export async function leaderboardsGet(
  req: Request,
  env: Env,
  now: number,
): Promise<Response | null> {
  const url = new URL(req.url);
  if (url.pathname !== "/api/content/leaderboards") return null;
  const ownerParam = url.searchParams.get("owner");
  const viewer = ownerParam ? hex32(ownerParam) : null;
  const current = weekRange(now, "current");
  const previous = weekRange(now, "previous");
  const claimed = new Set<string>();
  if (viewer) {
    const rows = await env.DB.prepare(
      "SELECT quest_id, period_key FROM quest_claims WHERE owner=? AND quest_id IN (?, ?)",
    )
      .bind(viewer, LEADERBOARDS[0]!.questId, LEADERBOARDS[1]!.questId)
      .all<{ quest_id: string; period_key: string }>();
    for (const row of rows.results)
      claimed.add(row.quest_id + ":" + row.period_key);
  }
  const owners = new Set<string>();
  if (viewer) owners.add(viewer);
  const attemptOwners = await env.DB.prepare(
    "SELECT DISTINCT owner FROM activity_attempts WHERE status='claimed' AND activity IN ('racing','fishing') AND created_at>=? AND created_at<?",
  )
    .bind(previous.start, current.end)
    .all<{ owner: string }>();
  for (const row of attemptOwners.results) owners.add(row.owner);
  const names = await loadNames(env, [...owners]);

  async function serialize(
    range: { key: string; start: number; end: number },
    claimable: boolean,
  ) {
    const boards = [];
    for (const board of LEADERBOARDS) {
      const view = await loadBoard(
        env,
        board,
        range.start,
        range.end,
        names,
        viewer,
      );
      const isWinner = !!viewer && view.winner?.owner === viewer;
      const already = claimed.has(board.questId + ":" + range.key);
      boards.push({
        id: board.id,
        title: board.title,
        description: board.description,
        activity: board.activity,
        better: board.better,
        unit: board.unit,
        weekKey: range.key,
        entries: view.ranked.map((row) => ({
          rank: row.rank,
          owner: row.owner,
          label: row.label,
          score: row.score,
          detail: row.detail || null,
        })),
        you: view.you,
        bonus: {
          rewardBoinglets: board.rewardBoinglets,
          cosmeticId: board.cosmeticId,
          claimed: already,
          eligible: claimable && isWinner && !already,
        },
      });
    }
    return { key: range.key, start: range.start, end: range.end, boards };
  }

  return Response.json({
    current: await serialize(current, false),
    previous: await serialize(previous, true),
    now,
  });
}

export async function leaderboardsPost(
  url: URL,
  env: Env,
  body: Record<string, unknown>,
  now: number,
): Promise<Response | null> {
  if (url.pathname === "/api/content/leaderboards/challenge") {
    const owner = hex32(body.owner);
    const board = leaderboardById(String(body.board_id || ""));
    if (!board) throw new HttpError(404, "Unknown leaderboard");
    const previous = weekRange(now, "previous");
    const names = await loadNames(env, [owner]);
    const view = await loadBoard(
      env,
      board,
      previous.start,
      previous.end,
      names,
      owner,
    );
    if (!view.winner || view.winner.owner !== owner)
      throw new HttpError(409, "Only last week's first place can claim");
    const already = await env.DB.prepare(
      "SELECT quest_id FROM quest_claims WHERE owner=? AND quest_id=? AND period_key=?",
    )
      .bind(owner, board.questId, previous.key)
      .first();
    if (already)
      throw new HttpError(409, "Weekly board reward already claimed");
    const id = crypto.randomUUID();
    const expires = now + 10 * 60_000;
    const payload = {
      quest_id: board.questId,
      board_id: board.id,
      period: previous.key,
      reward: board.rewardBoinglets,
      cosmeticId: board.cosmeticId,
    };
    const message = [
      "Boing Pets weekly board v1",
      "Origin: " + env.APP_ORIGIN,
      "Chain: 6913",
      "Owner: " + owner,
      "Board: " + board.id,
      "Period: " + payload.period,
      "Reward: " + String(payload.reward),
      "Cosmetic: " + payload.cosmeticId,
      "Nonce: " + id,
      "Expires: " + String(expires),
    ].join("\n");
    await env.DB.prepare(
      "INSERT INTO content_challenges(id,owner,kind,payload,message,created_at,expires_at) VALUES(?,?,?,?,?,?,?)",
    )
      .bind(
        id,
        owner,
        "quest_claim",
        JSON.stringify(payload),
        message,
        now,
        expires,
      )
      .run();
    return Response.json({ id, message, expires_at: expires, ...payload });
  }

  if (url.pathname === "/api/content/leaderboards/confirm") {
    if (typeof body.id !== "string" || body.id.length > 64)
      throw new HttpError(400, "Invalid weekly board challenge");
    const c = await env.DB.prepare(
      "SELECT * FROM content_challenges WHERE id=?",
    )
      .bind(body.id)
      .first<{
        id: string;
        owner: string;
        kind: string;
        payload: string;
        message: string;
        expires_at: number;
      }>();
    if (!c || c.kind !== "quest_claim")
      throw new HttpError(404, "Weekly board challenge not found");
    if (c.expires_at < now)
      throw new HttpError(410, "Weekly board challenge expired");
    await verifySignature(c.owner, c.message, body.signature);
    const payload = JSON.parse(c.payload) as {
      quest_id: string;
      board_id: string;
      period: string;
      reward: number;
      cosmeticId: string;
    };
    const board = leaderboardById(payload.board_id);
    if (
      !board ||
      board.questId !== payload.quest_id ||
      board.rewardBoinglets !== payload.reward ||
      board.cosmeticId !== payload.cosmeticId
    )
      throw new HttpError(409, "Weekly board changed; retry");
    const previous = weekRange(now, "previous");
    if (payload.period !== previous.key)
      throw new HttpError(409, "Weekly board period changed; retry");
    const view = await loadBoard(
      env,
      board,
      previous.start,
      previous.end,
      new Map(),
      c.owner,
    );
    if (!view.winner || view.winner.owner !== c.owner)
      throw new HttpError(409, "Weekly board winner changed; retry");
    try {
      await env.DB.batch([
        env.DB.prepare(
          "INSERT INTO quest_claims(owner,quest_id,period_key,claimed_at) VALUES(?,?,?,?)",
        ).bind(c.owner, board.questId, payload.period, now),
        ...ledgerCreditPair(
          env,
          c.id,
          c.owner,
          "boinglets",
          payload.reward,
          "weekly_board",
          board.id,
          now,
        ),
        env.DB.prepare(
          "INSERT INTO inventory(owner,item_id,qty) VALUES(?,?,1) ON CONFLICT(owner,item_id) DO UPDATE SET qty=qty+1",
        ).bind(c.owner, board.cosmeticId),
        env.DB.prepare(
          "INSERT INTO inventory_acquisitions(id,owner,item_id,qty,source,from_owner,created_at) VALUES(?,?,?,?,?,?,?)",
        ).bind(
          c.id + ":board",
          c.owner,
          board.cosmeticId,
          1,
          "weekly_board",
          null,
          now,
        ),
      ]);
    } catch {
      throw new HttpError(
        409,
        "Weekly board reward already claimed or ledger busy",
      );
    }
    await env.DB.prepare("DELETE FROM content_challenges WHERE id=?")
      .bind(c.id)
      .run();
    return Response.json({
      ok: true,
      reward: payload.reward,
      cosmeticId: payload.cosmeticId,
    });
  }

  return null;
}

export function leaderboardsError(error: unknown): Response | null {
  if (error instanceof HttpError)
    return Response.json({ error: error.message }, { status: error.status });
  return null;
}
