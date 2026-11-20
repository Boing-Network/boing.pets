import assert from "node:assert/strict";
import { test } from "node:test";
import {
  catalogUrl,
  DEFAULT_SERVER,
  toHttpBase,
} from "../src/market/catalog-source";

test("catalog URL: ?server= override, then the game's MP URL, then Fly", () => {
  assert.equal(
    catalogUrl("", undefined),
    `${DEFAULT_SERVER}/market/v1/catalog`,
  );
  assert.equal(
    catalogUrl("", "wss://boing-living-pets.fly.dev/"),
    "https://boing-living-pets.fly.dev/market/v1/catalog",
  );
  assert.equal(
    catalogUrl("?server=http://127.0.0.1:8787", "wss://x.example"),
    "http://127.0.0.1:8787/market/v1/catalog",
  );
  assert.equal(toHttpBase("javascript:alert(1)"), null);
  assert.equal(toHttpBase("ws://localhost:8787/path"), "http://localhost:8787");
});
