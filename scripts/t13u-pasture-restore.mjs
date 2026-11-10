import { chromium } from "playwright";
import { createServer } from "node:http";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const port = 5198;
const out = join(root, "playtest-artifacts", "pasture-restore");
mkdirSync(out, { recursive: true });

const ownerA = "0x" + "a1".repeat(32);
const ownerB = "0x" + "b2".repeat(32);

const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

function mockPet(owner, species, hue) {
  return {
    owner,
    hatch_tx: "0x" + "ab".repeat(32),
    created_at: Date.now(),
    traits: {
      species,
      shape: 4,
      hue,
      accent: 200,
      spots: 0,
      antenna: 1,
      personality: "Cozy",
    },
    state: {
      hunger: 80,
      happiness: 82,
      energy: 77,
      hygiene: 85,
      health: 90,
      streak: 2,
      status: "bouncy",
      stage: "baby",
      careDays: 2,
      lastCare: Date.now(),
      lastFed: 0,
      checkedIn: false,
      fedToday: false,
      playedToday: false,
      groomedToday: false,
      boinglets: 12,
      xp: 8,
      skills: { scores: { Explorer: 2 }, focus: "Explorer" },
      snacksToday: 0,
    },
    achievements: [],
    mind: { mood: "playful", suggestion: "Let's bounce together.", cues: [] },
  };
}

const pets = [
  mockPet(ownerA, "Boingle", 12),
  mockPet(ownerB, "Puddlehop", 200),
];

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

async function fulfillApis(context, { loggedIn }) {
  await context.route("**/api/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/api/pasture")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ pets, next: null, now: Date.now() }),
      });
      return;
    }
    if (url.includes("/api/pet")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          pet: loggedIn ? pets[0] : null,
          now: Date.now(),
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
}

async function runScenario(browser, name, loggedIn) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    reducedMotion: "reduce",
  });
  if (loggedIn) {
    await context.addInitScript((owner) => {
      localStorage.setItem(
        "boing-pets-wallet-v1",
        JSON.stringify({
          owner,
          connected_at: Date.now(),
          provider: "web",
        }),
      );
    }, ownerA);
  }
  await fulfillApis(context, { loggedIn });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${port}/`, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await page.waitForSelector("#pasture-canvas", { timeout: 10000 });
  await page.waitForSelector(".pasture-sprite", { timeout: 10000 });
  const spriteCount = await page.locator(".pasture-sprite").count();
  if (spriteCount < 2) {
    throw new Error(`${name}: expected >1 pet in pasture, got ${spriteCount}`);
  }
  const canvasVisible = await page.locator("#pasture-ground").isVisible();
  if (!canvasVisible) throw new Error(`${name}: pasture canvas not visible`);

  const notice = await page.locator("#notice").textContent();
  if (/^Loading/i.test((notice || "").trim())) {
    // Give the parallel restore a brief moment, then require the ready notice.
    await page.waitForFunction(
      () =>
        !/^Loading/i.test(
          (document.querySelector("#notice")?.textContent || "").trim(),
        ),
      null,
      { timeout: 5000 },
    );
  }

  if (loggedIn) {
    const buddy = page.locator("#my-pet .pet-card");
    await buddy.waitFor({ state: "visible", timeout: 8000 });
  }

  const other = page.locator(".pasture-sprite").nth(loggedIn ? 1 : 0);
  await other.evaluate((el) => el.click());
  const inspect = page.locator("#pasture-inspect");
  await inspect.waitFor({ state: "visible", timeout: 8000 });
  const inspectCard = inspect.locator(".pet-card");
  if (!(await inspectCard.isVisible())) {
    throw new Error(`${name}: click did not open a pet card`);
  }
  const inspectText = (await inspect.innerText()) || "";
  if (loggedIn && !/Puddlehop/i.test(inspectText)) {
    throw new Error(
      `${name}: expected the other owner's pet card, got ${inspectText}`,
    );
  }
  if (loggedIn) {
    const buddyStill = await page.locator("#my-pet .pet-card").isVisible();
    if (!buddyStill) {
      throw new Error(
        `${name}: buddy card disappeared after opening another pet`,
      );
    }
    const worldStill = await page.locator("#pasture-canvas").isVisible();
    if (!worldStill) throw new Error(`${name}: pasture world was replaced`);
  }

  await page.screenshot({
    path: join(out, `${name}.png`),
    fullPage: true,
  });
  await context.close();
  console.log(`PASS ${name}: sprites=${spriteCount}`);
}

const server = await startStatic();
const browser = await chromium.launch({ headless: true });
try {
  await runScenario(browser, "logged-out", false);
  await runScenario(browser, "logged-in", true);
  console.log("PASS: public pasture world renders multiple clickable pets");
} finally {
  await browser.close();
  server.close();
}
