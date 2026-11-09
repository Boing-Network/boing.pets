import { apiUnavailableMessage } from "./apiMessages";

export { apiUnavailableMessage };

export type ApiFetchInit = {
  headers?: Record<string, string>;
};

/** Shared fetch helper — never assume the host serves the Cloudflare Worker. */
export async function apiFetch<T>(
  path: string,
  body?: unknown,
  init?: ApiFetchInit,
): Promise<T> {
  let response: Response;
  const headers: Record<string, string> = { ...(init?.headers || {}) };
  try {
    response = await fetch(
      path,
      body
        ? {
            method: "POST",
            headers: { "content-type": "application/json", ...headers },
            body: JSON.stringify(body),
          }
        : Object.keys(headers).length
          ? { headers }
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
