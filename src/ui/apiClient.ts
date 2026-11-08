import { apiUnavailableMessage } from "./apiMessages";

export { apiUnavailableMessage };

/** Shared fetch helper — never assume the host serves the Cloudflare Worker. */
export async function apiFetch<T>(
  path: string,
  body?: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(
      path,
      body
        ? {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          }
        : undefined,
    );
  } catch {
    throw new Error(apiUnavailableMessage());
  }

  const text = await response.text();
  let data: T & { error?: string };
  try {
    data = JSON.parse(text) as T & { error?: string };
  } catch {
    throw new Error(apiUnavailableMessage(response.status));
  }
  if (!response.ok)
    throw new Error(data.error || apiUnavailableMessage(response.status));
  return data as T;
}
