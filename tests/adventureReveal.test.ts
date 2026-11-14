import { describe, expect, it } from "vitest";
import {
  ADVENTURE_RARITY_FX,
  adventureRevealClassName,
  buildAdventureReveal,
  displayRarityName,
  rarityStickerSvg,
} from "../src/ui/adventureReveal";
import { ITEM_RARITIES } from "../src/content/rarities";

describe("adventure reward reveal", () => {
  it("gives every rarity a distinct name, color, and effect", () => {
    const names = new Set<string>();
    const colors = new Set<string>();
    const effects = new Set<string>();
    for (const id of ITEM_RARITIES) {
      const fx = ADVENTURE_RARITY_FX[id];
      names.add(fx.name);
      colors.add(fx.color);
      effects.add(fx.effect);
      if (id === "legendary" || id === "mythic" || id === "iconic") {
        expect(fx.holo).toBe(true);
      }
      if (id === "mythic" || id === "iconic") expect(fx.extraFlair).toBe(true);
    }
    expect(names.size).toBe(ITEM_RARITIES.length);
    expect(colors.size).toBe(ITEM_RARITIES.length);
    expect(effects.size).toBe(ITEM_RARITIES.length);
    expect(displayRarityName("mythic")).toBe("Grail");
    expect(displayRarityName("iconic")).toBe("Vaulted");
  });

  it("renders name, rarity, category, source, status, date, owners, and mint", () => {
    const reward = buildAdventureReveal({
      gameItemId: "hat-beanie",
      rarity: "uncommon",
      dropSource: "The Night Market · Dispatch",
      acquiredAt: Date.UTC(2026, 10, 14, 12, 0, 0),
      ownerCount: 3,
      mintStatus: "pending",
    });
    expect(reward.name).toMatch(/beanie/i);
    expect(reward.category).toBeTruthy();
    expect(reward.dropSource).toMatch(/Night Market/);
    expect(reward.ownership).toMatch(/Tradeable|Collectible|Bound/);
    expect(reward.ownerCount).toBe(3);
    expect(reward.mintStatus).toBe("pending");
    expect(adventureRevealClassName(reward)).toContain("rarity-uncommon");
  });

  it("adds holographic flair for legendary and above", () => {
    const legendary = buildAdventureReveal({
      gameItemId: "jacket-studio",
      rarity: "legendary",
      dropSource: "Designer District · Dispatch",
      ownerCount: 1,
      mintStatus: "confirmed",
    });
    expect(legendary.holo).toBe(true);
    expect(legendary.extraFlair).toBe(false);
    expect(adventureRevealClassName(legendary)).toContain("has-holo");
    const grail = buildAdventureReveal({
      rarity: "mythic",
      name: "Grail Tag",
      mintStatus: "confirmed",
    });
    expect(grail.holo).toBe(true);
    expect(grail.extraFlair).toBe(true);
    expect(adventureRevealClassName(grail)).toContain("has-flair");
  });
});

describe("rarity stickers", () => {
  it("gives each rarity its own sticker mark", () => {
    const marks = [
      "common",
      "uncommon",
      "rare",
      "epic",
      "legendary",
      "mythic",
      "iconic",
    ].map((id) => rarityStickerSvg(id));
    expect(new Set(marks).size).toBe(7);
    for (const svg of marks) {
      expect(svg).toContain("<svg");
      expect(svg).toContain("adventure-rarity-sticker");
    }
  });
});
