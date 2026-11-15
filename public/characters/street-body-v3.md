# StreetBody v3

Same drop-in as v2, with the proportion, pose, ground, tank, and hinge fixes.

|           |                                                                                                                                                      |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| File      | `street-body-v3.glb`                                                                                                                                 |
| Triangles | 10,944                                                                                                                                               |
| Height    | 1.664 m                                                                                                                                              |
| Ground    | sole contact at y = 0. The sole mesh min Y is 0, and the composed world min is 0                                                                     |
| Head      | 0.39 m from the chin (y = 1.27) to the crown, about 4.2 heads, cranium about 0.37 m wide                                                             |
| A-pose    | 39.5° from the shoulder joint to the hand. Upper arm 50° below horizontal, forearm 56°. Hands sit beside the hips                                    |
| Skeleton  | one skin, the same 20 joints. At most 4 influences                                                                                                   |
| Textures  | none. Roughness 0.8, metalness 0                                                                                                                     |
| Renders   | `renders/street-body-v3-front.png`, `renders/street-body-v3-side.png`, `renders/street-body-v3-three-quarter.png`, `renders/street-body-v3-face.png` |

v2 is still in the repo. The Figure set in the viewer is v3. The T-pose wardrobe is unchanged.

## Rig

Local +Y points down the bone toward the child. Local +X is the bend and swing hinge. L is +X, R is −X. The spine, neck, and head stay identity, so the face is +Z.

- Arms: local +X is world +Z. A positive rotation about X raises the hand.
- Legs: local +X is world −X. A positive rotation about X swings the shin forward.
- `UpperLeg` rest euler is about (−3°, 0°, −177°). The large Z is the twist that points local +X at world −X while +Y points down the thigh. `LowerLeg` is only a few degrees off its parent. The foot is pitched about −86° on X so it points along the shoe.
- Soles and face parts are rigid children. Sole vertices stay in character space, and the sole node holds the inverse of the foot’s rest matrix. That is why the sole accessor no longer bottoms out at y = −0.096.

## What changed from v2

- Wider cranium, so the head reads oversized instead of near-realistic.
- Thicker upper arms, forearms, thighs, and calves. Shorter legs.
- Hands are a chunky mitt with a thumb, readable from the front.
- High-tops with a bulbous toe box and a 7.2 cm sole that shows under the upper from a slightly raised front camera.
- The tank has straps over the shoulders. `Tank` and `Shorts` stay off the tint.
- The A-pose is lower. v2’s shoulder-to-hand line was about 27.5°.

## Still off the letter of the brief

- The forearm is 56°, past the 45° top of the requested range, so the hand can sit near the hip. The shoulder-to-hand angle is inside 35–45°.
- A 4-head figure at 1.66 m has a head about 1.7× a 0.23 m realistic head, larger than the 1.4× line. The width is what makes it read oversized.
- The fingers are a mitt with a thumb. Three separate fingers fuse at this cell size.
