import type { WorldPoint } from "../config/zones";

export interface RemotePosition {
  owner: string;
  zone: string;
  x: number;
  y: number;
  z: number;
  updated_at: number;
}

async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(
    path,
    body
      ? {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }
      : undefined,
  );
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "World sync unavailable");
  return data as T;
}

export async function fetchRemotePosition(
  owner: string,
): Promise<RemotePosition | null> {
  const data = await api<{ position: RemotePosition | null }>(
    "/api/world/position?owner=" + encodeURIComponent(owner),
  );
  return data.position;
}

export async function syncRemotePosition(args: {
  owner: string;
  zone: string;
  position: WorldPoint;
  sign: (message: string) => Promise<string>;
}): Promise<void> {
  const challenge = await api<{ id: string; message: string }>(
    "/api/world/position/challenge",
    {
      owner: args.owner,
      zone: args.zone,
      x: args.position.x,
      y: args.position.y,
      z: args.position.z,
    },
  );
  const signature = await args.sign(challenge.message);
  await api("/api/world/position/confirm", {
    id: challenge.id,
    signature,
  });
}
