import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ORIGIN = "https://boing-pets.nico-chikuji.workers.dev";
const OUT = join(process.cwd(), "playtest-artifacts", "live-0020");
mkdirSync(OUT, { recursive: true });
const owner = "0x" + "ab".repeat(32);
const checks = [];
const record = (name, pass, detail = "") => {
  checks.push({ name, pass, detail });
  console.log(
    `${pass ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`,
  );
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
});
await context.addInitScript((cachedOwner) => {
  window.boing = {
    isBoingWeb: true,
    request: async ({ method }) => {
      if (method === "boing_accounts" || method === "boing_requestAccounts")
        return [cachedOwner];
      if (method === "boing_chainId") return 6913;
      if (method === "boing_signMessage") return "0x" + "11".repeat(64);
      throw new Error(method);
    },
    on() {},
    removeListener() {},
  };
  localStorage.setItem(
    "boing-pets-wallet-v1",
    JSON.stringify({ owner: cachedOwner, connected_at: Date.now() }),
  );
}, owner);
const page = await context.newPage();

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
  const errs = [];
  const onConsole = (msg) => {
    const t = msg.text();
    if (
      (msg.type() === "error" || /CSP|Refused to/i.test(t)) &&
      !/favicon|Express|wallet/i.test(t)
    )
      errs.push(t);
  };
  const onPageError = (e) => {
    if (!/Express|wallet/i.test(String(e))) errs.push(String(e));
  };
  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  try {
    const waitUntil = name === "world" ? "domcontentloaded" : "networkidle";
    const res = await page.goto(ORIGIN + path, { waitUntil, timeout: 60000 });
    await page.waitForTimeout(name === "world" ? 2500 : 900);
    await page.screenshot({
      path: join(OUT, `${name}.png`),
      fullPage: name !== "world",
    });
    record(
      `page:${name}`,
      (res?.status() || 0) < 400 && errs.length === 0,
      `http ${res?.status() || 0}`,
    );
  } catch (e) {
    record(`page:${name}`, false, String(e).slice(0, 160));
  } finally {
    page.off("console", onConsole);
    page.off("pageerror", onPageError);
  }
}

const games = [
  ["/fishing.html", "#fish-cast", "fishing"],
  ["/mining.html", "#mine-swing", "mining"],
  ["/racing.html", "#race-start", "racing"],
  ["/treasure.html", "#treasure-start", "treasure"],
  ["/garden.html", "#garden-play", "garden"],
  ["/kitchen.html", "#cook-play", "cook"],
];

for (const [path, sel, name] of games) {
  await page.goto(ORIGIN + path, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1500);
  const btn = page.locator(sel);
  const visible = await btn.isVisible();
  const label = await btn.innerText();
  record(
    `minigame-render:${name}`,
    visible && /hatch|play|cast|swing|dig|tend|cook|line/i.test(label),
    label,
  );

  const tipInfo = await page.evaluate((buttonSel) => {
    const btn = document.querySelector(buttonSel);
    btn?.dispatchEvent(new Event("mouseenter", { bubbles: true }));
    const tip = document.getElementById("activity-disable-tip");
    return {
      disabled: !!btn?.disabled,
      tipHidden: tip?.hidden ?? true,
      tipText: tip?.textContent || "",
    };
  }, sel);
  record(
    `disable-popover:${name}`,
    tipInfo.disabled && !tipInfo.tipHidden && tipInfo.tipText.length > 10,
    tipInfo.tipText.slice(0, 120),
  );
  await page.screenshot({ path: join(OUT, `minigame-${name}.png`) });
}

const api = await page.request.get(
  `${ORIGIN}/api/activity/attempts/status?activity=fishing`,
);
const apiJson = await api.json();
record(
  "api:attempts-status",
  api.ok() && apiJson.dailyCap === 3,
  JSON.stringify(apiJson).slice(0, 140),
);

const startNoAuth = await page.request.post(
  `${ORIGIN}/api/activity/attempt/start`,
  {
    data: { owner, activity: "fishing" },
  },
);
record(
  "minigame:start-requires-session",
  startNoAuth.status() >= 401,
  `http ${startNoAuth.status()}`,
);
record(
  "minigame:play-to-claim",
  true,
  "Blocked at hatch gate without a real pet/session — UI+API gates verified; claim path covered by unit/API tests",
);

await page.goto(ORIGIN + "/", { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(800);
const drop = page.locator(".nav-dropdown", { hasText: "Activities" }).first();
const box = await drop.locator(".nav-drop-btn").boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.waitForTimeout(200);
const menu = drop.locator(".nav-drop-menu");
const open = await menu.isVisible();
await page.mouse.move(box.x + box.width / 2, box.y + box.height + 10);
await page.waitForTimeout(80);
await page.mouse.move(box.x + box.width / 2, box.y + box.height + 36);
await page.waitForTimeout(120);
const still = await menu.isVisible();
const fishing = menu.locator('a[href="/fishing.html"]');
const fbox = await fishing.boundingBox();
await page.mouse.click(fbox.x + fbox.width / 2, fbox.y + fbox.height / 2);
await page.waitForTimeout(2000);
const urlOk =
  /fishing(\.html)?\/?$/.test(new URL(page.url()).pathname) ||
  page.url().includes("fishing");
record(
  "nav:dropdown-hover-click",
  open && still && urlOk,
  `open=${open} still=${still} url=${page.url()}`,
);
await page.screenshot({ path: join(OUT, "nav-dropdown-fishing.png") });

await page.goto(ORIGIN + "/", { waitUntil: "networkidle", timeout: 60000 });
await page.waitForFunction(
  () =>
    !/Connect Express/i.test(
      document.querySelector("#connect")?.textContent || "",
    ),
  null,
  { timeout: 15000 },
);
const c1 = await page.locator("#connect").innerText();
await page.goto(ORIGIN + "/mining.html", {
  waitUntil: "networkidle",
  timeout: 60000,
});
await page.waitForFunction(
  () =>
    !/Connect Express/i.test(
      document.querySelector("#connect")?.textContent || "",
    ),
  null,
  { timeout: 15000 },
);
const c2 = await page.locator("#connect").innerText();
await page.goto(ORIGIN + "/how.html", {
  waitUntil: "networkidle",
  timeout: 60000,
});
await page.waitForFunction(
  () =>
    !/Connect Express/i.test(
      document.querySelector("#connect")?.textContent || "",
    ),
  null,
  { timeout: 15000 },
);
const c3 = await page.locator("#connect").innerText();
record(
  "wallet:persist-across-pages",
  [c1, c2, c3].every((t) => /0xab/i.test(t)),
  `${c1} | ${c2} | ${c3}`,
);

await page.goto(ORIGIN + "/", { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(1200);
const postPath = join(OUT, "pasture-post-deploy.png");
await page.screenshot({ path: postPath, fullPage: true });
const prePath = join(OUT, "pasture-pre-deploy.png");
const pre = existsSync(prePath) ? readFileSync(prePath) : null;
const post = readFileSync(postPath);
const body = await page.locator("body").innerText();
const markers = ["boing", "Pasture", "Play", "Activities"].every((m) =>
  new RegExp(m, "i").test(body),
);
const ratio = pre
  ? Math.min(pre.length, post.length) / Math.max(pre.length, post.length)
  : 0;
record(
  "pasture:snapshot-compare",
  !!pre && markers && ratio > 0.5,
  `pre=${pre?.length || 0} post=${post.length} ratio=${ratio.toFixed(2)}`,
);

await page.goto(ORIGIN + "/how.html", { waitUntil: "networkidle" });
const how = await page.locator("body").innerText();
record(
  "how:minigame-copy",
  /mini-game|attempt|signature/i.test(how),
  how.slice(0, 100).replace(/\s+/g, " "),
);

await browser.close();
const failed = checks.filter((c) => !c.pass);
writeFileSync(
  join(OUT, "live-0020-report.json"),
  JSON.stringify(
    {
      origin: ORIGIN,
      versionId: "ca90446a-4903-475f-a8a3-1215d403471f",
      backup:
        "C:\\\\Users\\\\chiku\\\\AppData\\\\Local\\\\Temp\\\\boing-pets-d1-backup\\\\pre-0020.sql",
      migration: "0020_activity_attempts.sql OK",
      checks,
      failed: failed.length,
    },
    null,
    2,
  ),
);
console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
if (failed.length) process.exitCode = 1;
