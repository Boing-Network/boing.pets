/** Nico-provided streetwear city props placed around The Yard. */

export const STREET_PROP_BASE = "/street-props/";

export type StreetPropKind = "building" | "clutter";

export type StreetPropSpec = {
  name: string;
  kind: StreetPropKind;
  position: readonly [number, number, number];
  rotationY: number;
  scale: number;
  halfW: number;
  halfD: number;
  height: number;
};

/**
 * Authored meter-scale props, already pivoted to a y=0 base.
 * Walk-Up and Corner Store front the central avenue inside the district,
 * where the default and follow cameras actually see them. The Night Cart
 * stands just outside The Drop; the rest is mid-block street clutter.
 * halfW / halfD are world-axis AABB halves at the chosen rotation.
 */
export const STREETWEAR_PROPS: readonly StreetPropSpec[] = [
  {
    name: "walk-up",
    kind: "building",
    position: [-5.2, 0, -10.4],
    rotationY: Math.PI / 2,
    scale: 0.9,
    halfW: 0.558,
    halfD: 3.51,
    height: 6.66,
  },
  {
    name: "corner-store",
    kind: "building",
    position: [4.55, 0, -11.5],
    rotationY: -Math.PI / 2,
    scale: 1,
    halfW: 0.66,
    halfD: 2.16,
    height: 3.2,
  },
  {
    name: "night-cart",
    kind: "clutter",
    position: [4.8, 0, -4.6],
    rotationY: Math.PI / 2,
    scale: 1,
    halfW: 0.6,
    halfD: 1.0,
    height: 1.95,
  },
  {
    name: "wheatpaste",
    kind: "clutter",
    position: [-8.0, 0, -14.35],
    rotationY: 0,
    scale: 1,
    halfW: 0.62,
    halfD: 0.12,
    height: 1.74,
  },
  {
    name: "site-fence",
    kind: "clutter",
    position: [3.2, 0, 14.6],
    rotationY: 0,
    scale: 1,
    halfW: 1.12,
    halfD: 0.22,
    height: 1.18,
  },
  {
    name: "fat-caps",
    kind: "clutter",
    position: [-14.6, 0, 2.8],
    rotationY: 0.4,
    scale: 1,
    halfW: 0.56,
    halfD: 0.42,
    height: 0.72,
  },
  {
    name: "tagged-hydrant",
    kind: "clutter",
    position: [15.4, 0, 3.2],
    rotationY: 0.2,
    scale: 1,
    halfW: 0.33,
    halfD: 0.28,
    height: 1.12,
  },
  {
    name: "sticker-box",
    kind: "clutter",
    position: [-5.4, 0, -14.8],
    rotationY: -0.3,
    scale: 1,
    halfW: 0.48,
    halfD: 0.32,
    height: 1.54,
  },
  {
    name: "pigeon-drum",
    kind: "clutter",
    position: [-14.8, 0, -15.0],
    rotationY: 0.5,
    scale: 1,
    halfW: 0.4,
    halfD: 0.4,
    height: 0.93,
  },
  {
    name: "wood-crate",
    kind: "clutter",
    position: [15.0, 0, 15.2],
    rotationY: 0.15,
    scale: 1,
    halfW: 0.3,
    halfD: 0.3,
    height: 0.55,
  },
  {
    name: "tagged-cone",
    kind: "clutter",
    position: [3.8, 0, -8.0],
    rotationY: 0,
    scale: 1,
    halfW: 0.18,
    halfD: 0.18,
    height: 0.72,
  },
];

export function overlapsStreetwearProp(
  x: number,
  z: number,
  clearance = 6.6,
): boolean {
  return STREETWEAR_PROPS.some((item) => {
    const pad = item.kind === "building" ? clearance : Math.min(clearance, 3.4);
    const dx = Math.abs(x - item.position[0]);
    const dz = Math.abs(z - item.position[2]);
    return (
      (dx < item.halfW + pad * 0.45 && dz < item.halfD + pad * 0.45) ||
      Math.hypot(x - item.position[0], z - item.position[2]) < pad
    );
  });
}
