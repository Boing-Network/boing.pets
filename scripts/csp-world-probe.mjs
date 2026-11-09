import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const headersFile = path.join(root, "public", "_headers");

function parseCsp() {
  const raw = fs.readFileSync(headersFile, "utf8");
  const match = raw.match(/Content-Security-Policy:\s*(.+)/);
  if (!match) throw new Error("CSP missing from public/_headers");
  return match[1].trim();
}

const csp = parseCsp();
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".map": "application/json",
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  let filePath = path.join(dist, decodeURIComponent(url.pathname));
  if (url.pathname.endsWith("/")) filePath = path.join(filePath, "index.html");
  if (!filePath.startsWith(dist)) {
    res.writeHead(403);
    res.end("forbidden");
    return;
  }
  const candidate = path.join(dist, url.pathname.replace(/^\//, ""));
  if ((!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) &&
      fs.existsSync(candidate) &&
      fs.statSync(candidate).isFile()) {
    filePath = candidate;
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404, {
      "Content-Security-Policy": csp,
      "X-Content-Type-Options": "nosniff",
    });
    res.end("not found");
    return;
  }
  const ext = path.extname(filePath);
  res.writeHead(200, {
    "Content-Type": mime[ext] || "application/octet-stream",
    "Content-Security-Policy": csp,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store",
  });
  fs.createReadStream(filePath).pipe(res);
});

const port = 4177;
await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
console.log(JSON.stringify({ listening: `http://127.0.0.1:${port}`, csp }));

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require("playwright");
} catch {
  console.error("PLAYWRIGHT_MISSING");
  server.close();
  process.exit(2);
}

const browser = await playwright.chromium.launch({ headless: true });
const page = await browser.newPage();
const consoleLogs = [];
const pageErrors = [];
const cspViolations = [];

page.on("console", (msg) => {
  consoleLogs.push({ type: msg.type(), text: msg.text() });
});
page.on("pageerror", (err) => {
  pageErrors.push(String(err));
});
await page.exposeFunction("__reportCsp", (v) => {
  cspViolations.push(v);
});
await page.addInitScript(`
  document.addEventListener("securitypolicyviolation", (e) => {
    window.__reportCsp({
      violatedDirective: e.violatedDirective,
      effectiveDirective: e.effectiveDirective,
      blockedURI: e.blockedURI,
      originalPolicy: e.originalPolicy,
      disposition: e.disposition,
    });
  });
`);

const response = await page.goto(`http://127.0.0.1:${port}/world.html`, {
  waitUntil: "load",
  timeout: 60_000,
});
await page.waitForTimeout(5000);
const title = await page.title();
const canvasCount = await page.locator("canvas").count();
const result = {
  status: response?.status() ?? null,
  title,
  canvasCount,
  cspHeader: response?.headers()["content-security-policy"] || null,
  cspViolations,
  pageErrors,
  consoleErrors: consoleLogs.filter((l) => l.type === "error"),
  consoleWarnings: consoleLogs.filter((l) => l.type === "warning").slice(0, 20),
};
fs.writeFileSync(
  path.join(root, "scripts", "csp-world-probe-result.json"),
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result, null, 2));
await browser.close();
server.close();

const apiNoise = (msg) =>
  /WebSocket connection|Failed to fetch|Unexpected response code: 404/i.test(
    msg,
  );
const realPageErrors = pageErrors.filter((e) => !apiNoise(e));
process.exit(cspViolations.length || realPageErrors.length ? 1 : 0);
