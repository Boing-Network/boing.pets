/**
 * Prepare (do not send) multi-token set_item_metadata calldata for new item art.
 *
 * Hashes each docs/metadata/items/*.json file as BLAKE3 of its exact UTF-8
 * bytes, then encodes admin-only set_item_metadata(itemId, hash) calldata.
 *
 * This script never reads operator keys, never signs, and never submits a
 * transaction. Passing --send, --broadcast, --submit, or --sign exits with
 * an error so a typo cannot go on-chain.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { blake3 } from "@noble/hashes/blake3";
import { bytesToHex } from "@noble/hashes/utils";
import { encodeMultiTokenSetItemMetadataCalldata } from "@boing-network/boing-sdk";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const META_DIR = join(ROOT, "docs/metadata/items");
const PENDING_PATH = join(ROOT, "docs/metadata/pending-set-metadata.json");
const ORIGIN = "https://boing-pets.nico-chikuji.workers.dev";
const CONTRACT =
  "0x616c23d0c04015f72c3a3f63dcac1c734ce2151320a75a4fa99f318dd76b4451";

const BLOCKED = new Set(["--send", "--broadcast", "--submit", "--sign"]);

export function blockedArgs(argv = process.argv.slice(2)) {
  return argv.filter((arg) => BLOCKED.has(arg));
}

export function metadataHashHex(bytes) {
  return "0x" + bytesToHex(blake3(bytes));
}

export function buildPendingMetadata() {
  const files = readdirSync(META_DIR)
    .filter((name) => name.endsWith(".json"))
    .sort();
  const writes = files.map((name) => {
    const rel = "docs/metadata/items/" + name;
    const bytes = readFileSync(join(META_DIR, name));
    const json = JSON.parse(bytes.toString("utf8"));
    const metadataHash = metadataHashHex(bytes);
    const calldata =
      "0x" +
      bytesToHex(
        encodeMultiTokenSetItemMetadataCalldata(json.itemId, metadataHash),
      );
    return {
      itemId: json.itemId,
      gameItemId: json.gameItemId,
      name: json.name,
      metadataFile: rel,
      image: json.image,
      metadataHash,
      calldata,
      command:
        "boing items set-metadata --item " + json.itemId + " --file " + rel,
    };
  });
  return {
    status: "unsent",
    approval: "Needs Nico's approval. Do not sign or broadcast.",
    note: "Image URLs point at APP_ORIGIN /items/<gameItemId>.svg and go live only after a future deploy. This file is prepared calldata only.",
    contract: CONTRACT,
    origin: ORIGIN,
    hash: "BLAKE3 of the exact UTF-8 bytes of each metadata JSON file (including trailing newline).",
    writes,
  };
}

export function writePendingMetadata() {
  const pending = buildPendingMetadata();
  writeFileSync(PENDING_PATH, JSON.stringify(pending, null, 2) + "\n", "utf8");
  return pending;
}

export function main(argv = process.argv.slice(2)) {
  const blocked = blockedArgs(argv);
  if (blocked.length) {
    console.error(
      "Refusing " +
        blocked.join(", ") +
        ". This script only prepares unsent set_item_metadata calldata.",
    );
    process.exitCode = 2;
    return 2;
  }
  const pending = writePendingMetadata();
  console.log(
    "Prepared " +
      pending.writes.length +
      " unsent metadata writes at docs/metadata/pending-set-metadata.json",
  );
  return 0;
}

const invoked =
  Boolean(process.argv[1]) &&
  fileURLToPath(import.meta.url) === process.argv[1];
if (invoked) main();
