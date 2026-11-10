import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const port = 5199;

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

const owner = "0x" + "ab".repeat(32);

async function main() {
  if (!existsSync(join(dist, "index.html"))) {
    throw new Error("Run npm run build first");
  }
  const server = await startStatic();
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Mock Express provider before app boots.
  await page.addInitScript((cachedOwner) => {
    const accounts = [cachedOwner];
    window.boing = {
      isBoingWeb: true,
      request: async ({ method }) => {
        if (method === "boing_accounts") return accounts;
        if (method === "boing_requestAccounts") return accounts;
        if (method === "boing_chainId") return 6913;
        if (method === "boing_signMessage") return "0x" + "11".repeat(64);
        throw new Error("unexpected " + method);
      },
      on() {},
      removeListener() {},
      disconnect() {
        accounts.length = 0;
      },
    };
    // Pretend a prior visit already connected.
    localStorage.setItem(
      "boing-pets-wallet-v1",
      JSON.stringify({ owner: cachedOwner, connected_at: Date.now() }),
    );
  }, owner);

  // Stub API so refresh does not fail the boot notice path hard.
  await page.route("**/api/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/api/pet")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ pet: null }),
      });
      return;
    }
    if (url.includes("/api/pasture") || url.includes("/api/gallery")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ pets: [], next: null }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });

  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForSelector("#connect");
  await page.waitForFunction(() => {
    const el = document.querySelector("#connect");
    return el && !el.textContent?.includes("Connect Express");
  });
  const connected1 = await page.locator("#connect").innerText();
  if (!connected1.includes("0xab")) {
    throw new Error("header not restored on first page: " + connected1);
  }

  // Dropdown: hover Activities title, move into menu, click Fishing.
  const activities = page
    .locator(".nav-dropdown", { hasText: "Activities" })
    .first();
  await activities.hover();
  const fishing = activities.locator('a[href="/fishing.html"]');
  await fishing.hover();
  await fishing.click();
  await page.waitForURL("**/fishing.html");
  await page.waitForSelector("#connect");
  await page.waitForFunction(() => {
    const el = document.querySelector("#connect");
    return el && !el.textContent?.includes("Connect Express");
  });
  const connected2 = await page.locator("#connect").innerText();
  if (!connected2.includes("0xab")) {
    throw new Error("header lost connection on fishing: " + connected2);
  }

  // Navigate a couple more pages without clicking Connect.
  await page.goto(`http://127.0.0.1:${port}/mining.html`);
  await page.waitForFunction(() => {
    const el = document.querySelector("#connect");
    return el && !el.textContent?.includes("Connect Express");
  });
  await page.goto(`http://127.0.0.1:${port}/how.html`);
  await page.waitForFunction(() => {
    const el = document.querySelector("#connect");
    return el && !el.textContent?.includes("Connect Express");
  });

  // Escape closes dropdown (click toggle without hover covering the button)
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.mouse.move(0, 0);
  const play = page.locator(".nav-dropdown", { hasText: "Play" }).first();
  await play.locator(".nav-drop-btn").evaluate((el) => el.click());
  await expectOpen(play, true);
  await page.keyboard.press("Escape");
  await expectOpen(play, false);

  console.log("PASS: dropdown hover+click and persistent Express restore");
  await browser.close();
  server.close();
}

async function expectOpen(locator, open) {
  const has = await locator.evaluate(
    (el, want) => el.classList.contains("is-open") === want,
    open,
  );
  if (!has) throw new Error(`dropdown is-open expected ${open}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
