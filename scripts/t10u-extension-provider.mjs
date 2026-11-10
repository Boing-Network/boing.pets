import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const port = 5197;
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

if (!existsSync(join(dist, "index.html"))) {
  throw new Error("Run npm run build first");
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();

await context.addInitScript((cachedOwner) => {
  window.__boingCalls = [];
  window.__opened = [];
  const originalOpen = window.open.bind(window);
  window.open = (...args) => {
    window.__opened.push(String(args[0] ?? ""));
    return originalOpen(...args);
  };

  localStorage.setItem(
    "boing-pets-wallet-v1",
    JSON.stringify({
      owner: cachedOwner,
      connected_at: Date.now(),
      provider: "extension",
    }),
  );

  const provider = {
    isBoingWeb: false,
    request: async ({ method }) => {
      window.__boingCalls.push(method);
      if (method === "boing_accounts" || method === "boing_requestAccounts")
        return [cachedOwner];
      if (method === "boing_chainId") return 6913;
      if (method === "boing_signMessage") return "0x" + "11".repeat(64);
      throw new Error("unexpected " + method);
    },
    on() {},
    removeListener() {},
    disconnect() {},
  };

  // Late inject — reproduces a refresh before the extension content script runs.
  setTimeout(() => {
    window.boing = provider;
    window.dispatchEvent(new Event("boing#initialized"));
  }, 400);
}, owner);

await context.route("**/api/**", async (route) => {
  const url = route.request().url();
  const method = route.request().method();
  if (url.includes("/api/social/session/challenge")) {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: "ch-1", message: "sign this session" }),
    });
    return;
  }
  if (url.includes("/api/social/session/confirm")) {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        token: "tok-live",
        expires_at: Date.now() + 15 * 60_000,
      }),
    });
    return;
  }
  if (url.includes("/api/activity/attempt/start")) {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "att-1",
        public: {
          periodMs: 2000,
          zoneStart: 0.3,
          zoneWidth: 0.2,
          phase: 0,
        },
        created_at: Date.now(),
        expires_at: Date.now() + 45000,
        remaining: 2,
      }),
    });
    return;
  }
  if (url.includes("/api/activity/attempt/finish")) {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        status: "success_pending",
        claim_message: "claim this",
        message: "Nice! Sign to keep your reward.",
      }),
    });
    return;
  }
  if (url.includes("/api/activity/attempt/claim") && method === "POST") {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        reward: {
          name: "Ripple Minnow",
          rewardBoinglets: 6,
          itemId: "fish-ripple",
        },
      }),
    });
    return;
  }
  if (url.includes("/api/activity/attempts/status")) {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        activity: "fishing",
        dailyCap: 3,
        attemptsUsed: 0,
        remaining: 3,
        hatched: true,
        pendingClaim: null,
      }),
    });
    return;
  }
  if (url.includes("/api/pet")) {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ pet: { owner: owner } }),
    });
    return;
  }
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, pets: [], next: null }),
  });
});

const server = await startStatic();
const page = await context.newPage();

function snapshot(step) {
  return page.evaluate((label) => {
    const el = document.querySelector("#connect");
    return {
      step: label,
      text: el?.textContent || "",
      calls: [...(window.__boingCalls || [])],
      opened: [...(window.__opened || [])],
      hasBoing: !!window.boing,
    };
  }, step);
}

await page.goto(`http://127.0.0.1:${port}/fishing.html`, {
  waitUntil: "domcontentloaded",
  timeout: 30000,
});

const immediate = await snapshot("immediate");
if (
  /Connect Express/i.test(immediate.text) ||
  /reconnecting/i.test(immediate.text)
) {
  throw new Error(`header flashed disconnected: ${immediate.text}`);
}
if (!/0xe8/i.test(immediate.text)) {
  throw new Error(`expected cached address immediately: ${immediate.text}`);
}

await page.waitForTimeout(700);
const afterInject = await snapshot("after-inject");
if (/web wallet/i.test(afterInject.text)) {
  throw new Error(
    `header used web wallet after extension inject: ${afterInject.text}`,
  );
}
if (!afterInject.hasBoing) throw new Error("window.boing did not inject");

const play = page.locator("#fish-cast");
await play.waitFor({ state: "visible", timeout: 10000 });
await page.waitForFunction(
  () => {
    const b = document.querySelector("#fish-cast");
    return b && !b.disabled && /play/i.test(b.textContent || "");
  },
  null,
  { timeout: 10000 },
);
await play.click();

await page.waitForTimeout(800);
const afterPlay = await snapshot("after-play");
const openedExpress = afterPlay.opened.some((u) => /boing\.express/i.test(u));
if (openedExpress) {
  throw new Error(
    "opened boing.express web wallet: " + afterPlay.opened.join(","),
  );
}
if (
  !afterPlay.calls.includes("boing_signMessage") &&
  !afterPlay.calls.includes("boing_requestAccounts") &&
  !afterPlay.calls.includes("boing_accounts")
) {
  throw new Error("extension was not used: " + afterPlay.calls.join(","));
}

// Claim path if the minigame surfaced a reel button — click it if present.
const reel = page.locator("button", { hasText: "Reel!" });
if (await reel.isVisible().catch(() => false)) {
  await reel.click();
  await page.waitForTimeout(400);
}
const afterClaim = await snapshot("after-claim");
if (afterClaim.opened.some((u) => /boing\.express/i.test(u))) {
  throw new Error("claim opened boing.express");
}

console.log("PASS: late-injecting extension used; no boing.express tab");
console.log(
  JSON.stringify({ immediate, afterInject, afterPlay, afterClaim }, null, 2),
);

await browser.close();
server.close();
