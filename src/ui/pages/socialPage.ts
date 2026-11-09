import { api, app, $, notice, clearSocialSession } from "../appRuntime";
import {
  loadSocialSession,
  saveSocialSession,
} from "../../social/sessionCache";
import { assertWallet, run } from "../careActions";

export async function ensureSocialSession(): Promise<string> {
  await assertWallet();
  const cached = loadSocialSession(app.owner);
  if (cached) return cached.token;
  notice("Approve a social session signature in Express (read access)…");
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
    owner: string;
    expires_at: number;
  }>("/api/social/session/confirm", { id: challenge.id, signature });
  saveSocialSession({
    token: confirmed.token,
    owner: confirmed.owner,
    expires_at: confirmed.expires_at,
  });
  return confirmed.token;
}

export async function socialApi<T>(path: string): Promise<T> {
  const token = await ensureSocialSession();
  try {
    return await api<T>(path, undefined, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (!/session|401|Sign in again|Social read session/i.test(msg)) throw e;
    clearSocialSession(app.owner);
    const token2 = await ensureSocialSession();
    return api<T>(path, undefined, {
      headers: { Authorization: `Bearer ${token2}` },
    });
  }
}
export async function socialAct(
  kind: string,
  extra: Record<string, unknown> = {},
) {
  await assertWallet();
  notice("Approve the social signature in Express…");
  const challenge = await api<{ id: string; message: string }>(
    "/api/social/challenge",
    { owner: app.owner, kind, ...extra },
  );
  const signature = await app.provider!.request({
    method: "boing_signMessage",
    params: [challenge.message, app.owner],
  });
  await api("/api/social/confirm", { id: challenge.id, signature });
  await refreshSocial();
  notice("Social action confirmed.");
}

export async function openDm(friendOwner: string, label: string) {
  app.dmTarget = friendOwner;
  $("#dm-panel").hidden = false;
  $("#dm-with").textContent = label;
  const data = await socialApi<{
    messages: Array<{
      from_owner: string;
      body: string;
      created_at: number;
    }>;
  }>(`/api/social/messages?app.owner=${app.owner}&with=${friendOwner}`);
  $("#dm-thread").replaceChildren(
    ...data.messages.map((m) => {
      const p = document.createElement("p");
      p.className = "dm-line";
      p.textContent = `${m.from_owner === app.owner ? "You" : "Friend"}: ${m.body}`;
      return p;
    }),
  );
}

export async function refreshSocial() {
  const partyCreate = $("#party-create") as HTMLButtonElement;
  const partyLeave = $("#party-leave") as HTMLButtonElement;
  if (!app.owner) {
    $("#social-summary").textContent =
      "Connect to set a display name, add friends by wallet, and DM.";
    $("#save-profile").hidden = true;
    $("#add-friend").hidden = true;
    $("#friend-requests").textContent = "";
    $("#friends-list").textContent = "";
    $("#party-summary").textContent = "Create a party of up to 4 friends.";
    $("#party-roster").textContent = "";
    $("#party-invites").textContent = "";
    partyCreate.hidden = true;
    partyLeave.hidden = true;
    $("#dm-panel").hidden = true;
    return;
  }
  $("#save-profile").hidden = false;
  $("#add-friend").hidden = false;
  const profile = await api<{
    profile: { display_name: string } | null;
  }>("/api/social/profile?app.owner=" + app.owner);
  if (profile.profile)
    ($("#display-name") as HTMLInputElement).value =
      profile.profile.display_name;
  $("#social-summary").textContent = profile.profile
    ? `Signed in as ${profile.profile.display_name}`
    : "Pick a display name (2–24 chars), then add friends by their 0x wallet.";
  const requests = await socialApi<{
    incoming: Array<{
      id: string;
      from_owner: string;
      from_name: string | null;
    }>;
  }>("/api/social/requests?app.owner=" + app.owner);
  if (!requests.incoming.length) {
    $("#friend-requests").textContent = "No pending requests.";
  } else {
    $("#friend-requests").replaceChildren(
      ...requests.incoming.map((r) => {
        const row = document.createElement("div");
        row.className = "social-row";
        const label = r.from_name || `${r.from_owner.slice(0, 10)}…`;
        const nameEl = document.createElement("span");
        nameEl.textContent = label;
        row.append(nameEl);
        const accept = document.createElement("button");
        accept.className = "secondary";
        accept.textContent = "Accept";
        accept.onclick = () =>
          void run(() => socialAct("friend_accept", { request_id: r.id }));
        const decline = document.createElement("button");
        decline.className = "quiet";
        decline.textContent = "Decline";
        decline.onclick = () =>
          void run(() => socialAct("friend_decline", { request_id: r.id }));
        row.append(accept, decline);
        return row;
      }),
    );
  }
  const friends = await socialApi<{
    friends: Array<{ owner: string; display_name: string | null }>;
  }>("/api/social/friends?app.owner=" + app.owner);
  const party = await socialApi<{
    party: {
      id: string;
      leader: string;
      members: Array<{
        owner: string;
        role: string;
        display_name: string | null;
      }>;
    } | null;
    maxSize: number;
  }>("/api/social/party?app.owner=" + app.owner);
  const partyInvites = await socialApi<{
    incoming: Array<{
      id: string;
      party_id: string;
      from_owner: string;
      from_name: string | null;
    }>;
  }>("/api/social/party/invites?app.owner=" + app.owner);
  const isLeader = party.party?.leader === app.owner;
  const memberOwners = new Set(party.party?.members.map((m) => m.owner) || []);
  if (!friends.friends.length) {
    $("#friends-list").textContent = "No friends yet.";
  } else {
    $("#friends-list").replaceChildren(
      ...friends.friends.map((f) => {
        const row = document.createElement("div");
        row.className = "social-row";
        const label = f.display_name || `${f.owner.slice(0, 10)}…`;
        const nameEl = document.createElement("span");
        nameEl.textContent = label;
        row.append(nameEl);
        const msg = document.createElement("button");
        msg.className = "secondary";
        msg.textContent = "Message";
        msg.onclick = () => void run(() => openDm(f.owner, label));
        const remove = document.createElement("button");
        remove.className = "quiet";
        remove.textContent = "Remove";
        remove.onclick = () =>
          void run(() => socialAct("friend_remove", { target: f.owner }));
        row.append(msg, remove);
        if (
          isLeader &&
          party.party &&
          party.party.members.length < party.maxSize &&
          !memberOwners.has(f.owner)
        ) {
          const invite = document.createElement("button");
          invite.className = "secondary";
          invite.textContent = "Invite";
          invite.onclick = () =>
            void run(() => socialAct("party_invite", { target: f.owner }));
          row.append(invite);
        }
        return row;
      }),
    );
  }
  if (!party.party) {
    $("#party-summary").textContent =
      "No party yet — create one (max 4), then invite friends.";
    $("#party-roster").textContent = "";
    partyCreate.hidden = false;
    partyCreate.disabled = app.busy;
    partyLeave.hidden = true;
  } else {
    $("#party-summary").textContent =
      `Party ${party.party.members.length}/${party.maxSize}${isLeader ? " · you lead" : ""}`;
    $("#party-roster").replaceChildren(
      ...party.party.members.map((m) => {
        const row = document.createElement("div");
        row.className = "social-row";
        const label = m.display_name || `${m.owner.slice(0, 10)}…`;
        const nameEl = document.createElement("span");
        nameEl.textContent = label + (m.role === "leader" ? " ★" : "");
        row.append(nameEl);
        return row;
      }),
    );
    partyCreate.hidden = true;
    partyLeave.hidden = false;
    partyLeave.disabled = app.busy;
  }
  if (!partyInvites.incoming.length) {
    $("#party-invites").textContent = "No party invites.";
  } else {
    $("#party-invites").replaceChildren(
      ...partyInvites.incoming.map((r) => {
        const row = document.createElement("div");
        row.className = "social-row";
        const label = r.from_name || `${r.from_owner.slice(0, 10)}…`;
        const nameEl = document.createElement("span");
        nameEl.textContent = label;
        row.append(nameEl);
        const accept = document.createElement("button");
        accept.className = "secondary";
        accept.textContent = "Accept";
        accept.onclick = () =>
          void run(() => socialAct("party_accept", { invite_id: r.id }));
        const decline = document.createElement("button");
        decline.className = "quiet";
        decline.textContent = "Decline";
        decline.onclick = () =>
          void run(() => socialAct("party_decline", { invite_id: r.id }));
        row.append(accept, decline);
        return row;
      }),
    );
  }
  if (app.dmTarget) {
    const active = friends.friends.find((f) => f.owner === app.dmTarget);
    if (active)
      await openDm(
        app.dmTarget,
        active.display_name || `${app.dmTarget.slice(0, 10)}…`,
      );
    else {
      app.dmTarget = "";
      $("#dm-panel").hidden = true;
    }
  }
}
