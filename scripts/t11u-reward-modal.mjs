import { chromium } from "playwright";
import { createServer } from "node:http";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const port = 5201;
const out = join(root, "playtest-artifacts", "reward-modal");
mkdirSync(out, { recursive: true });
const owner = "0x" + "e8".repeat(32);

const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
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

async function runCase(browser, name, { reducedMotion }) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    reducedMotion: reducedMotion ? "reduce" : "no-preference",
  });
  await context.addInitScript((cachedOwner) => {
    window.boing = {
      isBoingWeb: false,
      request: async ({ method }) => {
        if (method === "boing_accounts" || method === "boing_requestAccounts")
          return [cachedOwner];
        if (method === "boing_chainId") return 6913;
        if (method === "boing_signMessage") return "0x" + "11".repeat(64);
        throw new Error("unexpected " + method);
      },
      on() {},
      removeListener() {},
    };
    localStorage.setItem(
      "boing-pets-wallet-v1",
      JSON.stringify({
        owner: cachedOwner,
        connected_at: Date.now(),
        provider: "extension",
      }),
    );
    localStorage.setItem(
      "boing-pets-social-session-v1",
      JSON.stringify([
        {
          token: "tok-live",
          owner: cachedOwner,
          expires_at: Date.now() + 15 * 60_000,
        },
      ]),
    );
  }, owner);

  await context.route("**/api/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/api/activity/attempt/claim")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          activity: "fishing",
          reward: {
            itemId: "fish-ripple",
            name: "Ripple Minnow",
            rarity: "common",
            rewardBoinglets: 4,
            kind: "fish",
          },
          party_bonus: { eligible: true, percent: 0.2, amount: 2 },
          variety_awarded: 5,
          remaining: 2,
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
          attemptsUsed: 1,
          remaining: 2,
          hatched: true,
          pendingClaim: {
            id: "att-1",
            claim_expires_at: Date.now() + 8 * 60_000,
            claim_message: "claim this reward",
          },
        }),
      });
      return;
    }
    if (url.includes("/api/pet") || url.includes("/api/economy")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          pet: { owner },
          balances: { boinglets: 20 },
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });

  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${port}/fishing.html`, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  const claimBtn = page.locator("#fish-cast");
  await claimBtn.waitFor({ state: "visible", timeout: 10000 });
  await page.waitForFunction(() => {
    const b = document.querySelector("#fish-cast");
    return b && !b.disabled && /claim/i.test(b.textContent || "");
  });
  await claimBtn.click();
  const modal = page.locator("#reward-modal");
  await modal.waitFor({ state: "visible", timeout: 10000 });
  const text = (await modal.innerText()) || "";
  for (const needle of [
    "Fishing",
    "Ripple Minnow",
    "Base",
    "Party +20%",
    "Variety day",
    "Total Boinglets",
    "+11ℬ",
    "Attempts left today",
    "Nice!",
  ]) {
    if (!text.includes(needle)) {
      throw new Error(`${name}: missing ${needle} in modal: ${text}`);
    }
  }
  const confetti = page.locator("#reward-confetti");
  const confettiVisible = await confetti.isVisible();
  if (reducedMotion && confettiVisible) {
    throw new Error(`${name}: confetti should be hidden under reduced motion`);
  }
  if (!reducedMotion && !(await confetti.count())) {
    throw new Error(`${name}: missing confetti canvas`);
  }
  await page.screenshot({
    path: join(out, `${name}.png`),
    fullPage: true,
  });

  await page.keyboard.press("Escape");
  await modal.waitFor({ state: "hidden", timeout: 5000 }).catch(async () => {
    if (await modal.count())
      throw new Error(`${name}: Escape did not close modal`);
  });

  // Re-open and close via Nice! and backdrop
  await claimBtn.click();
  await modal.waitFor({ state: "visible", timeout: 8000 });
  await page.locator("#reward-nice").click();
  if (await modal.count())
    throw new Error(`${name}: Nice! did not close modal`);

  await claimBtn.click();
  await modal.waitFor({ state: "visible", timeout: 8000 });
  await page.locator("#reward-modal").click({ position: { x: 4, y: 4 } });
  if (await modal.count()) {
    throw new Error(`${name}: backdrop click did not close modal`);
  }

  await context.close();
  console.log(`PASS ${name}`);
}

const server = await startStatic();
const browser = await chromium.launch({ headless: true });
try {
  await runCase(browser, "claim-modal", { reducedMotion: false });
  await runCase(browser, "claim-modal-reduced-motion", { reducedMotion: true });
  console.log("PASS: reward modal + confetti after confirmed claim");
} finally {
  await browser.close();
  server.close();
}
