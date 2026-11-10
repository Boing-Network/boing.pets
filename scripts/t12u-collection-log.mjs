import { chromium } from "playwright";
import { createServer } from "node:http";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const port = 5202;
const out = join(root, "playtest-artifacts", "collection-log");
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

const defs = [
  {
    id: "species:Boingle",
    title: "Boingle",
    description: "Hatch a Boingle.",
    category: "species",
  },
  {
    id: "species:Sprout",
    title: "Sprout",
    description: "Hatch a Sprout.",
    category: "species",
  },
  {
    id: "discovery:fish:fish-ripple",
    title: "Ripple Minnow",
    description: "Catch a Ripple Minnow.",
    category: "fish",
  },
  {
    id: "discovery:fish:fish-moonkoi",
    title: "Moon Koi",
    description: "Catch a Moon Koi.",
    category: "fish",
  },
  {
    id: "discovery:treasure:loot-pebble",
    title: "Lucky Pebble",
    description: "Dig up a Lucky Pebble.",
    category: "treasure",
  },
  {
    id: "discovery:crop:crop-sprout",
    title: "Bounce Sprout",
    description: "Harvest a Bounce Sprout.",
    category: "crops",
  },
  {
    id: "discovery:recipe:recipe-sprout-salad",
    title: "Sprout Salad",
    description: "Cook Sprout Salad.",
    category: "recipes",
  },
  {
    id: "discovery:ore:ore-spark",
    title: "Spark Ore",
    description: "Mine Spark Ore.",
    category: "ores",
  },
  {
    id: "discovery:ribbon:ribbon-gold",
    title: "Gold Race Ribbon",
    description: "Place 1st.",
    category: "ribbons",
  },
  {
    id: "discovery:streak_7",
    title: "Week of Wobbles",
    description: "Reach a 7-day care streak.",
    category: "discovery",
  },
  {
    id: "cosmetic:hat-ribbon",
    title: "Pasture Ribbon",
    description: "Own the Pasture Ribbon.",
    category: "cosmetic",
  },
];
const unlockedIds = [
  "species:Boingle",
  "discovery:fish:fish-ripple",
  "cosmetic:hat-ribbon",
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

if (!existsSync(join(dist, "collections.html"))) {
  throw new Error("Run npm run build first");
}

async function runCase(browser, name, loggedIn) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 1100 },
  });
  if (loggedIn) {
    await context.addInitScript((cachedOwner) => {
      localStorage.setItem(
        "boing-pets-wallet-v1",
        JSON.stringify({
          owner: cachedOwner,
          connected_at: Date.now(),
          provider: "web",
        }),
      );
    }, owner);
  }
  await context.route("**/api/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/api/content/collections")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          defs,
          unlocked: loggedIn
            ? unlockedIds.map((id) => ({
                entry_id: id,
                unlocked_at: Date.now(),
              }))
            : [],
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, pet: null }),
    });
  });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${port}/collections.html`, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await page.waitForSelector(".collection-group", { timeout: 10000 });
  const groups = await page.locator(".collection-group").count();
  if (groups < 9)
    throw new Error(`${name}: expected 9 categories, got ${groups}`);
  const headings = await page
    .locator(".collection-group-head h3")
    .allTextContents();
  for (const label of [
    "Species",
    "Fish",
    "Treasure",
    "Crops",
    "Recipes",
    "Ores",
    "Race ribbons",
    "Discoveries",
    "Cosmetics",
  ]) {
    if (!headings.includes(label)) {
      throw new Error(
        `${name}: missing heading ${label}: ${headings.join(", ")}`,
      );
    }
  }
  const icons = await page.locator(".collection-icon svg").count();
  if (icons !== defs.length) {
    throw new Error(`${name}: expected ${defs.length} icons, got ${icons}`);
  }
  if (loggedIn) {
    const collected = await page
      .locator(".collection-item.is-collected")
      .count();
    const locked = await page.locator(".collection-item.is-locked").count();
    if (collected !== unlockedIds.length) {
      throw new Error(
        `${name}: collected ${collected}, expected ${unlockedIds.length}`,
      );
    }
    if (locked !== defs.length - unlockedIds.length) {
      throw new Error(`${name}: locked ${locked}`);
    }
  } else {
    const locked = await page.locator(".collection-item.is-locked").count();
    if (locked !== defs.length) {
      throw new Error(`${name}: logged-out items should all be silhouettes`);
    }
  }
  await page.screenshot({ path: join(out, `${name}.png`), fullPage: true });
  await context.close();
  console.log(`PASS ${name}: groups=${groups} icons=${icons}`);
}

const server = await startStatic();
const browser = await chromium.launch({ headless: true });
try {
  await runCase(browser, "logged-out", false);
  await runCase(browser, "logged-in", true);
  console.log("PASS: collection log is categorized with icons");
} finally {
  await browser.close();
  server.close();
}
