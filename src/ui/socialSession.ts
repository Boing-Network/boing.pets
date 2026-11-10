import { api, app, notice, clearSocialSession } from "./appRuntime";
import { loadSocialSession, saveSocialSession } from "../social/sessionCache";

export async function ensureSocialSession(): Promise<string> {
  if (!app.owner) throw new Error("Connect Boing Express first");
  const cached = loadSocialSession(app.owner);
  if (cached?.token) return cached.token;
  notice("Approve a short activity session signature in Express…");
  const challenge = await api<{ id: string; message: string }>(
    "/api/social/session/challenge",
    { owner: app.owner },
  );
  const signature = await app.provider!.request({
    method: "boing_signMessage",
    params: [challenge.message, app.owner],
  });
  const confirmed = await api<{
    token: string;
    expires_at: number;
  }>("/api/social/session/confirm", { id: challenge.id, signature });
  saveSocialSession({
    owner: app.owner,
    token: confirmed.token,
    expires_at: confirmed.expires_at,
  });
  return confirmed.token;
}

export async function sessionApi<T>(path: string, body?: unknown): Promise<T> {
  const token = await ensureSocialSession();
  try {
    return await api<T>(path, body, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (!/session|401|Sign in again|Social read session/i.test(msg)) throw e;
    clearSocialSession(app.owner);
    const token2 = await ensureSocialSession();
    return api<T>(path, body, {
      headers: { Authorization: `Bearer ${token2}` },
    });
  }
}
