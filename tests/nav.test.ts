import { describe, expect, it } from "vitest";
import { HASH_REDIRECTS, PAGE_META, renderHeader } from "../src/ui/nav";
import { PAGE_BODIES } from "../src/ui/pageBodies";

describe("multipage nav", () => {
  it("defines a path and body for each pasture page", () => {
    for (const id of Object.keys(PAGE_META)) {
      expect(PAGE_BODIES[id]).toBeTruthy();
      expect(PAGE_META[id as keyof typeof PAGE_META].path).toMatch(/^\//);
    }
  });

  it("renders dropdown groups with an active page marker", () => {
    const html = renderHeader("fishing");
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('href="/fishing.html"');
    expect(html).toContain("Activities");
    expect(html).toContain("Progress");
    expect(html).toContain("/world.html");
  });

  it("maps legacy hashes to multipage routes", () => {
    expect(HASH_REDIRECTS.fishing).toBe("/fishing.html");
    expect(HASH_REDIRECTS.social).toBe("/friends.html");
    expect(HASH_REDIRECTS.buddy).toBe("/#buddy");
  });
});
