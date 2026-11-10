import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const port = 5198;
const owner = "0x" + "e8".repeat(32);

const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

function startStatic() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      let path = req.url?.split("?")[0] || "/";
      if (path === "/") path = "/index.html";
      const file = join(dist, path.replace(/^\//, ""));
      if (!existsSync(file)) {
        res.writeHead(404);
        res.end("missing " + path);
        return;
      }
      res.writeHead(200, {
        "content-type": mime[extname(file)] || "text/plain",
      });
      res.end(readFileSync(file));
    });
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
await context.addInitScript((cachedOwner) => {
  window.__boingCalls = [];
  window.boing = {
    isBoingWeb: true,
    request: async ({ method }) => {
      window.__boingCalls.push(method);
      if (method === "boing_accounts") return [cachedOwner];
      if (method === "boing_requestAccounts") {
        const err = new Error("Boing Express window was closed.");
        err.name = "BoingWebWalletError";
        throw err;
      }
      if (method === "boing_chainId") return 6913;
      if (method === "boing_signMessage") {
        const err = new Error("Boing Express window was closed.");
        throw err;
      }
      throw new Error("unexpected " + method);
    },
    on() {},
    removeListener() {},
    disconnect() {},
  };
  localStorage.setItem(
    "boing-pets-wallet-v1",
    JSON.stringify({ owner: cachedOwner, connected_at: Date.now() }),
  );
}, owner);

await context.route("**/api/**", async (route) => {
  const url = route.request().url();
  if (url.includes("/api/pet")) {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ pet: null }),
    });
    return;
  }
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      ok: true,
      pets: [],
      next: null,
      dailyCap: 3,
      remaining: 3,
      attemptsUsed: 0,
      hatched: false,
      pendingClaim: null,
    }),
  });
});

if (!existsSync(join(dist, "index.html"))) {
  throw new Error("Run npm run build first");
}
const server = await startStatic();
const page = await context.newPage();
const labels = [];
const popups = [];

function snapshot(tag) {
  return page.evaluate((step) => {
    const el = document.querySelector("#connect");
    const text = el?.textContent || "";
    return {
      step,
      text,
      calls: [...(window.__boingCalls || [])],
    };
  }, tag);
}

function assertGood(snap) {
  if (/Connect Express/i.test(snap.text) || /reconnecting/i.test(snap.text)) {
    throw new Error(`bad header at ${snap.step}: "${snap.text}"`);
  }
  if (!/0xe8/i.test(snap.text)) {
    throw new Error(`expected cached address at ${snap.step}: "${snap.text}"`);
  }
  if (
    snap.calls.includes("boing_requestAccounts") ||
    snap.calls.includes("boing_signMessage")
  ) {
    throw new Error(
      `popup method on navigate at ${snap.step}: ${snap.calls.join(",")}`,
    );
  }
}

const pages = [
  "/",
  "/home.html",
  "/racing.html",
  "/fishing.html",
  "/mining.html",
  "/home.html",
  "/",
];
for (const path of pages) {
  await page.goto(`http://127.0.0.1:${port}${path}`, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  // Read immediately (no flash) and again after restore.
  const first = await snapshot("immediate:" + path);
  labels.push(first);
  assertGood(first);
  await page.waitForTimeout(600);
  const later = await snapshot("after:" + path);
  labels.push(later);
  assertGood(later);
}

// Header click should open the menu, not requestAccounts / toast already-connected
await page.locator("#connect").click();
const menuVisible = await page.locator("#wallet-menu").isVisible();
if (!menuVisible) throw new Error("wallet menu did not open");
const notice = await page
  .locator("#notice")
  .innerText()
  .catch(() => "");
if (/Already connected/i.test(notice)) {
  throw new Error("contradictory already-connected toast");
}
const afterClick = await snapshot("after-header-click");
if (afterClick.calls.includes("boing_requestAccounts")) {
  throw new Error("header click opened Express");
}

const calls = await page.evaluate(() => window.__boingCalls || []);
console.log(
  "PASS: wallet persisted across pages; no Connect/reconnecting flash; no auto popup",
);
console.log("labels", labels.map((s) => s.step + "=" + s.text).join(" | "));
console.log("methods", calls.join(",") || "(none beyond silent accounts)");
void popups;
await browser.close();
server.close();
