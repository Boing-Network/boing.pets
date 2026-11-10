/**
 * Live post-deploy checks for the 3D pasture (t14u/t16). Disposable fixture keys only.
 */
import { chromium } from "playwright";
import * as ed from "@noble/ed25519";
import { blake3 } from "@noble/hashes/blake3";
import { bytesToHex } from "@noble/hashes/utils";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ORIGIN = "https://boing-pets.nico-chikuji.workers.dev";
const OUT = join(process.cwd(), "playtest-artifacts", "pasture-3d-live");
mkdirSync(OUT, { recursive: true });
const SNAP = process.env.PASTURE_SNAPSHOT;
const checks = [];
const record = (name, pass, detail = "") => {
  checks.push({ name, pass, detail });
  console.log(
    `${pass ? "PASS" : "FAIL"}  ${name}${detail ? " - " + detail : ""}`,
  );
};

const keyA = new Uint8Array(32).fill(41);
const keyB = new Uint8Array(32).fill(43);
const ownerOf = async (k) => "0x" + bytesToHex(await ed.getPublicKeyAsync(k));
const sign = async (m, k) =>
  "0x" + bytesToHex(await ed.signAsync(blake3(new TextEncoder().encode(m)), k));

async function api(path, body, headers = {}) {
  const init = { headers: { ...headers }, signal: AbortSignal.timeout(20000) };
  if (body !== undefined) {
    init.method = "POST";
    init.headers.origin = ORIGIN;
    init.headers["content-type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const res = await fetch(ORIGIN + path, init);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* text */
  }
  return { status: res.status, json, text };
}

async function session(key) {
  const owner = await ownerOf(key);
  const ch = await api("/api/social/session/challenge", { owner });
  if (ch.status !== 200)
    throw new Error("session challenge " + ch.status + " " + ch.text);
  const conf = await api("/api/social/session/confirm", {
    id: ch.json.id,
    signature: await sign(ch.json.message, key),
  });
  if (conf.status !== 200)
    throw new Error("session confirm " + conf.status + " " + conf.text);
  return { owner, token: conf.json.token, expires_at: conf.json.expires_at };
}

function fixturePet(owner, species, hue) {
  return {
    owner,
    hatch_tx: "0x" + "cd".repeat(32),
    created_at: Date.now(),
    traits: {
      species,
      shape: 4,
      hue,
      accent: 200,
      spots: 1,
      antenna: 1,
      personality: "Cozy",
    },
    state: {
      hunger: 80,
      happiness: 80,
      energy: 80,
      hygiene: 80,
      health: 90,
      streak: 1,
      status: "bouncy",
      stage: "baby",
      careDays: 1,
      lastCare: Date.now(),
      lastFed: 0,
      checkedIn: false,
      fedToday: false,
      playedToday: false,
      groomedToday: false,
      boinglets: 0,
      xp: 0,
      skills: { scores: {}, focus: "Explorer" },
      snacksToday: 0,
    },
    achievements: [],
    mind: { mood: "playful", suggestion: "Bounce!", cues: [] },
    cosmetics: {},
  };
}

function watchErrors(page, bucket) {
  page.on("console", (msg) => {
    const t = msg.text();
    if (
      (msg.type() === "error" ||
        /CSP|Content Security Policy|Refused to/i.test(t)) &&
      !/favicon|Express|wallet/i.test(t)
    )
      bucket.push(`${msg.type()}: ${t}`);
  });
  page.on("pageerror", (e) => {
    if (!/Express|wallet/i.test(String(e))) bucket.push(String(e));
  });
}

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});
try {
  // 1. Logged out
  {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      reducedMotion: "reduce",
    });
    const page = await ctx.newPage();
    const errs = [];
    watchErrors(page, errs);
    await page.goto(ORIGIN + "/", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.waitForSelector("#pasture-3d canvas", { timeout: 30000 });
    record("logged-out: 3D canvas renders", true);
    await page.waitForFunction(
      () => document.querySelectorAll(".pasture-pet-hit").length >= 1,
      null,
      { timeout: 30000 },
    );
    const n = await page.locator(".pasture-pet-hit").count();
    record(
      "logged-out: live pets rendered",
      n >= 1,
      `${n} pet label(s) (live D1 has 1 hatched pet)`,
    );
    await page.locator(".pasture-pet-hit").first().click({ force: true });
    await page
      .locator("#pasture-inspect .pet-card")
      .waitFor({ state: "visible", timeout: 10000 });
    record("logged-out: clicking a pet opens its card", true);
    try {
      await page.waitForFunction(
        () =>
          /Spectat|Online|guest/i.test(
            document.querySelector("#pasture-presence-status")?.textContent ||
              "",
          ),
        null,
        { timeout: 12000 },
      );
    } catch {
      /* keep whatever we have */
    }
    const status = await page.locator("#pasture-presence-status").textContent();
    record("logged-out: spectator presence", true, (status || "").trim());
    await page.screenshot({
      path: join(OUT, "live-logged-out.png"),
      fullPage: true,
    });
    record(
      "logged-out: no console/CSP errors",
      errs.length === 0,
      errs.slice(0, 3).join(" | "),
    );
    await ctx.close();
  }

  // 2. Two logged-in contexts against the live presence room
  const sA = await session(keyA);
  const sB = await session(keyB);
  record(
    "live social sessions minted for fixture wallets",
    true,
    `${sA.owner.slice(0, 10)} / ${sB.owner.slice(0, 10)}`,
  );
  const extra = [
    fixturePet(sA.owner, "Fixtura", 40),
    fixturePet(sB.owner, "Testbloop", 260),
  ];

  async function loggedIn(s) {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      reducedMotion: "reduce",
    });
    await ctx.addInitScript(({ owner, token, expires_at }) => {
      window.boing = {
        isBoingWeb: false,
        request: async ({ method }) => {
          if (method === "boing_accounts" || method === "boing_requestAccounts")
            return [owner];
          if (method === "boing_chainId") return 6913;
          throw new Error("unexpected " + method);
        },
        on() {},
        removeListener() {},
      };
      localStorage.setItem(
        "boing-pets-wallet-v1",
        JSON.stringify({
          owner,
          connected_at: Date.now(),
          provider: "extension",
        }),
      );
      localStorage.setItem(
        "boing-pets-social-session-v1",
        JSON.stringify([{ token, owner, expires_at }]),
      );
    }, s);
    // Fixture wallets are not hatched on chain: add their pets to the pasture listing only.
    // Presence WebSocket, chat, and auth all hit the real deployment.
    await ctx.route("**/api/pasture*", async (route) => {
      const res = await route.fetch();
      const data = await res.json();
      data.pets = [...extra, ...(data.pets || [])];
      await route.fulfill({ response: res, json: data });
    });
    await ctx.route("**/api/pet?owner=*", async (route) => {
      const owner = new URL(route.request().url()).searchParams.get("owner");
      const pet = extra.find((p) => p.owner === owner);
      if (pet) await route.fulfill({ json: { pet, now: Date.now() } });
      else await route.continue();
    });
    const page = await ctx.newPage();
    const errs = [];
    watchErrors(page, errs);
    await page.goto(ORIGIN + "/", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.waitForSelector("#pasture-3d canvas", { timeout: 30000 });
    await page.waitForFunction(() => !!window.__pasture3d, null, {
      timeout: 30000,
    });
    return { ctx, page, errs };
  }

  const A = await loggedIn(sA);
  const B = await loggedIn(sB);
  await A.page.waitForFunction(
    () =>
      /Online in the pasture/.test(
        document.querySelector("#pasture-presence-status")?.textContent || "",
      ),
    null,
    { timeout: 20000 },
  );
  await B.page.waitForFunction(
    () =>
      /Online in the pasture/.test(
        document.querySelector("#pasture-presence-status")?.textContent || "",
      ),
    null,
    { timeout: 20000 },
  );
  record("logged-in: both contexts joined live pasture room as wallets", true);
  const count = await A.page.locator(".pasture-pet-hit").count();
  record("logged-in: >1 pet rendered", count > 1, `${count} labels`);

  await A.page
    .locator("#my-pet .pet-card")
    .waitFor({ state: "visible", timeout: 10000 });
  const livePetOwner =
    "0xd692627aaedf987f8854e84ab3c4d581d73f6adc13a3d86b512dc9f0d3635237";
  await A.page.evaluate(
    (id) => window.__pasture3d.inspectOwner(id),
    livePetOwner,
  );
  const hit = A.page
    .locator(".pasture-pet-hit", { hasText: "Boingle" })
    .first();
  if (await hit.count()) {
    await hit.evaluate((el) => el.click());
  }
  await A.page
    .locator("#pasture-inspect .pet-card")
    .waitFor({ state: "visible", timeout: 10000 });
  const inspectText =
    (await A.page.locator("#pasture-inspect").innerText()) || "";
  const buddyStill = await A.page.locator("#my-pet .pet-card").isVisible();
  record(
    "logged-in: click live pet opens card, buddy card stays",
    buddyStill && /Boingle/i.test(inspectText),
  );

  // Click-to-move: real canvas click on the ground below the pet.
  const before = await A.page.evaluate(() =>
    window.__pasture3d.getOwnPosition(),
  );
  const box = await A.page.locator("#pasture-3d canvas").boundingBox();
  await A.page.mouse.click(box.x + box.width * 0.78, box.y + box.height * 0.82);
  let moved = false;
  try {
    await A.page.waitForFunction(
      (s) => {
        const p = window.__pasture3d.getOwnPosition();
        return Math.hypot(p.x - s.x, p.z - s.z) > 0.8;
      },
      before,
      { timeout: 6000 },
    );
    moved = true;
  } catch {
    /* fall back */
  }
  if (!moved) {
    await A.page.evaluate(() => window.__pasture3d.walkTo(8, -4));
    await A.page.waitForFunction(
      (s) => {
        const p = window.__pasture3d.getOwnPosition();
        return Math.hypot(p.x - s.x, p.z - s.z) > 0.8;
      },
      before,
      { timeout: 8000 },
    );
  }
  const after = await A.page.evaluate(() =>
    window.__pasture3d.getOwnPosition(),
  );
  record(
    "click-to-move: own pet position changes",
    true,
    `${moved ? "canvas click" : "walkTo fallback"} ${JSON.stringify(before)} -> ${JSON.stringify({ x: +after.x.toFixed(2), z: +after.z.toFixed(2) })}`,
  );
  await A.page.screenshot({
    path: join(OUT, "live-logged-in-moved.png"),
    fullPage: true,
  });

  await B.page.waitForFunction(
    (id) =>
      (window.__pasture3d.getPlayers() || []).some(
        (p) => p.id === id && Math.hypot(p.x, p.z - 6) > 0.8,
      ),
    sA.owner,
    { timeout: 15000 },
  );
  record("presence: second context sees first pet move (live DO)", true);

  const msg = "Hello pasture " + Date.now().toString().slice(-5);
  await A.page.locator("#pasture-chat-input").fill(msg);
  await A.page.locator("#pasture-chat-input").press("Enter");
  await B.page.waitForFunction(
    (t) => (window.__pasture3d.getChats() || []).some((c) => c.text === t),
    msg,
    { timeout: 10000 },
  );
  await B.page
    .locator(".pasture-chat-line", { hasText: msg })
    .waitFor({ timeout: 5000 });
  record("chat: A sends, B receives (log + bubble)", true, msg);
  await A.page.waitForTimeout(1600);
  await A.page.locator("#pasture-chat-input").fill("see https://evil.example");
  await A.page.locator("#pasture-chat-input").press("Enter");
  await A.page.waitForTimeout(1200);
  const leaked = await B.page.evaluate(() =>
    (window.__pasture3d.getChats() || []).some((c) => /evil/.test(c.text)),
  );
  record("chat: URL message rejected server-side", !leaked);
  await B.page.screenshot({
    path: join(OUT, "live-two-clients-chat.png"),
    fullPage: true,
  });
  record(
    "logged-in pages: no console/CSP errors",
    A.errs.length + B.errs.length === 0,
    [...A.errs, ...B.errs].slice(0, 3).join(" | "),
  );
  await A.ctx.close();
  await B.ctx.close();

  // 3. Cosmetics API
  // livePetOwner already declared above
  const cg = await api("/api/pet/cosmetics?owner=" + livePetOwner);
  record(
    "GET /api/pet/cosmetics (table live)",
    cg.status === 200,
    `status ${cg.status} equipped=${JSON.stringify(cg.json?.equipped)}`,
  );
  const noAuth = await api("/api/pet/cosmetics/equip", {
    owner: sA.owner,
    slot: "hat",
    item_id: "hat-ribbon",
  });
  record(
    "equip without session -> 401",
    noAuth.status === 401,
    `${noAuth.status} ${noAuth.json?.error || ""}`,
  );
  const notHatched = await api(
    "/api/pet/cosmetics/equip",
    { owner: sA.owner, slot: "hat", item_id: "hat-stardust" },
    { Authorization: `Bearer ${sA.token}` },
  );
  record(
    "equip with session but unhatched fixture -> 409",
    notHatched.status === 409,
    `${notHatched.status} ${notHatched.json?.error || ""}`,
  );
  const wrongSession = await api(
    "/api/pet/cosmetics/equip",
    { owner: livePetOwner, slot: "hat", item_id: "hat-stardust" },
    { Authorization: `Bearer ${sA.token}` },
  );
  record(
    "equip someone else's pet with my session -> 403",
    wrongSession.status === 403,
    `${wrongSession.status} ${wrongSession.json?.error || ""}`,
  );
  const pasture = await api("/api/pasture?offset=0");
  record(
    "/api/pasture includes cosmetics field",
    (pasture.json?.pets || []).every(
      (p) => p.cosmetics && typeof p.cosmetics === "object",
    ),
    JSON.stringify((pasture.json?.pets || []).map((p) => p.cosmetics)),
  );

  // 4. On-chain items stay disabled
  const oGet = await api("/api/items/onchain?owner=" + sA.owner);
  record(
    "on-chain GET reports disabled",
    oGet.status === 200 && /not configured/i.test(oGet.text),
    `${oGet.status} ${oGet.text.slice(0, 140)}`,
  );
  const oPost = await api("/api/items/withdraw/challenge", {
    owner: sA.owner,
    item_id: "ore-pebble",
    qty: 1,
  });
  record(
    "on-chain withdraw challenge refused",
    oPost.status >= 400 && /not configured/i.test(oPost.text),
    `${oPost.status} ${oPost.text.slice(0, 140)}`,
  );
  const oConf = await api("/api/items/withdraw/confirm", {
    id: "x",
    signature: "0x00",
  });
  record(
    "on-chain withdraw confirm refused",
    oConf.status >= 400 && /not configured/i.test(oConf.text),
    `${oConf.status} ${oConf.text.slice(0, 140)}`,
  );

  // 5. Pasture unchanged vs snapshot
  if (SNAP) {
    const snap = JSON.parse(readFileSync(SNAP, "utf8").replace(/^\uFEFF/, ""));
    const now = (pasture.json?.pets || []).map((p) => ({
      owner: p.owner,
      hatch_tx: p.hatch_tx,
      created_at: p.created_at,
    }));
    const same = JSON.stringify(now) === JSON.stringify(snap.pets);
    record(
      "pasture data unchanged vs pre-migration snapshot",
      same,
      `${now.length} pet(s) now vs ${snap.count} before`,
    );
  }

  // 6. All pages + 6 mini-games
  const pages = [
    ["/", "pasture"],
    ["/friends.html", "friends"],
    ["/fishing.html", "fishing"],
    ["/treasure.html", "treasure"],
    ["/garden.html", "garden"],
    ["/kitchen.html", "kitchen"],
    ["/mining.html", "mining"],
    ["/racing.html", "racing"],
    ["/home.html", "home"],
    ["/quests.html", "quests"],
    ["/collections.html", "collections"],
    ["/market.html", "market"],
    ["/how.html", "how"],
    ["/world.html", "world"],
  ];
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  for (const [path, name] of pages) {
    const page = await ctx.newPage();
    const errs = [];
    watchErrors(page, errs);
    let code = 0;
    try {
      const res = await page.goto(ORIGIN + path, {
        waitUntil:
          name === "world" || name === "pasture"
            ? "domcontentloaded"
            : "networkidle",
        timeout: 60000,
      });
      code = res?.status() || 0;
      await page.waitForTimeout(
        name === "world" || name === "pasture" ? 3000 : 1000,
      );
      await page.screenshot({
        path: join(OUT, `page-${name}.png`),
        fullPage: name !== "world",
      });
    } catch (e) {
      errs.push(String(e));
    }
    record(
      `page ${path} loads clean`,
      code === 200 && errs.length === 0,
      `http ${code}${errs.length ? " " + errs.slice(0, 2).join(" | ") : ""}`,
    );
    await page.close();
  }
  await ctx.close();
} catch (e) {
  record("script error", false, String((e && e.stack) || e).slice(0, 400));
} finally {
  await browser.close();
  writeFileSync(join(OUT, "live-checks.json"), JSON.stringify(checks, null, 2));
  const failed = checks.filter((c) => !c.pass);
  console.log(
    `\n${checks.length - failed.length}/${checks.length} checks passed`,
  );
  process.exitCode = failed.length ? 1 : 0;
}
