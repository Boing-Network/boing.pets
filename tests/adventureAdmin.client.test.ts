import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..");
const dist = join(root, "dist");

const SOURCE_FORBIDDEN = [
  /MULTI_TOKEN_ADMIN_SECRET_KEY/,
  /parseKeyFile\s*\(/,
  /Load the operator key file/,
  /adminAdventuresPage/,
  /ed\.signAsync/,
];

const BUNDLE_FORBIDDEN = [
  /MULTI_TOKEN_ADMIN_SECRET_KEY/,
  /Boing Pets adventure admin v1/,
  /parseKeyFile/,
  /Load the operator key file/,
  /adminAdventuresPage/,
];

function walk(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".git") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, acc);
    else acc.push(path);
  }
  return acc;
}

describe("adventure admin stays off the client", () => {
  it("has no client source that loads or signs with the operator key", () => {
    const hits: string[] = [];
    const files = walk(join(root, "src")).filter((path) =>
      [".ts", ".tsx", ".js", ".mjs", ".html", ".css"].includes(extname(path)),
    );
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const pattern of SOURCE_FORBIDDEN) {
        if (pattern.test(text)) {
          hits.push(`${relative(root, file)} matches ${pattern}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });

  it("does not ship browser key loading or admin signing in the client bundle", () => {
    expect(
      existsSync(dist),
      "dist/ is missing; run npm run build (npm run verify builds first)",
    ).toBe(true);

    const hits: string[] = [];
    for (const file of walk(dist)) {
      if (![".js", ".mjs", ".css", ".html", ".map"].includes(extname(file))) {
        continue;
      }
      const text = readFileSync(file, "utf8");
      for (const pattern of BUNDLE_FORBIDDEN) {
        if (pattern.test(text)) {
          hits.push(`${relative(root, file)} matches ${pattern}`);
        }
      }
    }
    expect(hits).toEqual([]);

    const adminPage = join(dist, "admin-adventures.html");
    expect(existsSync(adminPage)).toBe(true);
    const html = readFileSync(adminPage, "utf8");
    expect(html).toMatch(/npm run admin:adventures/);
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<form/i);
    expect(html).not.toMatch(/<input/i);
    expect(html).not.toMatch(/<style/i);
    expect(html).toMatch(
      /<link\s+rel=["']stylesheet["']\s+href=["']\/admin-adventures\.css["']\s*\/>/i,
    );
    expect(existsSync(join(root, "public", "admin-adventures.css"))).toBe(true);
    expect(existsSync(join(dist, "admin-adventures.css"))).toBe(true);
    const css = readFileSync(join(dist, "admin-adventures.css"), "utf8");
    expect(css).toMatch(/color-scheme:\s*dark/);
    expect(css).toMatch(/background:\s*#0a0a0a/);
  });
});
