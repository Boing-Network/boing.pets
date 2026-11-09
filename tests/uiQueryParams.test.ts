import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith(".ts") || p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

describe("UI API query params", () => {
  it("does not use app. prefixes in query keys or element ids", () => {
    const files = walk(join(process.cwd(), "src"));
    const bad: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      if (/[?&]app\.[a-zA-Z_]+=/.test(text)) bad.push(`${file}: query app.*`);
      if (/#app\.(mine-|next\b)/.test(text)) bad.push(`${file}: #app.* id`);
    }
    expect(bad).toEqual([]);
  });
});
