import assert from "node:assert/strict";
import { test } from "node:test";
import { SPECIES_CATALOG } from "@boing-pets/contract";
import {
  farBodyForSpecies,
  rigForSpecies,
  rigTriangles,
} from "../src/view/creatures/anatomy/rig";

const FLIERS = new Set([
  "lantern-moth",
  "field-nightjar",
  "gloam-bat",
  "crag-owl",
]);

test("every species has its own procedural body with head, legs and coat attributes", () => {
  const signatures = new Set<string>();
  for (const row of SPECIES_CATALOG) {
    const rig = rigForSpecies(row.id);
    const names = rig.parts.map((part) => part.name);
    assert.ok(names.includes("body"), row.slug);
    assert.ok(names.includes("head"), row.slug);
    const legs = names.filter((name) => name.startsWith("leg")).length;
    // Moths fly with legs tucked out of sight; everything else has legs.
    if (row.slug !== "lantern-moth") assert.ok(legs >= 2, `${row.slug} legs`);
    if (FLIERS.has(row.slug)) {
      assert.ok(names.includes("wingL") && names.includes("wingR"), row.slug);
      assert.equal(rig.info.gait, "fly", row.slug);
    } else {
      assert.notEqual(rig.info.gait, "fly", row.slug);
    }
    for (const part of rig.parts) {
      const g = part.geometry;
      assert.ok(g.getAttribute("color"), `${row.slug} ${part.name} color`);
      assert.equal(g.getAttribute("glow")?.itemSize, 4, `${row.slug} glow`);
      assert.ok(g.index, `${row.slug} indexed`);
    }
    const body = rig.parts.find((part) => part.name === "body")!.geometry;
    body.computeBoundingBox();
    const size = body.boundingBox!.max.clone().sub(body.boundingBox!.min);
    signatures.add([size.x, size.y, size.z].map((v) => v.toFixed(3)).join(","));
  }
  // No two species share a body shape.
  assert.equal(signatures.size, SPECIES_CATALOG.length);
});

test("rigs are cached and stay within the triangle budget", () => {
  for (const row of SPECIES_CATALOG) {
    assert.equal(rigForSpecies(row.id), rigForSpecies(row.id));
    const near = rigTriangles(row.id);
    const far = (farBodyForSpecies(row.id).index?.count ?? 0) / 3;
    assert.ok(near < 12_000, `${row.slug} near ${near}`);
    assert.ok(far < near * 0.6, `${row.slug} far ${far} vs near ${near}`);
    // Few draw calls: one mesh per animated part, at most 11.
    assert.ok(rigForSpecies(row.id).parts.length <= 11, row.slug);
  }
});
