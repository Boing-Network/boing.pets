#!/usr/bin/env node
/**
 * Optimize a curated subset of official Kenney CC0 packs into public/yard-kits.
 * Packs were downloaded from kenney.nl after confirming Creative Commons CC0
 * on each source page (see CREDITS/ASSETS.md).
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, copyFileSync, existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcRoot = join(root, "playtest-artifacts", "kenney-src");
const outDir = join(root, "public", "yard-kits");
const workDir = join(root, "playtest-artifacts", "yard-kits-work");

const packs = {
  commercial: join(srcRoot, "city-kit-commercial", "Models", "GLB format"),
  industrial: join(srcRoot, "city-kit-industrial", "Models", "GLB format"),
  suburban: join(srcRoot, "city-kit-suburban", "Models", "GLB format"),
  furniture: join(srcRoot, "furniture-kit", "Models", "GLTF format"),
  food: join(srcRoot, "food-kit", "Models", "GLB format"),
  nature: join(srcRoot, "nature-kit", "Models", "GLTF format"),
  skate: join(srcRoot, "mini-skate", "Models", "GLB format"),
};

const picks = [
  { pack: "commercial", file: "building-e.glb", out: "shop-wide.glb" },
  { pack: "commercial", file: "building-a.glb", out: "shop-narrow.glb" },
  { pack: "commercial", file: "building-d.glb", out: "shop-small.glb" },
  { pack: "commercial", file: "building-c.glb", out: "shop-mid.glb" },
  {
    pack: "commercial",
    file: "building-skyscraper-a.glb",
    out: "sky-tower-a.glb",
  },
  {
    pack: "commercial",
    file: "building-skyscraper-e.glb",
    out: "sky-tower-e.glb",
  },
  {
    pack: "commercial",
    file: "low-detail-building-a.glb",
    out: "sky-low-a.glb",
  },
  {
    pack: "commercial",
    file: "low-detail-building-b.glb",
    out: "sky-low-b.glb",
  },
  {
    pack: "commercial",
    file: "low-detail-building-e.glb",
    out: "sky-low-e.glb",
  },
  {
    pack: "commercial",
    file: "low-detail-building-g.glb",
    out: "sky-low-g.glb",
  },
  {
    pack: "commercial",
    file: "low-detail-building-i.glb",
    out: "sky-low-i.glb",
  },
  {
    pack: "commercial",
    file: "low-detail-building-wide-a.glb",
    out: "sky-low-wide-a.glb",
  },
  {
    pack: "commercial",
    file: "low-detail-building-wide-b.glb",
    out: "sky-low-wide-b.glb",
  },
  {
    pack: "commercial",
    file: "detail-awning-wide.glb",
    out: "awning-wide.glb",
  },
  {
    pack: "commercial",
    file: "detail-overhang-wide.glb",
    out: "overhang-wide.glb",
  },
  {
    pack: "industrial",
    file: "shipping-container-a.glb",
    out: "container-a.glb",
  },
  {
    pack: "industrial",
    file: "shipping-container-b.glb",
    out: "container-b.glb",
  },
  { pack: "industrial", file: "detail-tank.glb", out: "tank.glb" },
  { pack: "suburban", file: "planter.glb", out: "planter.glb" },
  { pack: "suburban", file: "fence-low.glb", out: "fence-low.glb" },
  { pack: "suburban", file: "tree-large.glb", out: "tree-large.glb" },
  { pack: "nature", file: "tree_oak.glb", out: "tree-oak.glb" },
  { pack: "nature", file: "tree_detailed.glb", out: "tree-detailed.glb" },
  { pack: "nature", file: "pot_large.glb", out: "pot-large.glb" },
  { pack: "nature", file: "plant_bushDetailed.glb", out: "bush.glb" },
  { pack: "nature", file: "flower_redA.glb", out: "flower-red.glb" },
  { pack: "nature", file: "flower_yellowA.glb", out: "flower-yellow.glb" },
  { pack: "nature", file: "lily_large.glb", out: "lily.glb" },
  { pack: "nature", file: "rock_tallA.glb", out: "rock-tall.glb" },
  { pack: "nature", file: "stone_tallB.glb", out: "stone-tall.glb" },
  { pack: "furniture", file: "coatRackStanding.glb", out: "coat-rack.glb" },
  { pack: "furniture", file: "pottedPlant.glb", out: "potted-plant.glb" },
  { pack: "furniture", file: "cardboardBoxClosed.glb", out: "box-closed.glb" },
  { pack: "furniture", file: "kitchenBar.glb", out: "kitchen-bar.glb" },
  { pack: "furniture", file: "kitchenFridgeSmall.glb", out: "fridge.glb" },
  { pack: "furniture", file: "kitchenStove.glb", out: "stove.glb" },
  { pack: "furniture", file: "stoolBar.glb", out: "stool.glb" },
  { pack: "furniture", file: "lampWall.glb", out: "lamp-wall.glb" },
  { pack: "furniture", file: "bathroomMirror.glb", out: "mirror.glb" },
  { pack: "furniture", file: "desk.glb", out: "desk.glb" },
  { pack: "food", file: "burger-cheese.glb", out: "burger.glb" },
  { pack: "food", file: "fries.glb", out: "fries.glb" },
  { pack: "food", file: "hot-dog.glb", out: "hotdog.glb" },
  { pack: "food", file: "soda-can.glb", out: "soda.glb" },
  { pack: "food", file: "pizza.glb", out: "pizza.glb" },
  { pack: "food", file: "cup-coffee.glb", out: "coffee.glb" },
  { pack: "food", file: "barrel.glb", out: "barrel.glb" },
  { pack: "skate", file: "bowl-side.glb", out: "bowl-side.glb" },
  {
    pack: "skate",
    file: "bowl-corner-inner.glb",
    out: "bowl-corner-inner.glb",
  },
  {
    pack: "skate",
    file: "bowl-corner-outer.glb",
    out: "bowl-corner-outer.glb",
  },
  { pack: "skate", file: "bowl-platform.glb", out: "bowl-platform.glb" },
  { pack: "skate", file: "ramp.glb", out: "skate-ramp.glb" },
  { pack: "skate", file: "rail-low.glb", out: "rail-low.glb" },
  { pack: "skate", file: "fence.glb", out: "skate-fence.glb" },
  { pack: "skate", file: "bench.glb", out: "skate-bench.glb" },
];

mkdirSync(outDir, { recursive: true });
mkdirSync(workDir, { recursive: true });

let failed = 0;
const sizes = [];
for (const pick of picks) {
  const input = join(packs[pick.pack], pick.file);
  if (!existsSync(input)) {
    console.error("MISSING", input);
    failed++;
    continue;
  }
  const output = join(outDir, pick.out);
  const cmd = `npx --yes @gltf-transform/cli optimize "${input}" "${output}" --compress meshopt --texture-compress webp --texture-size 512`;
  const result = spawnSync(cmd, { cwd: root, stdio: "inherit", shell: true });
  if (result.status !== 0) {
    console.error("optimize failed for", pick.out, "- copying raw as fallback");
    copyFileSync(input, output);
    failed++;
  }
  const { statSync } = await import("node:fs");
  const size = statSync(output).size;
  sizes.push({ out: pick.out, pack: pick.pack, size });
  console.log("OK", pick.out, size);
}

sizes.sort((a, b) => b.size - a.size);
const total = sizes.reduce((s, r) => s + r.size, 0);
writeFileSync(
  join(outDir, "manifest.json"),
  JSON.stringify({ total, count: sizes.length, files: sizes }, null, 2),
);
console.log(
  "TOTAL_BYTES",
  total,
  "MB",
  (total / 1024 / 1024).toFixed(2),
  "failed",
  failed,
);
