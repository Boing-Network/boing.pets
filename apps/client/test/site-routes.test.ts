import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  GAME_QUERY_KEYS,
  SITE_LINKS,
  legacyGameRedirect,
  playHref,
} from "../src/site/routes";

const here = path.dirname(fileURLToPath(import.meta.url));
const client = path.resolve(here, "..");
const repo = path.resolve(client, "../..");
const read = (p: string) => readFileSync(path.resolve(client, p), "utf8");

test("old game links on / go to /world/ with the same query", () => {
  assert.equal(
    legacyGameRedirect("/", "?mp=wss://boing-living-pets.fly.dev&name=A"),
    "/world/?mp=wss://boing-living-pets.fly.dev&name=A",
  );
  assert.equal(legacyGameRedirect("/", "?owner=k"), "/world/?owner=k");
  assert.equal(legacyGameRedirect("/", "?debug"), "/world/?debug");
  assert.equal(
    legacyGameRedirect("/", "?bestiary=fire-fox"),
    "/world/?bestiary=fire-fox",
  );
  assert.equal(legacyGameRedirect("/", "?mp=off"), "/world/?mp=off");
  assert.equal(
    legacyGameRedirect("/index.html", "?mp=local"),
    "/world/?mp=local",
  );
  // Marketing params and other pages stay put.
  assert.equal(legacyGameRedirect("/", ""), null);
  assert.equal(legacyGameRedirect("/", "?utm_source=x"), null);
  assert.equal(legacyGameRedirect("/market/", "?mp=off"), null);
  assert.equal(legacyGameRedirect("/world/", "?mp=off"), null);
});

test("play links go to /world/ and keep game params", () => {
  assert.equal(playHref(""), "/world/");
  assert.equal(playHref("?utm_source=x"), "/world/");
  assert.equal(playHref("?mp=off"), "/world/?mp=off");
});

test("shared nav is Home, Play, Bestiary and Marketplace", () => {
  assert.deepEqual(
    SITE_LINKS.map((l) => [l.label, l.href]),
    [
      ["Home", "/"],
      ["Play", "/world/"],
      ["Bestiary", "/world/?bestiary"],
      ["Marketplace", "/market/"],
    ],
  );
  for (const page of ["index.html", "market/index.html"]) {
    const html = read(page);
    for (const link of SITE_LINKS) {
      assert.ok(html.includes(`href="${link.href}"`), `${page} ${link.href}`);
    }
    // No link back to the old game root or /welcome/.
    assert.ok(!/href="\/welcome\/?"/.test(html), page);
  }
  // Every Play now goes to the world.
  const home = read("index.html");
  for (const m of home.matchAll(/<a[^>]*data-play[^>]*>/g)) {
    assert.ok(m[0].includes('href="/world/"'), m[0]);
  }
  // The inline redirect on / uses the same keys as routes.ts.
  for (const key of GAME_QUERY_KEYS) {
    assert.ok(home.includes(`"${key}"`), key);
  }
});

test("pages: game at world/, marketing at the root", () => {
  assert.ok(read("world/index.html").includes('src="../src/main.tsx"'));
  assert.ok(read("index.html").includes('src="./src/welcome/main.ts"'));
  assert.ok(read("vite.config.ts").includes('"world/index.html"'));
  assert.ok(
    readFileSync(
      path.resolve(repo, "apps/desktop/src/main.ts"),
      "utf8",
    ).includes("apps/client/dist/world/index.html"),
  );
});

test("vercel.json redirects", () => {
  const v = JSON.parse(
    readFileSync(path.resolve(repo, "vercel.json"), "utf8"),
  ) as {
    redirects: {
      source: string;
      destination: string;
      has?: { type: string; key: string }[];
    }[];
  };
  const to = (source: string) =>
    v.redirects.find((r) => r.source === source && r.has == null)?.destination;
  assert.equal(to("/welcome"), "/");
  assert.equal(to("/welcome/"), "/");
  assert.equal(to("/game"), "/world/");
  assert.equal(to("/game/"), "/world/");
  assert.equal(to("/world"), "/world/");
  assert.equal(to("/market"), "/market/");
  for (const key of GAME_QUERY_KEYS) {
    const rule = v.redirects.find(
      (r) =>
        r.source === "/" &&
        r.has?.some((h) => h.type === "query" && h.key === key),
    );
    assert.equal(rule?.destination, "/world/", key);
  }
});
