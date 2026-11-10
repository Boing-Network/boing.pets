/**
 * Live post-deploy Playwright verification for boing-pets.workers.dev
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ORIGIN =
  process.env.LIVE_ORIGIN || "https://boing-pets.nico-chikuji.workers.dev";
const OUT =
  process.env.LIVE_OUT || join(process.cwd(), "playtest-artifacts", "live");
mkdirSync(OUT, { recursive: true });

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

const results = [];

function log(page, status, detail = "") {
  results.push({ page, status, detail });
  console.log(`[${status}] ${page}${detail ? " — " + detail : ""}`);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();

for (const [path, name] of pages) {
  const consoleMsgs = [];
  const pageErrors = [];
  const badQueries = [];
  const apiHits = [];

  const onConsole = (msg) => {
    const text = msg.text();
    const type = msg.type();
    if (
      type === "error" ||
      /CSP|Content Security Policy|Refused to/i.test(text)
    ) {
      consoleMsgs.push(`${type}: ${text}`);
    }
  };
  const onPageError = (err) => pageErrors.push(String(err));
  const onRequest = (req) => {
    const url = req.url();
    if (!url.includes("/api/")) return;
    apiHits.push(url);
    if (/[?&]app\.(owner|offset)=/.test(url)) badQueries.push(url);
  };

  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  page.on("request", onRequest);

  const url = ORIGIN + path;
  let status = "works";
  const details = [];
  try {
    const waitUntil = name === "world" ? "domcontentloaded" : "networkidle";
    const res = await page.goto(url, { waitUntil, timeout: 60000 });
    const code = res?.status() || 0;
    await page.waitForTimeout(name === "world" ? 3000 : 1200);

    if (code >= 400) {
      status = "bug";
      details.push(`http ${code}`);
    }

    // Check for bad query params in page source / bundled main references via requests
    if (badQueries.length) {
      status = "bug";
      details.push(`bad query: ${badQueries.slice(0, 2).join(" | ")}`);
    }

    // Mining controls must exist on mining page
    if (name === "mining") {
      const swing = await page.$("#mine-swing");
      const strike = await page.$("#mine-strike");
      const logEl = await page.$("#mine-log");
      if (!swing || !strike || !logEl) {
        status = "bug";
        details.push(
          `mining controls missing swing=${!!swing} strike=${!!strike} log=${!!logEl}`,
        );
      } else {
        details.push("mining controls ok");
      }
      // status panel should mention stamina or ores after fetch
      const bodyText = await page.locator("body").innerText();
      if (!/stamina|ore|pick|mine/i.test(bodyText)) {
        status = "bug";
        details.push("mining status panel empty?");
      }
    }

    // Activity/status pages should have populated summary-ish content (not blank)
    if (
      [
        "fishing",
        "racing",
        "treasure",
        "garden",
        "kitchen",
        "quests",
        "collections",
        "market",
      ].includes(name)
    ) {
      const bodyText = await page.locator("body").innerText();
      if (bodyText.trim().length < 40) {
        status = "bug";
        details.push("page body nearly empty");
      }
    }

    // Filter noise from expected wallet/extension absence
    const serious = [...consoleMsgs, ...pageErrors].filter(
      (e) =>
        !/favicon/i.test(e) &&
        !/Express/i.test(e) &&
        !/wallet/i.test(e) &&
        !/ethereum/i.test(e) &&
        !/Failed to load resource:.*chrome-extension/i.test(e),
    );
    if (serious.length) {
      status = "bug";
      details.push(`console: ${serious.slice(0, 3).join(" | ")}`);
    }

    const shot = join(OUT, `${name}.png`);
    await page.screenshot({ path: shot, fullPage: true });
    details.push(`screenshot=${shot}`);
    details.push(`apiHits=${apiHits.length}`);
  } catch (e) {
    status = "bug";
    details.push(String(e));
  } finally {
    page.off("console", onConsole);
    page.off("pageerror", onPageError);
    page.off("request", onRequest);
  }

  log(name, status, details.join("; "));
}

await browser.close();

const report = join(OUT, "live-verify-report.json");
writeFileSync(report, JSON.stringify({ origin: ORIGIN, results }, null, 2));
console.log("Wrote", report);
const bugs = results.filter((r) => r.status === "bug");
process.exitCode = bugs.length ? 1 : 0;
