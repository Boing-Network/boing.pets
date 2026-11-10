import { describe, expect, it } from "vitest";
import {
  SPECIES,
  SPECIES_FEATURE_KIND,
  SPECIES_FEATURES,
  petAccentColor,
  petBodyColor,
  petSvg,
  speciesEarSvg,
  speciesFeatureKind,
  traits,
} from "../src/core";
import {
  PET_3D_LIGHTNESS_SCALE,
  PET_BODY_CENTER_Y,
  featureBounds,
  petMaterialColor,
  petModelParams,
  resolveShape,
  shapesFromSvgPath,
  svgToWorld,
  tokenizeSvgPath,
} from "../src/world/lib/petModel";

const owner = "0x" + "11".repeat(32);
const tx = "0x" + "22".repeat(32);

describe("card art is the source of truth for 3D pets", () => {
  it("keeps a stable SVG snapshot after extracting shared art constants", () => {
    const svg = petSvg(traits(owner, tx));
    expect(svg).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 190" role="img" aria-label="Happy Blobbit"><ellipse cx="100" cy="166" rx="55" ry="10" fill="#0003"/><g stroke="#142044" stroke-width="4" stroke-linejoin="round" fill="hsl(216.5625 80% 70%)"><ellipse cx="65" cy="71" rx="15" ry="18"/><ellipse cx="135" cy="71" rx="15" ry="18"/><ellipse cx="100" cy="114" rx="54" ry="48" fill="hsl(5.625 75% 72%)"/><ellipse cx="69" cy="155" rx="18" ry="9"/><ellipse cx="131" cy="155" rx="18" ry="9"/></g><circle cx="70" cy="130" r="7" fill="hsl(216.5625 80% 70%)" opacity=".6"/><g fill="#142044"><circle cx="80" cy="104" r="5"/><circle cx="120" cy="104" r="5"/></g><path d="M88 119Q100 134 112 119" fill="none" stroke="#142044" stroke-width="4" stroke-linecap="round"/></svg>',
    );
  });

  it("covers every species with a unique feature kind aligned to shape index", () => {
    expect(SPECIES_FEATURES).toHaveLength(SPECIES.length);
    expect(SPECIES_FEATURE_KIND).toHaveLength(SPECIES.length);
    expect(new Set(SPECIES_FEATURE_KIND).size).toBe(SPECIES.length);
    for (const [index, name] of SPECIES.entries()) {
      expect(speciesFeatureKind(index)).toBe(SPECIES_FEATURE_KIND[index]);
      const model = petModelParams({
        species: name,
        shape: index,
        hue: 8.4375,
        accent: 220.78125,
        spots: 2,
        antenna: 1,
      });
      expect(model.species).toBe(name);
      expect(model.shape).toBe(index);
      expect(model.featureKind).toBe(SPECIES_FEATURE_KIND[index]);
      expect(model.feature).toEqual(SPECIES_FEATURES[index]);
    }
  });

  it("maps Boingle to the three-pointed tuft, not bunny ears", () => {
    expect(SPECIES[9]).toBe("Boingle");
    expect(speciesFeatureKind(9)).toBe("tuft-crown");
    expect(speciesEarSvg(9)).toContain("M70 70L56 45L86 59L100 29");
    expect(speciesEarSvg(4)).toContain('rx="12" ry="35"');
    expect(speciesFeatureKind(4)).toBe("bunny-ears");
    expect(SPECIES[4]).toBe("Bunbounce");
  });

  it("uses the same body and accent colors as the card SVG", () => {
    const look = {
      species: "Boingle" as const,
      shape: 9,
      hue: 8.4375,
      accent: 220.78125,
      spots: 2,
      antenna: 0,
    };
    const svg = petSvg({
      ...look,
      personality: "Cozy",
    });
    expect(svg).toContain(petBodyColor(look.hue));
    expect(svg).toContain(petAccentColor(look.accent));
    expect(petBodyColor(look.hue)).toBe("hsl(8.4375 75% 72%)");
    expect(petAccentColor(look.accent)).toBe("hsl(220.78125 80% 70%)");
    const body = petMaterialColor(look.hue, "body");
    const accent = petMaterialColor(look.accent, "accent");
    // Same hue/sat as the card; lightness scaled only for ACES.
    expect(body.getHSL({ h: 0, s: 0, l: 0 }).h).toBeCloseTo(look.hue / 360, 5);
    expect(body.getHSL({ h: 0, s: 0, l: 0 }).s).toBeCloseTo(0.75, 5);
    expect(body.getHSL({ h: 0, s: 0, l: 0 }).l).toBeCloseTo(
      0.72 * PET_3D_LIGHTNESS_SCALE,
      5,
    );
    expect(accent.getHSL({ h: 0, s: 0, l: 0 }).h).toBeCloseTo(
      look.accent / 360,
      5,
    );
    expect(accent.getHSL({ h: 0, s: 0, l: 0 }).s).toBeCloseTo(0.8, 5);
  });

  it("derives hatch traits: spots, antenna===1 only, and shape from species when omitted", () => {
    const withAntenna = petModelParams({
      species: "Blobbit",
      hue: 10,
      accent: 200,
      spots: 3,
      antenna: 1,
    });
    expect(withAntenna.shape).toBe(0);
    expect(withAntenna.showAntenna).toBe(true);
    expect(withAntenna.spots).toHaveLength(3);
    const noAntenna = petModelParams({
      species: "Blobbit",
      hue: 10,
      accent: 200,
      spots: 0,
      antenna: 2,
    });
    expect(noAntenna.showAntenna).toBe(false);
    expect(noAntenna.spots).toHaveLength(0);
    expect(resolveShape({ hue: 1, accent: 2, species: "Mushling" })).toBe(8);
    expect(resolveShape({ hue: 1, accent: 2, species: "Unknown" })).toBe(0);
    expect(resolveShape({ hue: 1, accent: 2, shape: 7 })).toBe(7);
  });

  it("anchors hats and accessories above the body, higher for cap species", () => {
    const bunny = petModelParams({
      species: "Bunbounce",
      hue: 20,
      accent: 200,
      spots: 0,
      antenna: 0,
    });
    const mush = petModelParams({
      species: "Mushling",
      hue: 20,
      accent: 200,
      spots: 0,
      antenna: 0,
    });
    const blob = petModelParams({
      species: "Blobbit",
      hue: 20,
      accent: 200,
      spots: 0,
      antenna: 0,
    });
    expect(bunny.hatAnchorY).toBeGreaterThan(bunny.body.cy);
    expect(mush.hatAnchorY).toBeGreaterThan(blob.hatAnchorY);
    expect(mush.hatAnchorY).toBeGreaterThan(mush.bodyTopY);
    expect(bunny.labelY).toBeGreaterThan(bunny.featureTopY);
    expect(blob.accessoryRadius).toBeGreaterThan(blob.body.x);
    expect(PET_BODY_CENTER_Y).toBeGreaterThan(0);
    const footBottom = Math.min(...blob.feet.map((foot) => foot.y - foot.cy));
    expect(footBottom).toBeGreaterThan(0);
    expect(footBottom).toBeLessThan(0.06);
  });

  it("parses every species path into one or more 3D shapes", () => {
    for (const [index, feature] of SPECIES_FEATURES.entries()) {
      if (feature.kind !== "path") continue;
      const tokens = tokenizeSvgPath(feature.d);
      expect(tokens.length).toBeGreaterThan(0);
      const shapes = shapesFromSvgPath(feature.d);
      expect(shapes.length).toBeGreaterThan(0);
      const box = featureBounds(feature);
      expect(box.maxX).toBeGreaterThan(box.minX);
      expect(box.maxY).toBeGreaterThan(box.minY);
      const top = svgToWorld((box.minX + box.maxX) / 2, box.minY);
      expect(Number.isFinite(top.y)).toBe(true);
      expect(speciesFeatureKind(index)).toBe(SPECIES_FEATURE_KIND[index]);
    }
  });
});
