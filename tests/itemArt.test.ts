import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { blake3 } from "@noble/hashes/blake3";
import { bytesToHex } from "@noble/hashes/utils";
import {
  decodeMultiTokenCalldata,
  encodeMultiTokenSetItemMetadataCalldata,
} from "@boing-network/boing-sdk";
import {
  ONCHAIN_ITEMS,
  ONCHAIN_RESERVED_ITEM_IDS,
} from "../src/content/onchainItems";
import { itemGuide } from "../src/content/items";
import { hasItemIcon, itemIconSvg } from "../src/ui/itemIcons";

const ORIGIN = "https://boing-pets.nico-chikuji.workers.dev";
const NEW_ITEM_IDS = [4, 5, 13, 14, 23, 24, 33, 34, 43, 44, 63, 77, 78, 79];

type PendingWrite = {
  itemId: number;
  gameItemId: string;
  name: string;
  metadataFile: string;
  image: string;
  metadataHash: string;
  calldata: string;
  command: string;
};

type PendingMetadata = {
  status: string;
  writes: PendingWrite[];
};

describe("unique item art", () => {
  it("gives every catalog item its own icon instead of a category fallback", () => {
    const ids = itemGuide().map((row) => row.gameItemId);
    const svgs = new Map<string, string>();
    for (const id of ids) {
      expect(hasItemIcon(id), id).toBe(true);
      const svg = itemIconSvg(id);
      expect(svg.startsWith("<svg ")).toBe(true);
      expect(svgs.has(svg), "duplicate art for " + id).toBe(false);
      svgs.set(svg, id);
    }
  });

  it("keeps hosted /items SVGs in sync with the in-game icons", () => {
    for (const row of itemGuide()) {
      const hosted = readFileSync(
        join("public/items", row.gameItemId + ".svg"),
        "utf8",
      );
      expect(hosted).toBe(itemIconSvg(row.gameItemId) + "\n");
    }
  });
});

describe("prepared on-chain image URL writes", () => {
  it("lists unsent set_item_metadata calldata for the new item ids only", () => {
    const pending = JSON.parse(
      readFileSync("docs/metadata/pending-set-metadata.json", "utf8"),
    ) as PendingMetadata;
    expect(pending.status).toBe("unsent");
    expect(pending.writes).toHaveLength(NEW_ITEM_IDS.length);
    const ids = pending.writes.map((row) => row.itemId).sort((a, b) => a - b);
    expect(ids).toEqual([...NEW_ITEM_IDS].sort((a, b) => a - b));
    for (const reserved of ONCHAIN_RESERVED_ITEM_IDS) {
      expect(ids).not.toContain(reserved.itemId);
    }

    const files = readdirSync("docs/metadata/items")
      .filter((name) => name.endsWith(".json"))
      .sort();
    expect(files).toHaveLength(NEW_ITEM_IDS.length);

    for (const row of pending.writes) {
      const onchain = ONCHAIN_ITEMS.find((item) => item.itemId === row.itemId);
      expect(onchain?.gameItemId).toBe(row.gameItemId);
      expect(row.image).toBe(ORIGIN + "/items/" + row.gameItemId + ".svg");
      const bytes = readFileSync(row.metadataFile);
      const json = JSON.parse(bytes.toString("utf8")) as {
        itemId: number;
        gameItemId: string;
        image: string;
      };
      expect(json.itemId).toBe(row.itemId);
      expect(json.image).toBe(row.image);
      expect(json).not.toHaveProperty("note");
      expect(row.metadataHash).toBe("0x" + bytesToHex(blake3(bytes)));
      expect(row.calldata).toBe(
        "0x" +
          bytesToHex(
            encodeMultiTokenSetItemMetadataCalldata(
              row.itemId,
              row.metadataHash,
            ),
          ),
      );
      const decoded = decodeMultiTokenCalldata(row.calldata);
      expect(decoded).toMatchObject({
        kind: "set_item_metadata",
        itemId: BigInt(row.itemId),
        metadataHash: row.metadataHash,
      });
    }
  });

  it("refuses flags that would sign or broadcast a write", () => {
    let message = "";
    let status = 0;
    try {
      execFileSync(
        process.execPath,
        ["scripts/prepare-item-metadata.mjs", "--send"],
        { encoding: "utf8" },
      );
    } catch (err) {
      const failed = err as { status?: number; stderr?: string };
      status = failed.status ?? 0;
      message = String(failed.stderr ?? "");
    }
    expect(status).toBe(2);
    expect(message).toMatch(/Refusing --send/);
  });
});
