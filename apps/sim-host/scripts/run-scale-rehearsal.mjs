/**
 * Run the M17 scale rehearsal and write recorded timings.
 * Usage: node --import tsx apps/sim-host/scripts/run-scale-rehearsal.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatScaleRehearsalTiming,
  runScaleRehearsal,
} from "../src/scale-rehearsal.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, "../test/fixtures");
const outFile = path.join(outDir, "scale-rehearsal-results.json");

const timing = formatScaleRehearsalTiming(await runScaleRehearsal());
await mkdir(outDir, { recursive: true });
await writeFile(outFile, `${JSON.stringify(timing, null, 2)}\n`, "utf8");

console.log(JSON.stringify(timing, null, 2));
console.log(`wrote ${outFile}`);
