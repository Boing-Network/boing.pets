/** Cosmetic attach slots on the StreetBody skeleton, for future wardrobe GLBs. */

export const STREET_BODY_URL = "/characters/street-body.glb";

/** Feet sit at y=0 after the stylize pass lifts any leftover sole dip. */
export const STREET_BODY_GROUND_LIFT = 0;

/** Nameplate / existing procedural cosmetic heights on the stylized body. */
export const STREET_BODY_HAT_Y = 1.72;
export const STREET_BODY_ACCESSORY_Y = 1.14;
export const STREET_BODY_ACCESSORY_RADIUS = 0.3;
export const STREET_BODY_LABEL_Y = 1.7;

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
 * authored for a T-pose body facing +Z with feet at y=0.
 */
export const STREET_BODY_ANCHORS: readonly StreetBodyAnchorDef[] = [
  { id: "head", bone: "Head", offset: [0, 0.17, 0.02] },
  { id: "hair", bone: "Head", offset: [0, 0.24, -0.02] },
  { id: "eyes", bone: "Head", offset: [0, 0.09, 0.11] },
  { id: "face", bone: "Head", offset: [0, 0.05, 0.11] },
  { id: "ears", bone: "Head", offset: [0, 0.09, 0], pair: ["Head", "Head"] },
  { id: "neck", bone: "Neck", offset: [0, 0.03, 0.02] },
  { id: "top", bone: "Chest", offset: [0, 0.04, 0.08] },
  { id: "outerwear", bone: "Chest", offset: [0, 0.02, 0.1] },
  { id: "bottoms", bone: "Hips", offset: [0, -0.1, 0.04] },
  { id: "waist", bone: "Hips", offset: [0, 0.05, 0.06] },
  {
    id: "feet",
    bone: "Root",
    offset: [0, 0.05, 0.06],
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
  { id: "back", bone: "Chest", offset: [0, 0.04, -0.12] },
  { id: "held", bone: "Hand_R", offset: [0, -0.03, 0.08] },
  { id: "aura", bone: "Root", offset: [0, 0.85, 0] },
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
