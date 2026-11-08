import * as ed from "@noble/ed25519";
import { blake3 } from "@noble/hashes/blake3";
import { hexToBytes } from "@noble/hashes/utils";
import { hex32 } from "../src/core";
import {
  friendPair,
  isSocialKind,
  sanitizeDisplayName,
  sanitizeMessage,
  type SocialKind,
} from "../src/social";

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
  if (
    typeof signature !== "string" ||
    !/^(0x)?[0-9a-f]{128}$/i.test(signature)
  )
    throw new HttpError(400, "Invalid signature format");
  const ok = await ed.verifyAsync(
    hexToBytes(signature.replace(/^0x/i, "")),
    blake3(new TextEncoder().encode(message)),
    hexToBytes(owner.slice(2)),
  );
  if (!ok) throw new HttpError(403, "Signature does not match");
}

async function rateLimit(env: Env, owner: string, now: number) {
  const count = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM social_challenges WHERE owner=? AND created_at>?",
  )
    .bind(owner, now - 60_000)
    .first<{ n: number }>();
  if ((count?.n || 0) >= 12)
    throw new HttpError(429, "Too many social requests. Try again shortly.");
}

async function issue(
  env: Env,
  owner: string,
  kind: SocialKind,
  payload: Record<string, unknown>,
  now: number,
) {
  await rateLimit(env, owner, now);
  await env.DB.prepare("DELETE FROM social_challenges WHERE expires_at<?")
    .bind(now)
    .run();
  const id = crypto.randomUUID();
  const expires = now + 10 * 60_000;
  const body = JSON.stringify(payload);
  const message = `Boing Pets social v1\nOrigin: ${env.APP_ORIGIN}\nChain: 6913\nOwner: ${owner}\nKind: ${kind}\nPayload: ${body}\nNonce: ${id}\nExpires: ${expires}`;
  await env.DB.prepare(
    "INSERT INTO social_challenges(id,owner,kind,payload,message,created_at,expires_at) VALUES(?,?,?,?,?,?,?)",
  )
    .bind(id, owner, kind, body, message, now, expires)
    .run();
  return { id, owner, kind, payload, message, expires_at: expires };
}

async function areFriends(env: Env, a: string, b: string): Promise<boolean> {
  const [ownerA, ownerB] = friendPair(a, b);
  const row = await env.DB.prepare(
    "SELECT owner_a FROM friendships WHERE owner_a=? AND owner_b=?",
  )
    .bind(ownerA, ownerB)
    .first();
  return !!row;
}

async function profileName(env: Env, owner: string): Promise<string | null> {
  const row = await env.DB.prepare(
    "SELECT display_name FROM profiles WHERE owner=?",
  )
    .bind(owner)
    .first<{ display_name: string }>();
  return row?.display_name ?? null;
}

export async function socialGet(
  req: Request,
  env: Env,
  now: number,
): Promise<Response | null> {
  const url = new URL(req.url);
  if (url.pathname === "/api/social/profile") {
    const owner = hex32(url.searchParams.get("owner"));
    const profile = await env.DB.prepare(
      "SELECT owner,display_name,title,updated_at FROM profiles WHERE owner=?",
    )
      .bind(owner)
      .first();
    const pet = await env.DB.prepare("SELECT owner FROM pets WHERE owner=?")
      .bind(owner)
      .first();
    return Response.json({
      profile: profile || null,
      hasPet: !!pet,
      now,
    });
  }

  if (url.pathname === "/api/social/friends") {
    const owner = hex32(url.searchParams.get("owner"));
    const rows = await env.DB.prepare(
      `SELECT owner_a,owner_b,created_at FROM friendships
       WHERE owner_a=? OR owner_b=? ORDER BY created_at DESC LIMIT 100`,
    )
      .bind(owner, owner)
      .all<{ owner_a: string; owner_b: string; created_at: number }>();
    const friends = [];
    for (const row of rows.results) {
      const friend = row.owner_a === owner ? row.owner_b : row.owner_a;
      friends.push({
        owner: friend,
        display_name: (await profileName(env, friend)) || null,
        since: row.created_at,
      });
    }
    return Response.json({ friends, now });
  }

  if (url.pathname === "/api/social/requests") {
    const owner = hex32(url.searchParams.get("owner"));
    const incoming = await env.DB.prepare(
      `SELECT id,from_owner,to_owner,status,created_at FROM friend_requests
       WHERE to_owner=? AND status='pending' ORDER BY created_at DESC LIMIT 50`,
    )
      .bind(owner)
      .all();
    const outgoing = await env.DB.prepare(
      `SELECT id,from_owner,to_owner,status,created_at FROM friend_requests
       WHERE from_owner=? AND status='pending' ORDER BY created_at DESC LIMIT 50`,
    )
      .bind(owner)
      .all();
    const enrich = async (
      rows: Array<{
        id: string;
        from_owner: string;
        to_owner: string;
        status: string;
        created_at: number;
      }>,
    ) =>
      Promise.all(
        rows.map(async (r) => ({
          ...r,
          from_name: await profileName(env, r.from_owner),
          to_name: await profileName(env, r.to_owner),
        })),
      );
    return Response.json({
      incoming: await enrich(
        incoming.results as Array<{
          id: string;
          from_owner: string;
          to_owner: string;
          status: string;
          created_at: number;
        }>,
      ),
      outgoing: await enrich(
        outgoing.results as Array<{
          id: string;
          from_owner: string;
          to_owner: string;
          status: string;
          created_at: number;
        }>,
      ),
      now,
    });
  }

  if (url.pathname === "/api/social/messages") {
    const owner = hex32(url.searchParams.get("owner"));
    const withOwner = hex32(url.searchParams.get("with"));
    if (!(await areFriends(env, owner, withOwner)))
      throw new HttpError(403, "Messages are limited to friends");
    const rows = await env.DB.prepare(
      `SELECT id,from_owner,to_owner,body,created_at,read_at FROM messages
       WHERE (from_owner=? AND to_owner=?) OR (from_owner=? AND to_owner=?)
       ORDER BY created_at DESC LIMIT 50`,
    )
      .bind(owner, withOwner, withOwner, owner)
      .all();
    return Response.json({
      with: withOwner,
      messages: [...rows.results].reverse(),
      now,
    });
  }

  return null;
}

export async function socialPost(
  url: URL,
  env: Env,
  body: Record<string, unknown>,
  now: number,
): Promise<Response | null> {
  if (url.pathname === "/api/social/challenge") {
    const owner = hex32(body.owner);
    if (!isSocialKind(body.kind))
      throw new HttpError(400, "Unknown social action");
    const kind = body.kind;

    if (kind === "set_profile") {
      let displayName: string;
      try {
        displayName = sanitizeDisplayName(body.display_name);
      } catch (e) {
        throw new HttpError(
          400,
          e instanceof Error ? e.message : "Invalid display name",
        );
      }
      return Response.json(
        await issue(env, owner, kind, { display_name: displayName }, now),
      );
    }

    if (kind === "friend_request") {
      const target = hex32(body.target);
      if (target === owner)
        throw new HttpError(400, "Cannot friend yourself");
      if (await areFriends(env, owner, target))
        throw new HttpError(409, "Already friends");
      const existing = await env.DB.prepare(
        "SELECT status FROM friend_requests WHERE from_owner=? AND to_owner=?",
      )
        .bind(owner, target)
        .first<{ status: string }>();
      if (existing?.status === "pending")
        throw new HttpError(409, "Request already pending");
      const pet = await env.DB.prepare("SELECT owner FROM pets WHERE owner=?")
        .bind(target)
        .first();
      if (!pet) throw new HttpError(404, "That wallet has no pet yet");
      return Response.json(
        await issue(env, owner, kind, { target }, now),
      );
    }

    if (kind === "friend_accept" || kind === "friend_decline") {
      const requestId = String(body.request_id || "");
      if (!requestId || requestId.length > 64)
        throw new HttpError(400, "Invalid request id");
      const reqRow = await env.DB.prepare(
        "SELECT * FROM friend_requests WHERE id=? AND to_owner=? AND status='pending'",
      )
        .bind(requestId, owner)
        .first<{ id: string; from_owner: string }>();
      if (!reqRow) throw new HttpError(404, "Friend request not found");
      return Response.json(
        await issue(
          env,
          owner,
          kind,
          { request_id: reqRow.id, from_owner: reqRow.from_owner },
          now,
        ),
      );
    }

    if (kind === "friend_remove") {
      const target = hex32(body.target);
      if (!(await areFriends(env, owner, target)))
        throw new HttpError(409, "Not friends");
      return Response.json(
        await issue(env, owner, kind, { target }, now),
      );
    }

    if (kind === "send_message") {
      const target = hex32(body.target);
      let text: string;
      try {
        text = sanitizeMessage(body.body);
      } catch (e) {
        throw new HttpError(
          400,
          e instanceof Error ? e.message : "Invalid message",
        );
      }
      if (!(await areFriends(env, owner, target)))
        throw new HttpError(403, "Messages are limited to friends");
      return Response.json(
        await issue(env, owner, kind, { target, body: text }, now),
      );
    }
  }

  if (url.pathname === "/api/social/confirm") {
    if (typeof body.id !== "string" || body.id.length > 64)
      throw new HttpError(400, "Invalid social challenge");
    const c = await env.DB.prepare(
      "SELECT * FROM social_challenges WHERE id=?",
    )
      .bind(body.id)
      .first<{
        id: string;
        owner: string;
        kind: SocialKind;
        payload: string;
        message: string;
        expires_at: number;
      }>();
    if (!c) throw new HttpError(404, "Social challenge not found");
    if (c.expires_at < now)
      throw new HttpError(410, "Social challenge expired");
    await verifySignature(c.owner, c.message, body.signature);
    const payload = JSON.parse(c.payload) as Record<string, unknown>;

    if (c.kind === "set_profile") {
      const displayName = sanitizeDisplayName(payload.display_name);
      await env.DB.prepare(
        `INSERT INTO profiles(owner,display_name,title,updated_at) VALUES(?,?,NULL,?)
         ON CONFLICT(owner) DO UPDATE SET display_name=excluded.display_name, updated_at=excluded.updated_at`,
      )
        .bind(c.owner, displayName, now)
        .run();
    }

    if (c.kind === "friend_request") {
      const target = hex32(payload.target);
      await env.DB.prepare(
        `INSERT INTO friend_requests(id,from_owner,to_owner,status,created_at,updated_at)
         VALUES(?,?,?,'pending',?,?)
         ON CONFLICT(from_owner,to_owner) DO UPDATE SET
           id=excluded.id, status='pending', updated_at=excluded.updated_at`,
      )
        .bind(c.id, c.owner, target, now, now)
        .run();
    }

    if (c.kind === "friend_accept") {
      const requestId = String(payload.request_id);
      const fromOwner = hex32(payload.from_owner);
      const [a, b] = friendPair(c.owner, fromOwner);
      try {
        await env.DB.batch([
          env.DB.prepare(
            "UPDATE friend_requests SET status='accepted', updated_at=? WHERE id=? AND to_owner=? AND status='pending'",
          ).bind(now, requestId, c.owner),
          env.DB.prepare(
            "INSERT OR IGNORE INTO friendships(owner_a,owner_b,created_at) VALUES(?,?,?)",
          ).bind(a, b, now),
        ]);
      } catch {
        throw new HttpError(409, "Could not accept friend request");
      }
    }

    if (c.kind === "friend_decline") {
      const requestId = String(payload.request_id);
      await env.DB.prepare(
        "UPDATE friend_requests SET status='declined', updated_at=? WHERE id=? AND to_owner=? AND status='pending'",
      )
        .bind(now, requestId, c.owner)
        .run();
    }

    if (c.kind === "friend_remove") {
      const target = hex32(payload.target);
      const [a, b] = friendPair(c.owner, target);
      await env.DB.prepare(
        "DELETE FROM friendships WHERE owner_a=? AND owner_b=?",
      )
        .bind(a, b)
        .run();
    }

    if (c.kind === "send_message") {
      const target = hex32(payload.target);
      const text = sanitizeMessage(payload.body);
      if (!(await areFriends(env, c.owner, target)))
        throw new HttpError(403, "Messages are limited to friends");
      await env.DB.prepare(
        "INSERT INTO messages(id,from_owner,to_owner,body,created_at,read_at) VALUES(?,?,?,?,?,NULL)",
      )
        .bind(c.id, c.owner, target, text, now)
        .run();
    }

    await env.DB.prepare("DELETE FROM social_challenges WHERE id=?")
      .bind(c.id)
      .run();
    return Response.json({ ok: true });
  }

  return null;
}

export function socialError(error: unknown): Response | null {
  if (error instanceof HttpError)
    return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof Error && error.message.startsWith("Expected a 32-byte"))
    return Response.json({ error: error.message }, { status: 400 });
  return null;
}
