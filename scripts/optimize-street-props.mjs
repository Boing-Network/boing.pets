#!/usr/bin/env node
/**
 * Pivot-adjusted Nico street props → public/street-props.
 * Compresses with meshopt + WebP (max 1024) to keep the added payload small.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "playtest-artifacts", "nico-glbs", "pivoted");
const rawDir = join(root, "playtest-artifacts", "nico-glbs");
const outDir = join(root, "public", "street-props");
mkdirSync(outDir, { recursive: true });

const files = [
  ["a3.glb", "fat-caps.glb"],
  ["a4.glb", "tagged-hydrant.glb"],
  ["a5.glb", "sticker-box.glb"],
  ["a6.glb", "wheatpaste.glb"],
  ["a7.glb", "pigeon-drum.glb"],
  ["a8.glb", "corner-store.glb"],
  ["a9.glb", "night-cart.glb"],
  ["a10.glb", "site-fence.glb"],
  ["a11.glb", "wood-crate.glb"],
  ["a12.glb", "tagged-cone.glb"],
  ["a13.glb", "walk-up.glb"],
];

const rows = [];
for (const [rawName, outName] of files) {
  const input = join(srcDir, outName);
  const output = join(outDir, outName);
  if (!existsSync(input)) {
    throw new Error("missing pivoted source " + input);
  }
  const rawBytes = statSync(join(rawDir, rawName)).size;
  const cmd = `npx --yes @gltf-transform/cli optimize "${input}" "${output}" --compress meshopt --texture-compress webp --texture-size 1024 --simplify false`;
  const result = spawnSync(cmd, { cwd: root, stdio: "inherit", shell: true });
  if (result.status !== 0) {
    throw new Error("optimize failed " + outName);
  }
  const outBytes = statSync(output).size;
  const row = {
    name: outName,
    rawBytes,
    outBytes,
    ratio: Number((outBytes / rawBytes).toFixed(3)),
  };
  rows.push(row);
  console.log("OK", outName, rawBytes, "->", outBytes);
}

const totalRaw = rows.reduce((s, r) => s + r.rawBytes, 0);
const totalOut = rows.reduce((s, r) => s + r.outBytes, 0);
const bodyRaw = statSync(join(rawDir, "body.glb")).size;
const bodyOut = statSync(
  join(root, "public", "characters", "street-body.glb"),
).size;
const manifest = {
  props: rows,
  propTotalRaw: totalRaw,
  propTotalOut: totalOut,
  body: { rawBytes: bodyRaw, outBytes: bodyOut },
};
writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(
  "TOTAL",
  totalRaw,
  "->",
  totalOut,
  "MB",
  (totalOut / 1048576).toFixed(2),
);
