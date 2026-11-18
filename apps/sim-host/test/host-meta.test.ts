import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createFileHostMetaStore } from "../src/persist/host-meta";

test("host meta sidecar round-trips influence accept times", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "living-pets-host-meta-"));
  try {
    const store = createFileHostMetaStore(path.join(dir, "host-meta.json"));
    const empty = await store.read();
    assert.deepEqual(empty.influenceAcceptedAtMs, []);

    await store.write({ influenceAcceptedAtMs: [10, 20, 30] });
    const again = await store.read();
    assert.deepEqual(again.influenceAcceptedAtMs, [10, 20, 30]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
