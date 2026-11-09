import * as ed from "@noble/ed25519";
import { blake3 } from "@noble/hashes/blake3";
import { hexToBytes } from "@noble/hashes/utils";
import { hex32 } from "../src/core";
import {
  friendPair,
  isSocialKind,
  PARTY_SIZE_MAX,
  sanitizeDisplayName,
  sanitizeMessage,
  type SocialKind,
} from "../src/social";
import { partyBonusPercent } from "../src/partyBonus";

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

async function requireSocialSession(
  req: Request,
  env: Env,
  owner: string,
  now: number,
) {
  const header = req.headers.get("Authorization") || "";
  const match = /^Bearer\s+([A-Za-z0-9_-]{8,128})$/i.exec(header);
  const token =
    match?.[1] ||
    (typeof new URL(req.url).searchParams.get("session") === "string"
      ? new URL(req.url).searchParams.get("session")
      : null);
  if (!token || token.length > 128)
    throw new HttpError(
      401,
      "Social read session required. Sign a social session challenge first.",
    );
  await env.DB.prepare("DELETE FROM social_session_tokens WHERE expires_at<?")
    .bind(now)
    .run();
  const row = await env.DB.prepare(
    "SELECT owner,expires_at FROM social_session_tokens WHERE token=?",
  )
    .bind(token)
    .first<{ owner: string; expires_at: number }>();
  if (!row || row.expires_at < now)
    throw new HttpError(401, "Social session expired. Sign in again.");
  if (row.owner !== owner)
    throw new HttpError(403, "Social session does not match this wallet");
}

async function issueSocialSession(env: Env, owner: string, now: number) {
  const count = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM social_session_challenges WHERE owner=? AND created_at>?",
  )
    .bind(owner, now - 60_000)
    .first<{ n: number }>();
  if ((count?.n || 0) >= 8)
    throw new HttpError(
      429,
      "Too many social session requests. Try again shortly.",
    );
  await env.DB.prepare(
    "DELETE FROM social_session_challenges WHERE expires_at<?",
  )
    .bind(now)
    .run();
  const id = crypto.randomUUID();
  const expires = now + 10 * 60_000;
  const message = `Boing Pets social session v1\nOrigin: ${env.APP_ORIGIN}\nChain: 6913\nOwner: ${owner}\nNonce: ${id}\nExpires: ${expires}`;
  await env.DB.prepare(
    "INSERT INTO social_session_challenges(id,owner,message,created_at,expires_at) VALUES(?,?,?,?,?)",
  )
    .bind(id, owner, message, now, expires)
    .run();
  return { id, owner, message, expires_at: expires };
}

async function profileName(env: Env, owner: string): Promise<string | null> {
  const row = await env.DB.prepare(
    "SELECT display_name FROM profiles WHERE owner=?",
  )
    .bind(owner)
    .first<{ display_name: string }>();
  return row?.display_name ?? null;
}

async function membershipOf(env: Env, owner: string) {
  return env.DB.prepare("SELECT party_id,role FROM party_members WHERE owner=?")
    .bind(owner)
    .first<{ party_id: string; role: string }>();
}

async function partySize(env: Env, partyId: string) {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM party_members WHERE party_id=?",
  )
    .bind(partyId)
    .first<{ n: number }>();
  return row?.n || 0;
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
    await requireSocialSession(req, env, owner, now);
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
    await requireSocialSession(req, env, owner, now);
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
    await requireSocialSession(req, env, owner, now);
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

  if (url.pathname === "/api/social/party") {
    const owner = hex32(url.searchParams.get("owner"));
    await requireSocialSession(req, env, owner, now);
    const membership = await membershipOf(env, owner);
    if (!membership) {
      return Response.json({
        party: null,
        maxSize: PARTY_SIZE_MAX,
        now,
      });
    }
    const party = await env.DB.prepare(
      "SELECT id,leader,status,created_at FROM parties WHERE id=? AND status='open'",
    )
      .bind(membership.party_id)
      .first<{
        id: string;
        leader: string;
        status: string;
        created_at: number;
      }>();
    if (!party) {
      return Response.json({ party: null, maxSize: PARTY_SIZE_MAX, now });
    }
    const members = await env.DB.prepare(
      "SELECT owner,role,joined_at FROM party_members WHERE party_id=? ORDER BY joined_at",
    )
      .bind(party.id)
      .all<{ owner: string; role: string; joined_at: number }>();
    return Response.json({
      party: {
        ...party,
        members: await Promise.all(
          members.results.map(async (m) => ({
            ...m,
            display_name: await profileName(env, m.owner),
          })),
        ),
      },
      maxSize: PARTY_SIZE_MAX,
      bonusPercent: partyBonusPercent(members.results.length, false),
      togetherBonusPercent: partyBonusPercent(members.results.length, true),
      now,
    });
  }

  if (url.pathname === "/api/social/party/invites") {
    const owner = hex32(url.searchParams.get("owner"));
    await requireSocialSession(req, env, owner, now);
    const incoming = await env.DB.prepare(
      `SELECT id,party_id,from_owner,to_owner,status,created_at FROM party_invites
       WHERE to_owner=? AND status='pending' ORDER BY created_at DESC LIMIT 50`,
    )
      .bind(owner)
      .all<{
        id: string;
        party_id: string;
        from_owner: string;
        to_owner: string;
        status: string;
        created_at: number;
      }>();
    return Response.json({
      incoming: await Promise.all(
        incoming.results.map(async (r) => ({
          ...r,
          from_name: await profileName(env, r.from_owner),
        })),
      ),
      maxSize: PARTY_SIZE_MAX,
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
  if (url.pathname === "/api/social/session/challenge") {
    const owner = hex32(body.owner);
    return Response.json(await issueSocialSession(env, owner, now));
  }
  if (url.pathname === "/api/social/session/confirm") {
    if (typeof body.id !== "string" || body.id.length > 64)
      throw new HttpError(400, "Invalid social session challenge");
    const c = await env.DB.prepare(
      "SELECT * FROM social_session_challenges WHERE id=?",
    )
      .bind(body.id)
      .first<{
        id: string;
        owner: string;
        message: string;
        expires_at: number;
      }>();
    if (!c) throw new HttpError(404, "Social session challenge not found");
    if (c.expires_at < now)
      throw new HttpError(410, "Social session challenge expired");
    await verifySignature(c.owner, c.message, body.signature);
    await env.DB.prepare("DELETE FROM social_session_tokens WHERE expires_at<?")
      .bind(now)
      .run();
    await env.DB.prepare("DELETE FROM social_session_tokens WHERE owner=?")
      .bind(c.owner)
      .run();
    const token = crypto.randomUUID();
    const tokenExpires = now + 15 * 60_000;
    await env.DB.prepare(
      "INSERT INTO social_session_tokens(token,owner,created_at,expires_at) VALUES(?,?,?,?)",
    )
      .bind(token, c.owner, now, tokenExpires)
      .run();
    await env.DB.prepare("DELETE FROM social_session_challenges WHERE id=?")
      .bind(c.id)
      .run();
    return Response.json({
      ok: true,
      token,
      owner: c.owner,
      expires_at: tokenExpires,
    });
  }
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
      if (target === owner) throw new HttpError(400, "Cannot friend yourself");
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
      return Response.json(await issue(env, owner, kind, { target }, now));
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
      return Response.json(await issue(env, owner, kind, { target }, now));
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

    if (kind === "party_create") {
      if (await membershipOf(env, owner))
        throw new HttpError(409, "Already in a party");
      return Response.json(await issue(env, owner, kind, {}, now));
    }

    if (kind === "party_invite") {
      const target = hex32(body.target);
      const membership = await membershipOf(env, owner);
      if (!membership || membership.role !== "leader")
        throw new HttpError(403, "Only the party leader can invite");
      if (target === owner) throw new HttpError(400, "Cannot invite yourself");
      if (!(await areFriends(env, owner, target)))
        throw new HttpError(403, "Party invites are limited to friends");
      if (await membershipOf(env, target))
        throw new HttpError(409, "That friend is already in a party");
      if ((await partySize(env, membership.party_id)) >= PARTY_SIZE_MAX)
        throw new HttpError(409, "Party is full");
      const pending = await env.DB.prepare(
        "SELECT status FROM party_invites WHERE party_id=? AND to_owner=?",
      )
        .bind(membership.party_id, target)
        .first<{ status: string }>();
      if (pending?.status === "pending")
        throw new HttpError(409, "Invite already pending");
      return Response.json(
        await issue(
          env,
          owner,
          kind,
          { target, party_id: membership.party_id },
          now,
        ),
      );
    }

    if (kind === "party_accept" || kind === "party_decline") {
      const inviteId = String(body.invite_id || "");
      if (!inviteId || inviteId.length > 64)
        throw new HttpError(400, "Invalid invite id");
      const invite = await env.DB.prepare(
        "SELECT * FROM party_invites WHERE id=? AND to_owner=? AND status='pending'",
      )
        .bind(inviteId, owner)
        .first<{ id: string; party_id: string; from_owner: string }>();
      if (!invite) throw new HttpError(404, "Party invite not found");
      if (kind === "party_accept") {
        if (await membershipOf(env, owner))
          throw new HttpError(409, "Already in a party");
        if ((await partySize(env, invite.party_id)) >= PARTY_SIZE_MAX)
          throw new HttpError(409, "Party is full");
      }
      return Response.json(
        await issue(
          env,
          owner,
          kind,
          {
            invite_id: invite.id,
            party_id: invite.party_id,
            from_owner: invite.from_owner,
          },
          now,
        ),
      );
    }

    if (kind === "party_leave") {
      const membership = await membershipOf(env, owner);
      if (!membership) throw new HttpError(409, "Not in a party");
      return Response.json(
        await issue(
          env,
          owner,
          kind,
          { party_id: membership.party_id, role: membership.role },
          now,
        ),
      );
    }
  }

  if (url.pathname === "/api/social/confirm") {
    if (typeof body.id !== "string" || body.id.length > 64)
      throw new HttpError(400, "Invalid social challenge");
    const c = await env.DB.prepare("SELECT * FROM social_challenges WHERE id=?")
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

    if (c.kind === "party_create") {
      if (await membershipOf(env, c.owner))
        throw new HttpError(409, "Already in a party");
      try {
        await env.DB.batch([
          env.DB.prepare(
            "INSERT INTO parties(id,leader,status,created_at,updated_at) VALUES(?,?,'open',?,?)",
          ).bind(c.id, c.owner, now, now),
          env.DB.prepare(
            "INSERT INTO party_members(party_id,owner,role,joined_at) VALUES(?,?,?,?)",
          ).bind(c.id, c.owner, "leader", now),
        ]);
      } catch {
        throw new HttpError(409, "Could not create party");
      }
    }

    if (c.kind === "party_invite") {
      const target = hex32(payload.target);
      const partyId = String(payload.party_id);
      await env.DB.prepare(
        `INSERT INTO party_invites(id,party_id,from_owner,to_owner,status,created_at,updated_at)
         VALUES(?,?,?,?,'pending',?,?)
         ON CONFLICT(party_id,to_owner) DO UPDATE SET
           id=excluded.id, from_owner=excluded.from_owner, status='pending', updated_at=excluded.updated_at`,
      )
        .bind(c.id, partyId, c.owner, target, now, now)
        .run();
    }

    if (c.kind === "party_accept") {
      const inviteId = String(payload.invite_id);
      const partyId = String(payload.party_id);
      if (await membershipOf(env, c.owner))
        throw new HttpError(409, "Already in a party");
      if ((await partySize(env, partyId)) >= PARTY_SIZE_MAX)
        throw new HttpError(409, "Party is full");
      try {
        await env.DB.batch([
          env.DB.prepare(
            "UPDATE party_invites SET status='accepted', updated_at=? WHERE id=? AND to_owner=? AND status='pending'",
          ).bind(now, inviteId, c.owner),
          env.DB.prepare(
            "INSERT INTO party_members(party_id,owner,role,joined_at) VALUES(?,?,?,?)",
          ).bind(partyId, c.owner, "member", now),
          env.DB.prepare("UPDATE parties SET updated_at=? WHERE id=?").bind(
            now,
            partyId,
          ),
        ]);
      } catch {
        throw new HttpError(409, "Could not join party");
      }
    }

    if (c.kind === "party_decline") {
      const inviteId = String(payload.invite_id);
      await env.DB.prepare(
        "UPDATE party_invites SET status='declined', updated_at=? WHERE id=? AND to_owner=? AND status='pending'",
      )
        .bind(now, inviteId, c.owner)
        .run();
    }

    if (c.kind === "party_leave") {
      const partyId = String(payload.party_id);
      const role = String(payload.role);
      await env.DB.prepare(
        "DELETE FROM party_members WHERE party_id=? AND owner=?",
      )
        .bind(partyId, c.owner)
        .run();
      const remaining = await env.DB.prepare(
        "SELECT owner,role,joined_at FROM party_members WHERE party_id=? ORDER BY joined_at",
      )
        .bind(partyId)
        .all<{ owner: string; role: string; joined_at: number }>();
      if (!remaining.results.length) {
        await env.DB.batch([
          env.DB.prepare(
            "UPDATE parties SET status='disbanded', updated_at=? WHERE id=?",
          ).bind(now, partyId),
          env.DB.prepare(
            "UPDATE party_invites SET status='cancelled', updated_at=? WHERE party_id=? AND status='pending'",
          ).bind(now, partyId),
        ]);
      } else if (role === "leader") {
        const next = remaining.results[0]!;
        await env.DB.batch([
          env.DB.prepare(
            "UPDATE party_members SET role='leader' WHERE party_id=? AND owner=?",
          ).bind(partyId, next.owner),
          env.DB.prepare(
            "UPDATE parties SET leader=?, updated_at=? WHERE id=?",
          ).bind(next.owner, now, partyId),
        ]);
      } else {
        await env.DB.prepare("UPDATE parties SET updated_at=? WHERE id=?")
          .bind(now, partyId)
          .run();
      }
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
