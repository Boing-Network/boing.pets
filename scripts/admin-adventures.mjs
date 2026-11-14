#!/usr/bin/env node
/**
 * Sign and send Idle Adventures admin requests.
 * Reads MULTI_TOKEN_ADMIN_SECRET_KEY from a local key file (default .dev.vars).
 * The key is never printed, logged, or written back.
 *
 * Usage:
 *   npm run admin:adventures -- analytics
 *   npm run admin:adventures -- state
 *   npm run admin:adventures -- popup-create --json payload.json
 *   npm run admin:adventures -- popup-end --id testnet-festival
 *   npm run admin:adventures -- override-rarity --json rarity.json
 *   npm run admin:adventures -- override-luck --json luck.json
 *
 * Options: --api http://127.0.0.1:8787  --key-file .dev.vars
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import * as ed from "@noble/ed25519";
import { blake3 } from "@noble/hashes/blake3";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";

const ACTIONS = new Set([
  "state",
  "analytics",
  "popup-create",
  "popup-update",
  "popup-end",
  "override-rarity",
  "override-luck",
]);

function usage(code = 1) {
  console.error(`Usage: npm run admin:adventures -- <action> [options]

Actions: ${[...ACTIONS].join(", ")}

Options:
  --api <url>         Admin API origin (default http://127.0.0.1:8787)
  --key-file <path>   Local operator key file (default .dev.vars)
  --origin <url>      Must match worker APP_ORIGIN (default: APP_ORIGIN in the key file, else the wrangler value)
  --json <path>       JSON payload merged into the request body
  --id <id>           Pop-Up id (for popup-end / popup-update)
  --note <text>       Audit note
`);
  process.exit(code);
}

function readNamedValue(filePath, name) {
  if (!existsSync(resolve(filePath))) return "";
  for (const raw of readFileSync(resolve(filePath), "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const cut = line.indexOf("=");
    if (cut <= 0) continue;
    if (line.slice(0, cut).trim() !== name) continue;
    let value = line.slice(cut + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    return value;
  }
  return "";
}

function parseArgs(argv) {
  const out = { api: "http://127.0.0.1:8787", keyFile: ".dev.vars", rest: {} };
  const args = [...argv];
  if (!args.length || args[0] === "-h" || args[0] === "--help") usage(0);
  out.action = args.shift();
  if (!ACTIONS.has(out.action)) {
    console.error(`Unknown action: ${out.action}`);
    usage(1);
  }
  while (args.length) {
    const flag = args.shift();
    if (flag === "--api") out.api = args.shift();
    else if (flag === "--key-file") out.keyFile = args.shift();
    else if (flag === "--json") out.jsonFile = args.shift();
    else if (flag === "--id") out.rest.id = args.shift();
    else if (flag === "--note") out.rest.note = args.shift();
    else if (flag === "--origin") out.origin = args.shift();
    else {
      console.error(`Unknown option: ${flag}`);
      usage(1);
    }
  }
  return out;
}

function readKeyHex(filePath) {
  const path = resolve(filePath);
  if (!existsSync(path)) {
    throw new Error(
      `Operator key file not found at ${filePath}. Pass --key-file or add MULTI_TOKEN_ADMIN_SECRET_KEY to .dev.vars.`,
    );
  }
  const text = readFileSync(path, "utf8");
  // Parse .dev.vars / dotenv without logging values.
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const cut = line.indexOf("=");
    if (cut <= 0) continue;
    const name = line.slice(0, cut).trim();
    if (name !== "MULTI_TOKEN_ADMIN_SECRET_KEY") continue;
    let value = line.slice(cut + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    value = value.replace(/^0x/i, "");
    if (!/^[0-9a-f]{64}$/i.test(value)) {
      throw new Error("Operator key file is not a 32-byte hex key.");
    }
    return value;
  }
  throw new Error(
    "Operator key file does not contain MULTI_TOKEN_ADMIN_SECRET_KEY.",
  );
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  let payload = {};
  if (opts.jsonFile) {
    payload = JSON.parse(readFileSync(resolve(opts.jsonFile), "utf8"));
  }
  const issuedAt = Date.now();
  const origin =
    opts.origin ||
    process.env.APP_ORIGIN ||
    readNamedValue(opts.keyFile, "APP_ORIGIN") ||
    "https://boing-pets.nico-chikuji.workers.dev";
  const message = [
    "Boing Pets adventure admin v1",
    `Origin: ${origin}`,
    `Issued: ${issuedAt}`,
    `Action: ${opts.action}`,
  ].join("\n");
  const keyHex = readKeyHex(opts.keyFile);
  const signature =
    "0x" +
    bytesToHex(
      await ed.signAsync(
        blake3(new TextEncoder().encode(message)),
        hexToBytes(keyHex),
      ),
    );
  const body = {
    action: opts.action,
    issued_at: issuedAt,
    message,
    signature,
    ...payload,
    ...opts.rest,
  };
  const url = `${opts.api.replace(/\/$/, "")}/api/admin/adventures`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    console.error(`HTTP ${res.status}`);
    console.error(text.slice(0, 400));
    process.exit(1);
  }
  if (!res.ok) {
    console.error(`HTTP ${res.status}: ${json.error || "request failed"}`);
    process.exit(1);
  }
  console.log(JSON.stringify(json, null, 2));
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Admin request failed",
  );
  process.exit(1);
});
