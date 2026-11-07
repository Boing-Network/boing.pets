export function originFrom(headers: Headers, url: URL) {
  if (process.env.APP_ORIGIN) return process.env.APP_ORIGIN;
  const forwardedHost = headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || headers.get("host") || url.host;
  const forwarded = headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const local = /^localhost(?::|$)|127\.0\.0\.1(?::|$)|\[::1\](?::|$)/.test(
    host,
  );
  const proto =
    forwarded || (local ? "http" : url.protocol.replace(":", "") || "https");
  return `${proto}://${host}`;
}
