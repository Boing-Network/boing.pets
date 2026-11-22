/**
 * Realism guard: each quadruped and bird must keep believable proportions
 * against its real animal, and sizes in the world must follow one consistent
 * compression curve (small animals are enlarged so they stay visible, but
 * a fox must never end up bigger than a wolf relative to real life).
 *
 * Reference values are rough field measurements in cm. Tolerances are wide on
 * purpose: this is a stylised game, so it only catches clear drift (a hare
 * with a stag's legs, a swift with a sparrow's tail), not artistic choices.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { ANATOMY } from "../src/view/creatures/anatomy/species";
import { worldScaleForSkin } from "../src/view/creatures/materials";
import type { SpeciesSlug } from "@boing-pets/contract";

type QuadRef = { L: number; H: number; T: number; h: number; e: number };
type BirdRef = { len: number; span: number; tail: number; bill: number };

// L nose-to-rump, H shoulder height, T tail, h head length, e ear length.
const QUAD: Record<string, QuadRef> = {
  "fire-fox": { L: 67, H: 40, T: 40, h: 14, e: 9 },
  "moss-stag": { L: 190, H: 120, T: 15, h: 45, e: 20 },
  "moon-hare": { L: 60, H: 30, T: 8, h: 12.5, e: 11 },
  "crag-ram": { L: 140, H: 90, T: 12, h: 30, e: 11 },
  "thistle-hog": { L: 150, H: 80, T: 25, h: 40, e: 15 },
  "barrow-badger": { L: 80, H: 28, T: 15, h: 15, e: 4 },
  "shade-lynx": { L: 95, H: 65, T: 20, h: 20, e: 8 },
  "dusk-raccoon": { L: 60, H: 28, T: 25, h: 13, e: 5 },
  "slate-marmot": { L: 55, H: 22, T: 20, h: 11, e: 2.5 },
  "silver-deer": { L: 150, H: 95, T: 17, h: 35, e: 15 },
  "dew-shrew": { L: 8, H: 2.5, T: 5, h: 2.5, e: 0.4 },
  "hollow-squirrel": { L: 25, H: 11, T: 22, h: 5.5, e: 2 },
  "ash-wolf": { L: 125, H: 75, T: 40, h: 27, e: 11 },
  "stone-pika": { L: 18, H: 8, T: 0.7, h: 4.5, e: 2 },
  "clover-vole": { L: 11, H: 4.5, T: 4, h: 3, e: 1 },
  "thorn-porcupine": { L: 75, H: 30, T: 12, h: 12, e: 2 },
  "briar-weasel": { L: 30, H: 8, T: 12, h: 6, e: 1.5 },
  "ledge-goat": { L: 140, H: 90, T: 15, h: 30, e: 11 },
  "opal-dormouse": { L: 12, H: 4, T: 11, h: 3.2, e: 1.5 },
  "lumen-frog": { L: 7, H: 3, T: 0, h: 2.5, e: 0 },
  "reed-muskrat": { L: 30, H: 11, T: 25, h: 6, e: 2 },
  "elder-bear": { L: 190, H: 100, T: 10, h: 40, e: 12 },
  "rime-cat": { L: 110, H: 60, T: 95, h: 20, e: 5 },
  "candle-hedgehog": { L: 25, H: 10, T: 0.2, h: 6, e: 2 },
  "veil-marten": { L: 50, H: 16, T: 25, h: 9, e: 4 },
  "halo-loris": { L: 30, H: 11, T: 1, h: 7, e: 1.5 },
  "wisp-otter": { L: 80, H: 28, T: 40, h: 14, e: 2 },
  "saddle-tapir": { L: 200, H: 100, T: 7, h: 45, e: 12 },
  "aurora-yak": { L: 200, H: 130, T: 60, h: 50, e: 20 },
};

// len total length, span wingspan (flying birds), tail, bill.
const BIRD: Record<string, BirdRef> = {
  "amber-kestrel": { len: 34, span: 72, tail: 14, bill: 2 },
  "mist-swift": { len: 17, span: 42, tail: 7, bill: 0.8 },
  "hush-owl": { len: 19, span: 50, tail: 7, bill: 1.3 },
  "acorn-jay": { len: 34, span: 54, tail: 15, bill: 3 },
  "gale-chough": { len: 40, span: 80, tail: 15, bill: 4.5 },
  "field-nightjar": { len: 27, span: 57, tail: 12, bill: 1 },
  "crag-owl": { len: 65, span: 160, tail: 26, bill: 4 },
  "reed-heron": { len: 95, span: 185, tail: 15, bill: 12 },
  "tarn-eagle": { len: 85, span: 200, tail: 33, bill: 4.5 },
};

const within = (got: number, want: number, tol: number, abs: number) =>
  Math.abs(got - want) <= Math.max(abs, want * tol);

function quadMetrics(slug: string) {
  const shape = ANATOMY[slug as SpeciesSlug].shape;
  if (shape?.kind !== "quad") throw new Error(`${slug} is not a quadruped`);
  const s = shape.spec;
  const hr = s.head.r;
  const headPivotZ =
    s.bodyLen / 2 + s.chest[2] * 0.55 + Math.cos(s.neck.pitch) * s.neck.len;
  const L = headPivotZ + hr[2] + s.head.snoutLen + s.bodyLen / 2 + s.rump[2];
  const h = 1.55 * hr[2] + s.head.snoutLen;
  return { L, H: s.legH + 2 * s.chest[1], T: s.tail.len, h, e: s.ears.len };
}

function birdMetrics(slug: string) {
  const shape = ANATOMY[slug as SpeciesSlug].shape;
  if (shape?.kind !== "bird") throw new Error(`${slug} is not a bird`);
  const s = shape.spec;
  const total =
    2 * s.body[2] + s.neck.len + 2 * s.head.r[2] + s.head.bill.len + s.tail.len;
  return {
    total,
    span: 2 * (s.wings.span + s.body[0] * 0.7),
    tail: s.tail.len,
    bill: s.head.bill.len,
  };
}

test("every quadruped keeps believable proportions", () => {
  for (const [slug, ref] of Object.entries(QUAD)) {
    const m = quadMetrics(slug);
    const want = {
      H: ref.H / ref.L,
      T: ref.T / ref.L,
      h: ref.h / ref.L,
      e: ref.e / ref.h,
    };
    const got = {
      H: m.H / m.L,
      T: m.T / m.L,
      h: m.h / m.L,
      e: m.h > 0 ? m.e / m.h : 0,
    };
    const say = (what: string, k: keyof typeof got) =>
      `${slug} ${what} ${got[k].toFixed(2)} vs ${want[k].toFixed(2)}`;
    assert.ok(within(got.H, want.H, 0.3, 0.04), say("shoulder/length", "H"));
    assert.ok(within(got.T, want.T, 0.4, 0.06), say("tail/length", "T"));
    assert.ok(within(got.h, want.h, 0.45, 0.04), say("head/length", "h"));
    assert.ok(within(got.e, want.e, 0.5, 0.1), say("ear/head", "e"));
  }
});

test("every flying bird keeps believable wings, tail and bill", () => {
  for (const [slug, ref] of Object.entries(BIRD)) {
    const m = birdMetrics(slug);
    const span = m.span / m.total;
    const tail = m.tail / m.total;
    const bill = m.bill / m.total;
    // The heron is built with folded wings, so its span is not modelled.
    if (slug !== "reed-heron") {
      const want = ref.span / ref.len;
      assert.ok(within(span, want, 0.35, 0.3), `${slug} span/length ${span}`);
    }
    assert.ok(
      within(tail, ref.tail / ref.len, 0.4, 0.03),
      `${slug} tail/length ${tail.toFixed(2)}`,
    );
    assert.ok(
      within(bill, ref.bill / ref.len, 0.6, 0.03),
      `${slug} bill/length ${bill.toFixed(3)}`,
    );
  }
});

test("world sizes follow one compression curve of real sizes", () => {
  const pts: Array<{ slug: string; x: number; y: number }> = [];
  for (const [slug, ref] of Object.entries(QUAD)) {
    const scale = worldScaleForSkin(slug, false);
    pts.push({
      slug,
      x: Math.log(ref.L / 100),
      y: Math.log(quadMetrics(slug).L * scale),
    });
  }
  for (const [slug, ref] of Object.entries(BIRD)) {
    const scale = worldScaleForSkin(slug, false);
    pts.push({
      slug,
      x: Math.log(ref.len / 100),
      y: Math.log(birdMetrics(slug).total * scale),
    });
  }
  const n = pts.length;
  const mx = pts.reduce((a, p) => a + p.x, 0) / n;
  const my = pts.reduce((a, p) => a + p.y, 0) / n;
  const sxy = pts.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0);
  const sxx = pts.reduce((a, p) => a + (p.x - mx) ** 2, 0);
  const b = sxy / sxx;
  assert.ok(b > 0.35 && b < 0.9, `compression exponent ${b.toFixed(2)}`);
  for (const p of pts) {
    const resid = Math.exp(p.y - (my + b * (p.x - mx)));
    assert.ok(
      resid > 0.7 && resid < 1.4,
      `${p.slug} is ${resid.toFixed(2)}x the size trend`,
    );
  }
});
