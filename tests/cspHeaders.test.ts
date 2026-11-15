import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Cloudflare Assets applies public/_headers to every response. The Yard's
 * GLTFLoader turns embedded WebP bufferViews into blob: URLs and fetches
 * them (connect-src), and the bundled meshopt decoder compiles Wasm on the
 * page (script-src 'wasm-unsafe-eval'). The decoder ships inside the app
 * bundle, so a separate hosted .wasm file would not avoid that keyword.
 */
const headers = readFileSync("public/_headers", "utf8");

function cspDirectives(source: string): Map<string, string[]> {
  const match = source.match(/^\s*Content-Security-Policy:\s*(.+)$/m);
  if (!match?.[1]) throw new Error("CSP missing from public/_headers");
  const map = new Map<string, string[]>();
  for (const part of match[1].trim().split(";")) {
    const tokens = part.trim().split(/\s+/);
    const name = tokens.shift();
    if (!name) continue;
    map.set(name, tokens);
  }
  return map;
}

const csp = cspDirectives(headers);

describe("asset response headers", () => {
  it("keeps the non-CSP security headers", () => {
    expect(headers).toContain("X-Content-Type-Options: nosniff");
    expect(headers).toContain(
      "Referrer-Policy: strict-origin-when-cross-origin",
    );
    expect(headers).toContain("X-Frame-Options: DENY");
  });

  it("allows meshopt Wasm compile without opening eval", () => {
    expect(csp.get("script-src")).toEqual([
      "'self'",
      "blob:",
      "'wasm-unsafe-eval'",
    ]);
  });

  it("allows GLTFLoader to fetch embedded textures from blob URLs", () => {
    expect(csp.get("connect-src")).toEqual([
      "'self'",
      "https://boing.express",
      "blob:",
    ]);
    expect(csp.get("img-src")).toEqual(["'self'", "data:", "blob:"]);
  });

  it("does not loosen the rest of the policy", () => {
    expect([...csp.keys()]).toEqual([
      "default-src",
      "script-src",
      "worker-src",
      "style-src",
      "font-src",
      "connect-src",
      "img-src",
      "frame-ancestors",
      "base-uri",
      "form-action",
    ]);
    expect(csp.get("default-src")).toEqual(["'self'"]);
    expect(csp.get("worker-src")).toEqual(["'self'", "blob:"]);
    expect(csp.get("style-src")).toEqual([
      "'self'",
      "https://fonts.googleapis.com",
    ]);
    expect(csp.get("font-src")).toEqual([
      "'self'",
      "https://fonts.gstatic.com",
    ]);
    expect(csp.get("frame-ancestors")).toEqual(["'none'"]);
    expect(csp.get("base-uri")).toEqual(["'self'"]);
    expect(csp.get("form-action")).toEqual(["'self'"]);
    const flat = [...csp.values()].flat();
    expect(flat).not.toContain("'unsafe-eval'");
    expect(flat).not.toContain("'unsafe-inline'");
    expect(flat).not.toContain("*");
  });
});
