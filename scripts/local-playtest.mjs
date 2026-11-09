/**
 * Local end-to-end playtest against vite (5177) + wrangler local (8787).
 * Uses disposable Ed25519 fixture keys — never a real wallet.
 */
import { chromium } from "playwright";
import * as ed from "@noble/ed25519";
import { blake3 } from "@noble/hashes/blake3";
import { bytesToHex } from "@noble/hashes/utils";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ORIGIN = process.env.PLAYTEST_ORIGIN || "http://localhost:5177";
const OUT =
  process.env.PLAYTEST_OUT || join(process.cwd(), "playtest-artifacts");
mkdirSync(OUT, { recursive: true });

const keyA = new Uint8Array(32).fill(11);
const keyB = new Uint8Array(32).fill(13);
const results = [];

function log(feature, status, detail = "") {
  results.push({ feature, status, detail });
  console.log(`[${status}] ${feature}${detail ? " — " + detail : ""}`);
}

async function signMessage(message, key) {
  const sig = await ed.signAsync(
    blake3(new globalThis.TextEncoder().encode(message)),
    key,
  );
  return "0x" + bytesToHex(sig);
}

async function ownerOf(key) {
  return "0x" + bytesToHex(await ed.getPublicKeyAsync(key));
}

async function api(path, body, headers = {}) {
  const init = {
    headers: { ...headers },
  };
  if (body !== undefined) {
    init.method = "POST";
    init.headers.origin = ORIGIN;
    init.headers["content-type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const res = await fetch(ORIGIN + path, {
    ...init,
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  return { status: res.status, json, text };
}

async function session(key) {
  const owner = await ownerOf(key);
  const ch = await api("/api/social/session/challenge", { owner });
  if (ch.status !== 200) throw new Error("session challenge " + ch.status);
  const conf = await api("/api/social/session/confirm", {
    id: ch.json.id,
    signature: await signMessage(ch.json.message, key),
  });
  if (conf.status !== 200) throw new Error("session confirm " + conf.status);
  return { owner, token: conf.json.token };
}

async function signedSocial(key, kind, extra = {}) {
  const owner = await ownerOf(key);
  const ch = await api("/api/social/challenge", { owner, kind, ...extra });
  if (ch.status !== 200) return ch;
  return api("/api/social/confirm", {
    id: ch.json.id,
    signature: await signMessage(ch.json.message, key),
  });
}

async function tryHatch(key) {
  const owner = await ownerOf(key);
  const ch = await api("/api/challenge", { owner, action: "hatch" });
  if (ch.status !== 200) return { ok: false, stage: "challenge", ...ch };
  // Chain self-transfer cannot complete without real funds/RPC receipt.
  // Confirm with fake hash to document the gap.
  const conf = await api("/api/confirm", {
    id: ch.json.id,
    tx_hash: "0x" + "11".repeat(32),
  });
  return {
    ok: conf.status === 200,
    stage: "confirm",
    challenge: ch,
    confirm: conf,
    owner,
  };
}

async function apiPlaytest() {
  log("API health /pasture", "run");
  const pasture = await api("/api/pasture?offset=0");
  log(
    "pasture list",
    pasture.status === 200 ? "works" : "bug",
    `status=${pasture.status}`,
  );

  const hatchA = await tryHatch(keyA);
  if (!hatchA.ok) {
    log(
      "hatch (chain proof)",
      "gap not testable",
      `challenge=${hatchA.challenge?.status} confirm=${hatchA.confirm?.status} (needs real self-transfer / RPC receipt)`,
    );
  } else {
    log("hatch", "works");
  }

  // Signature-gated endpoints still need a pet. If hatch failed, remaining care/activity API
  // checks against empty owner will 404/409 — record as blocked-by-hatch-gap.
  const owner = await ownerOf(keyA);
  for (const action of ["checkin", "play", "groom"]) {
    const ch = await api("/api/challenge", { owner, action });
    log(
      `care challenge ${action}`,
      ch.status === 200 || ch.status === 404 || ch.status === 409
        ? ch.status === 200
          ? "works"
          : "gap not testable"
        : "bug",
      `status=${ch.status} ${ch.json?.error || ""}`,
    );
  }

  for (const path of [
    "/api/economy/catalog",
    "/api/marketplace",
    "/api/content/quests",
    "/api/content/collections",
    "/api/fishing/status",
    "/api/mining/status",
    "/api/racing/status",
    "/api/treasure/status",
    "/api/garden/status",
    "/api/cook/status",
    "/api/housing/plot",
  ]) {
    const r = await api(path);
    log(
      `GET ${path}`,
      r.status === 200 ? "works" : "bug",
      `status=${r.status}`,
    );
  }

  // Social session auth works without hatch
  try {
    const a = await session(keyA);
    const b = await session(keyB);
    log("social session auth", "works");
    const profile = await api(
      `/api/social/profile?owner=${a.owner}`,
      undefined,
      {
        Authorization: `Bearer ${a.token}`,
      },
    );
    log(
      "social profile",
      profile.status === 200 || profile.status === 404 ? "works" : "bug",
      `status=${profile.status}`,
    );
    const friends = await api(
      `/api/social/friends?owner=${a.owner}`,
      undefined,
      {
        Authorization: `Bearer ${a.token}`,
      },
    );
    log(
      "social friends",
      friends.status === 200 ? "works" : "bug",
      `status=${friends.status}`,
    );
    const party = await api(`/api/social/party?owner=${a.owner}`, undefined, {
      Authorization: `Bearer ${a.token}`,
    });
    log(
      "social party",
      party.status === 200 ? "works" : "bug",
      `status=${party.status} bonusPercent=${party.json?.bonusPercent}`,
    );
    // Friend/party flows need pets in DB for some checks — attempt and record
    const fr = await signedSocial(keyA, "friend_request", { target: b.owner });
    log(
      "friend request",
      fr.status === 200 || fr.status === 404 || fr.status === 409
        ? fr.status === 200
          ? "works"
          : "gap not testable"
        : "bug",
      `status=${fr.status} ${fr.json?.error || ""}`,
    );
  } catch (e) {
    log("social session auth", "bug", String(e));
  }

  // World presence challenge (token requires signed confirm + hatch)
  const presence = await api("/api/world/presence/challenge", {
    owner,
    zone: "starter-town",
  });
  log(
    "world presence challenge",
    [200, 400, 401, 404, 409].includes(presence.status)
      ? presence.status === 200
        ? "works"
        : "gap not testable"
      : "bug",
    `status=${presence.status} ${presence.json?.error || ""}`,
  );
}

async function uiPlaytest() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on("pageerror", (err) => consoleErrors.push(String(err)));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

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

  for (const [path, name] of pages) {
    consoleErrors.length = 0;
    const url = ORIGIN + path;
    let status = "works";
    let detail = "";
    try {
      const res = await page.goto(url, {
        waitUntil: name === "world" ? "domcontentloaded" : "networkidle",
        timeout: 60000,
      });
      const code = res?.status() || 0;
      await page.waitForTimeout(name === "world" ? 2500 : 800);
      const shot = join(OUT, `${name}.png`);
      await page.screenshot({ path: shot, fullPage: true });
      const errs = consoleErrors.filter(
        (e) =>
          !e.includes("favicon") &&
          !e.includes("Express") &&
          !e.includes("wallet"),
      );
      if (code >= 400) {
        status = "bug";
        detail = `http ${code}`;
      } else if (errs.length) {
        status = "bug";
        detail = `console: ${errs.slice(0, 3).join(" | ")}`;
      } else {
        detail = `screenshot=${shot}`;
      }
    } catch (e) {
      status = "bug";
      detail = String(e);
    }
    log(`UI ${name}`, status, detail);
  }

  await browser.close();
}

const reportPath = join(OUT, "playtest-report.json");
try {
  await apiPlaytest();
  await uiPlaytest();
} catch (e) {
  log("playtest runner", "bug", String(e));
}
writeFileSync(reportPath, JSON.stringify({ origin: ORIGIN, results }, null, 2));
console.log("Wrote", reportPath);
const bugs = results.filter((r) => r.status === "bug");
process.exitCode = bugs.length ? 1 : 0;
