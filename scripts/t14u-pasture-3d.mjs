import { chromium } from "playwright";
import { createServer } from "node:http";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const port = 5214;
const hubPort = 5215;
const out = join(root, "playtest-artifacts", "pasture-3d");
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
  ".woff": "font/woff",
};

function mockPet(owner, species, hue, cosmetics = {}) {
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
    cosmetics,
  };
}

const petsByOwner = {
  [ownerA]: mockPet(ownerA, "Boingle", 12, {}),
  [ownerB]: mockPet(ownerB, "Puddlehop", 200, {}),
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

function startHub() {
  const clients = new Map();
  const wss = new WebSocketServer({ host: "127.0.0.1", port: hubPort });
  const send = (ws, message) => {
    try {
      ws.send(JSON.stringify(message));
    } catch {
      /* closed */
    }
  };
  const broadcast = (except, message) => {
    const payload = JSON.stringify(message);
    for (const ws of clients.keys()) {
      if (ws === except) continue;
      try {
        ws.send(payload);
      } catch {
        /* ignore */
      }
    }
  };
  wss.on("connection", (ws) => {
    ws.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (msg.type === "hello") {
        for (const [other, player] of clients) {
          if (player.id === msg.id && other !== ws) {
            clients.delete(other);
            broadcast(other, { type: "leave", id: player.id });
            try {
              other.close();
            } catch {
              /* ignore */
            }
          }
        }
        const player = {
          id: msg.id,
          name: msg.name,
          color: msg.color,
          x: msg.x,
          y: msg.y,
          z: msg.z,
          cosmetics: msg.cosmetics,
        };
        clients.set(ws, player);
        send(ws, {
          type: "welcome",
          you: player.id,
          players: [...clients.values()],
        });
        broadcast(ws, { type: "join", player });
        return;
      }
      const self = clients.get(ws);
      if (!self) return;
      if (msg.type === "move") {
        self.x = msg.x;
        self.y = msg.y;
        self.z = msg.z;
        broadcast(ws, {
          type: "move",
          id: self.id,
          x: self.x,
          y: self.y,
          z: self.z,
        });
        return;
      }
      if (msg.type === "chat") {
        const payload = {
          type: "chat",
          id: self.id,
          name: self.name,
          text: String(msg.text || "").slice(0, 140),
          at: Date.now(),
        };
        send(ws, payload);
        broadcast(ws, payload);
        return;
      }
      if (msg.type === "cosmetics") {
        self.cosmetics = msg.cosmetics;
        const payload = {
          type: "cosmetics",
          id: self.id,
          cosmetics: self.cosmetics,
        };
        send(ws, payload);
        broadcast(ws, payload);
      }
    });
    ws.on("close", () => {
      const self = clients.get(ws);
      clients.delete(ws);
      if (self) broadcast(ws, { type: "leave", id: self.id });
    });
  });
  return wss;
}

if (!existsSync(join(dist, "index.html"))) {
  throw new Error("Run npm run build first");
}

async function fulfillApis(context, owner, equippedStore) {
  await context.route("**/api/**", async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    if (url.includes("/api/pet/cosmetics/equip") && method === "POST") {
      const body = JSON.parse(route.request().postData() || "{}");
      const current = equippedStore[body.owner] || {};
      if (body.item_id) current[body.slot] = body.item_id;
      else delete current[body.slot];
      equippedStore[body.owner] = current;
      if (petsByOwner[body.owner]) petsByOwner[body.owner].cosmetics = current;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          owner: body.owner,
          equipped: current,
          now: Date.now(),
        }),
      });
      return;
    }
    if (url.includes("/api/pet/cosmetics")) {
      const who = new URL(url).searchParams.get("owner") || owner;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          owner: who,
          slots: ["hat", "accessory", "trail"],
          equipped: equippedStore[who] || {},
          owned: [
            { id: "hat-ribbon", slot: "hat", name: "Ribbon Hat" },
            { id: "frame-gold", slot: "accessory", name: "Gold Frame" },
          ],
          now: Date.now(),
        }),
      });
      return;
    }
    if (url.includes("/api/pasture")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          pets: Object.values(petsByOwner),
          next: null,
          now: Date.now(),
        }),
      });
      return;
    }
    if (url.includes("/api/pet")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          pet: owner ? petsByOwner[owner] : null,
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

async function prepareContext(browser, owner, equippedStore) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    reducedMotion: "reduce",
  });
  await context.addInitScript(
    ({ owner: cachedOwner, hub }) => {
      window.__PASTURE_PRESENCE_URL__ = hub;
      window.boing = {
        isBoingWeb: cachedOwner ? false : true,
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
      if (cachedOwner) {
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
              token: "tok-" + cachedOwner.slice(2, 10),
              owner: cachedOwner,
              expires_at: Date.now() + 15 * 60_000,
            },
          ]),
        );
      }
    },
    { owner, hub: `ws://127.0.0.1:${hubPort}` },
  );
  await fulfillApis(context, owner, equippedStore);
  return context;
}

async function openPasture(context) {
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${port}/`, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await page.waitForSelector("#pasture-3d canvas", { timeout: 20000 });
  await page.waitForFunction(
    () =>
      (window.__pasture3d?.getPetCount?.() || 0) >= 2 ||
      document.querySelectorAll(".pasture-pet-hit").length >= 2,
    null,
    { timeout: 20000 },
  );
  return page;
}

const equippedStore = {};
const server = await startStatic();
const hub = startHub();
const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});

try {
  const loggedOutCtx = await prepareContext(browser, "", equippedStore);
  const loggedOut = await openPasture(loggedOutCtx);
  const outCount = await loggedOut.evaluate(
    () =>
      window.__pasture3d?.getPetCount?.() ||
      document.querySelectorAll(".pasture-pet-hit").length,
  );
  if (outCount < 2)
    throw new Error(`logged-out: expected >1 pet, got ${outCount}`);
  await loggedOut.evaluate(() =>
    window.__pasture3d?.inspectOwner?.("0x" + "b2".repeat(32)),
  );
  await loggedOut
    .locator("#pasture-inspect .pet-card")
    .waitFor({ state: "visible", timeout: 8000 });
  await loggedOut.screenshot({
    path: join(out, "logged-out.png"),
    fullPage: true,
  });
  await loggedOutCtx.close();
  console.log(`PASS logged-out pets=${outCount}`);

  const ctxA = await prepareContext(browser, ownerA, equippedStore);
  const ctxB = await prepareContext(browser, ownerB, equippedStore);
  const pageA = await openPasture(ctxA);
  const pageB = await openPasture(ctxB);

  await pageA
    .locator("#my-pet .pet-card")
    .waitFor({ state: "visible", timeout: 8000 });
  const hits = pageA.locator(".pasture-pet-hit");
  if ((await hits.count()) >= 1) {
    await hits.nth(0).click({ force: true });
  } else {
    await pageA.evaluate(() =>
      window.__pasture3d?.inspectOwner?.("0x" + "b2".repeat(32)),
    );
  }
  await pageA
    .locator("#pasture-inspect .pet-card")
    .waitFor({ state: "visible", timeout: 8000 });
  const inspectStill = await pageA.locator("#my-pet .pet-card").isVisible();
  if (!inspectStill) throw new Error("buddy card disappeared after inspect");

  const before = await pageA.evaluate(() =>
    window.__pasture3d.getOwnPosition(),
  );
  await pageA.evaluate(() => window.__pasture3d.walkTo(8, -6));
  await pageA.waitForFunction(
    (start) => {
      const pos = window.__pasture3d?.getOwnPosition?.();
      return !!pos && Math.hypot(pos.x - start.x, pos.z - start.z) > 1;
    },
    before,
    { timeout: 8000 },
  );
  const after = await pageA.evaluate(() => window.__pasture3d.getOwnPosition());
  await pageA.screenshot({
    path: join(out, "logged-in-moved.png"),
    fullPage: true,
  });

  await pageB.waitForFunction(
    (id) =>
      (window.__pasture3d?.getPlayers?.() || []).some(
        (p) => p.id === id && (Math.abs(p.x) > 1 || Math.abs(p.z) > 1),
      ),
    ownerA,
    { timeout: 10000 },
  );

  await pageA.evaluate(() =>
    window.__pasture3d.sendChat("Hello from the pasture"),
  );
  await pageB.waitForFunction(
    () =>
      (window.__pasture3d?.getChats?.() || []).some((c) =>
        /Hello from the pasture/.test(c.text),
      ),
    null,
    { timeout: 8000 },
  );
  await pageB
    .locator(".pasture-chat-line, .pasture-bubble")
    .first()
    .waitFor({ timeout: 5000 });
  await pageB.screenshot({
    path: join(out, "two-clients-chat.png"),
    fullPage: true,
  });

  await pageA
    .locator(".pasture-equip-row select")
    .first()
    .selectOption("hat-ribbon");
  await pageA.waitForFunction(
    (id) => window.__pasture3d?.getEquipped?.(id)?.hat === "hat-ribbon",
    ownerA,
    { timeout: 8000 },
  );
  await pageA.screenshot({
    path: join(out, "equipped-hat.png"),
    fullPage: true,
  });

  console.log(
    `PASS logged-in move ${JSON.stringify(before)} -> ${JSON.stringify(after)}; chat+equip ok`,
  );
  await ctxA.close();
  await ctxB.close();
} finally {
  await browser.close();
  hub.close();
  server.close();
}
