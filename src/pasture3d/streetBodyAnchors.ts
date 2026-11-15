/** Cosmetic attach slots on the StreetBody skeleton, for future wardrobe GLBs. */

export const STREET_BODY_URL = "/characters/street-body.glb";

/**
 * Runtime model is authored StreetBody v2:
 *   public/characters/street-body.glb (416 KB, uncompressed).
 * Meshopt + KHR_mesh_quantization shrank it to ~112 KB but stored
 * positions in a [-1,1] local range with per-mesh scales, which blew
 * up the inverted-hull outline, so the authored file is what ships.
 * Previous cartoon / scripted body: street-body.v1.glb
 * Input for scripts/stylize-street-body.mjs: street-body.source.glb
 * The stylize script is kept but writes street-body.v1.glb only; it is
 * not used in the build.
 *
 * v2 soles dip ~9.07 cm below y=0 in the authored file, so we lift the
 * instance this much to put the contact plane at y=0.
 */
export const STREET_BODY_GROUND_LIFT = 0.0907;

/** Nameplate / existing procedural cosmetic heights on the v2 body. */
export const STREET_BODY_HAT_Y = 1.81;
export const STREET_BODY_ACCESSORY_Y = 1.26;
export const STREET_BODY_ACCESSORY_RADIUS = 0.32;
export const STREET_BODY_LABEL_Y = 1.9;

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
 * authored for the v2 A-pose body facing +Z. Offsets are bone-local.
 * STREET_BODY_GROUND_LIFT is applied on the root instance, not these bones.
 */
export const STREET_BODY_ANCHORS: readonly StreetBodyAnchorDef[] = [
  { id: "head", bone: "Head", offset: [0, 0.266, 0.02] },
  { id: "hair", bone: "Head", offset: [0, 0.286, -0.03] },
  { id: "eyes", bone: "Head", offset: [0, 0.095, 0.14] },
  { id: "face", bone: "Head", offset: [0, 0, 0.149] },
  { id: "ears", bone: "Head", offset: [0, 0.095, 0], pair: ["Head", "Head"] },
  { id: "neck", bone: "Neck", offset: [0, 0, 0.03] },
  { id: "top", bone: "Chest", offset: [0, 0.02, 0.094] },
  { id: "outerwear", bone: "Chest", offset: [0, 0, 0.124] },
  { id: "bottoms", bone: "Hips", offset: [0, -0.12, 0.05] },
  { id: "waist", bone: "Hips", offset: [0, 0.04, 0.07] },
  {
    id: "feet",
    bone: "Root",
    offset: [0, 0, 0.05],
    pair: ["Foot_L", "Foot_R"],
  },
  {
    id: "wrists",
    bone: "LowerArm_R",
    offset: [0, 0, 0],
    pair: ["LowerArm_L", "LowerArm_R"],
  },
  {
    id: "hands",
    bone: "Hand_R",
    offset: [0, 0, 0.02],
    pair: ["Hand_L", "Hand_R"],
  },
  { id: "back", bone: "Chest", offset: [0, 0.02, -0.146] },
  { id: "held", bone: "Hand_R", offset: [-0.013, 0.023, 0.081] },
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
