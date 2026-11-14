import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PASTURE_ZONE } from "../src/world/config/zones";
import {
  buddyChipLabel,
  equippedSummary,
  isOwnBuddy,
  publicPetInfo,
} from "../src/ui/pages/buddyPanel";
import { stationByKind } from "../src/pasture3d/stationInteract";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(resolve(root, rel), "utf8");
}

describe("wide public pasture layout", () => {
  it("lets the 3D canvas fill the former sidebar column", () => {
    const css = read("src/style.css");
    const match = css.match(/\.pasture-layout\s*\{[^}]+\}/);
    expect(match).toBeTruthy();
    const block = match![0];
    expect(block).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    expect(block).not.toMatch(/360px/);
    expect(block).not.toMatch(/280px/);
    expect(css).toMatch(
      /\.pasture-canvas\s*\{[^}]*height:\s*calc\(100dvh - 2rem\)/s,
    );

    const body = read("src/ui/pageBodies.ts");
    const pasture = body.slice(
      body.indexOf("  pasture:"),
      body.indexOf("  friends:"),
    );
    expect(pasture).toContain('id="pasture-canvas"');
    expect(pasture).toContain('id="buddy"');
    expect(pasture).toContain('id="buddy-chip"');
    expect(pasture).toContain("pasture-buddy-overlay");
    expect(pasture).not.toContain("pasture-panel");
    expect(pasture).not.toContain("YOUR LITTLE CORNER");
    expect(pasture).not.toContain("side panel");
    expect(pasture).toMatch(/Customization Station/i);
  });

  it("keeps wheel-zoom from scrolling the page and parks the buddy overlay on the canvas", () => {
    const css = read("src/style.css");
    expect(css).toMatch(/\.pasture-3d-stage\s*\{[^}]*touch-action:\s*none/s);
    expect(css).toMatch(
      /\.pasture-3d-stage\s*\{[^}]*overscroll-behavior:\s*contain/s,
    );
    expect(css).toMatch(/\.pasture-buddy-chip/);
    expect(css).toMatch(/#pasture-canvas\.is-overlay-open\s+\.pasture-bubble/);
  });

  it("opens private stats only for the player's own pet", () => {
    const pet = {
      owner: "aaa",
      traits: { species: "Boingle", personality: "gentle" },
      state: { stage: "teen" },
    };
    expect(isOwnBuddy(pet, "aaa")).toBe(true);
    expect(isOwnBuddy(pet, "bbb")).toBe(false);
    expect(isOwnBuddy(pet, null)).toBe(false);
    expect(publicPetInfo(pet)).toEqual({
      species: "Boingle",
      personality: "gentle",
      stage: "teen",
    });
    expect(equippedSummary({ hat: "hat-leaf", accessory: "frame-gold" })).toBe(
      "Hat: Leaf Cap · Accessory: Gold Card Frame",
    );
    expect(equippedSummary({})).toBe("Nothing equipped yet.");
    expect(
      buddyChipLabel({ connected: true, hasPet: true, species: "Boingle" }),
    ).toBe("Boingle");
    expect(buddyChipLabel({ connected: true, hasPet: false })).toBe("Hatch");
    expect(buddyChipLabel({ connected: false, hasPet: false })).toBe("Buddy");
  });

  it("places the customization station as a third landmark from spawn", () => {
    const station = stationByKind(PASTURE_ZONE, "customize");
    expect(station?.position).toEqual({ x: 22, y: 0, z: 10 });
    expect(station?.radius).toBe(3.4);
    expect(station?.label).toBe("Customization Station");
  });
});
