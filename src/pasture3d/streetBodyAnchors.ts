/** Cosmetic attach slots on the StreetBody skeleton, for future wardrobe GLBs. */

export const STREET_BODY_URL = "/characters/street-body.glb";

/**
 * Runtime model is authored StreetBody v3:
 *   public/characters/street-body.glb (447 KB, uncompressed).
 * Meshopt + KHR_mesh_quantization is not applied: on v2 it stored
 * positions in a [-1,1] local range with per-mesh scales, which blew
 * up the inverted-hull outline.
 * Previous authored body: street-body.v2.glb
 * Previous cartoon / scripted body: street-body.v1.glb
 * Input for scripts/stylize-street-body.mjs: street-body.source.glb
 * The stylize script is kept but writes street-body.v1.glb only; it is
 * not used in the build.
 *
 * v3 soles sit at y=0 in the authored file, so no instance lift is
 * required. Notes: public/characters/street-body-v3.md
 */
export const STREET_BODY_GROUND_LIFT = 0;

/** Nameplate / existing procedural cosmetic heights on the v3 body. */
export const STREET_BODY_HAT_Y = 1.71;
export const STREET_BODY_ACCESSORY_Y = 1.1;
export const STREET_BODY_ACCESSORY_RADIUS = 0.3;
export const STREET_BODY_LABEL_Y = 1.8;

export const STREET_BODY_ANCHOR_SLOTS = [
  "head",
  "hair",
  "eyes",
  "face",
  "ears",
  "neck",
  "top",
  "outerwear",
  "bottoms",
  "waist",
  "feet",
  "wrists",
  "hands",
  "back",
  "held",
  "aura",
] as const;

export type StreetBodyAnchorSlot = (typeof STREET_BODY_ANCHOR_SLOTS)[number];

export type StreetBodyAnchorDef = {
  id: StreetBodyAnchorSlot;
  bone: string;
  offset: readonly [number, number, number];
  /** Extra L/R markers parented to these bones when the slot is bilateral. */
  pair?: readonly [string, string];
};

/**
 * Empty-group attachments. Offsets are in the parent bone's local space,
 * authored for the v3 A-pose body facing +Z. Offsets are bone-local.
 * STREET_BODY_GROUND_LIFT is applied on the root instance, not these bones.
 */
export const STREET_BODY_ANCHORS: readonly StreetBodyAnchorDef[] = [
  { id: "head", bone: "Head", offset: [0, 0.344, 0.008] },
  { id: "hair", bone: "Head", offset: [0, 0.364, -0.042] },
  { id: "eyes", bone: "Head", offset: [0, 0.18, 0.176] },
  { id: "face", bone: "Head", offset: [0, 0.08, 0.222] },
  { id: "ears", bone: "Head", offset: [0, 0.18, 0], pair: ["Head", "Head"] },
  { id: "neck", bone: "Neck", offset: [0, 0, 0.03] },
  { id: "top", bone: "Chest", offset: [0, 0.02, 0.178] },
  { id: "outerwear", bone: "Chest", offset: [0, 0, 0.208] },
  { id: "bottoms", bone: "Hips", offset: [0, -0.16, 0.178] },
  { id: "waist", bone: "Hips", offset: [0, 0.1, 0.1] },
  {
    id: "feet",
    bone: "Root",
    offset: [0, 0, 0.05],
    pair: ["Foot_L", "Foot_R"],
  },
  {
    id: "wrists",
    bone: "LowerArm_R",
    offset: [0, 0.2, 0],
    pair: ["LowerArm_L", "LowerArm_R"],
  },
  {
    id: "hands",
    bone: "Hand_R",
    offset: [0, 0.02, 0],
    pair: ["Hand_L", "Hand_R"],
  },
  { id: "back", bone: "Chest", offset: [0, 0.02, -0.174] },
  { id: "held", bone: "Hand_R", offset: [0.07, 0.047, 0.013] },
  { id: "aura", bone: "Root", offset: [0, 0.86, 0] },
];

export const STREET_BODY_JOINTS = [
  "Root",
  "Hips",
  "Spine",
  "Chest",
  "Neck",
  "Head",
  "Shoulder_L",
  "UpperArm_L",
  "LowerArm_L",
  "Hand_L",
  "Shoulder_R",
  "UpperArm_R",
  "LowerArm_R",
  "Hand_R",
  "UpperLeg_L",
  "LowerLeg_L",
  "Foot_L",
  "UpperLeg_R",
  "LowerLeg_R",
  "Foot_R",
] as const;
