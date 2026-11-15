import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, type MutableRefObject, type ReactNode } from "react";
import { Vector3, type Group } from "three";
import type { EquippedCosmetics } from "../../content/cosmetics";
import {
  pastureBubbleVisible,
  pastureHudOverlaysVisible,
  pastureNameplateVisible,
  pasturePetLabel,
} from "../../pasture3d/labels";
import { worldSafeText } from "../lib/worldFont";
import { petModelParams, type PetModelLook } from "../lib/petModel";
import { CosmeticAttachments } from "./CosmeticAttachments";
import { StreetBodyModel } from "./StreetBodyModel";
import {
  STREET_BODY_ACCESSORY_RADIUS,
  STREET_BODY_ACCESSORY_Y,
  STREET_BODY_HAT_Y,
  STREET_BODY_LABEL_Y,
} from "../../pasture3d/streetBodyAnchors";
import { EMOTE_DURATION_MS, emoteActive, type EmoteId } from "../lib/emotes";
import { playMoodSfx } from "../../audio";
import {
  moodMotion,
  petMoodKind,
  type CareVitals,
} from "../../pasture3d/petMood";
import {
  nudgeRectOutOfHud,
  pastureHudCollisionRects,
} from "../../pasture3d/hudSafeLabel";
import { readPastureTouchPrefs } from "../../pasture3d/mobileControls";

const _worldPos = new Vector3();

export type PetMeshLook = PetModelLook;

export function PetMesh({
  look,
  name,
  cosmetics,
  moving = false,
  movingRef,
  speedRef,
  reducedMotion = false,
  selected = false,
  yours = false,
  bubble,
  onClick,
  scale = 1,
  hideHudOverlays = false,
  emote = null,
  care,
  moodId,
  children,
}: {
  look: PetMeshLook;
  name?: string;
  cosmetics?: EquippedCosmetics;
  moving?: boolean;
  movingRef?: MutableRefObject<boolean>;
  speedRef?: MutableRefObject<number>;
  reducedMotion?: boolean;
  selected?: boolean;
  yours?: boolean;
  bubble?: string;
  onClick?: () => void;
  scale?: number;
  hideHudOverlays?: boolean;
  emote?: { id: EmoteId; at: number } | null;
  care?: CareVitals;
  moodId?: string;
  children?: ReactNode;
}) {
  const hop = useRef<Group>(null);
  const root = useRef<Group>(null);
  const nameRef = useRef<HTMLButtonElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const stackRef = useRef<HTMLDivElement>(null);
  const model = useMemo(() => petModelParams(look), [look]);
  const moodKind = petMoodKind(care);
  const motion = moodMotion(moodKind, reducedMotion);

  useFrame(({ camera, size, gl }) => {
    if (
      root.current &&
      (nameRef.current || bubbleRef.current || stackRef.current)
    ) {
      root.current.getWorldPosition(_worldPos);
      const dist = camera.position.distanceTo(_worldPos);
      if (nameRef.current) {
        nameRef.current.style.visibility = pastureNameplateVisible(dist)
          ? "visible"
          : "hidden";
      }
      if (bubbleRef.current) {
        bubbleRef.current.style.visibility = pastureBubbleVisible(dist)
          ? "visible"
          : "hidden";
      }
      const stack = stackRef.current;
      if (stack) {
        stack.style.transform = "translate(0px, 0px)";
        const box = stack.getBoundingClientRect();
        const canvas = gl.domElement.getBoundingClientRect();
        const rect = {
          left: box.left - canvas.left,
          top: box.top - canvas.top,
          right: box.right - canvas.left,
          bottom: box.bottom - canvas.top,
        };
        const { dx, dy } = nudgeRectOutOfHud(
          rect,
          pastureHudCollisionRects(
            size.width,
            size.height,
            readPastureTouchPrefs().touchControls,
          ),
          size,
        );
        stack.style.transform = `translate(${dx}px, ${dy}px)`;
      }
    }
    if (!hop.current) return;
    hop.current.scale.set(1, 1, 1);
    if (reducedMotion) {
      hop.current.position.y = 0;
      hop.current.rotation.y = 0;
      hop.current.rotation.z = 0;
      return;
    }
    const now = Date.now();
    const playing = emote && emoteActive(emote.at, now);
    if (playing) {
      const u = Math.min(1, Math.max(0, (now - emote.at) / EMOTE_DURATION_MS));
      const pulse = Math.sin(u * Math.PI);
      if (emote.id === "wave") {
        hop.current.position.y = pulse * 0.06;
        hop.current.rotation.z = Math.sin(u * Math.PI * 4) * 0.18;
        hop.current.rotation.y = 0;
      } else if (emote.id === "hop" || emote.id === "play") {
        hop.current.position.y = Math.abs(Math.sin(u * Math.PI * 2)) * 0.22;
        hop.current.rotation.z = Math.sin(u * Math.PI * 2) * 0.06;
        hop.current.rotation.y = emote.id === "play" ? pulse * 0.25 : 0;
      } else if (emote.id === "spin") {
        hop.current.position.y = pulse * 0.08;
        hop.current.rotation.z = 0;
        hop.current.rotation.y = u * Math.PI * 2;
      } else {
        hop.current.position.y = pulse * 0.08;
        hop.current.rotation.z = 0;
        hop.current.rotation.y = 0;
      }
      return;
    }
    hop.current.position.y = 0;
    hop.current.rotation.y = 0;
    hop.current.rotation.z = 0;
    if (moodId) playMoodSfx(moodKind, moodId, reducedMotion);
  });

  const label = pasturePetLabel({ species: look.species, fallback: name });

  return (
    <group
      ref={root}
      scale={scale}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.();
      }}
    >
      <group ref={hop}>
        <StreetBodyModel
          look={look}
          moving={moving}
          movingRef={movingRef}
          speedRef={speedRef}
          reducedMotion={reducedMotion}
          heldTool={cosmetics?.trail ?? null}
        />
        <CosmeticAttachments
          cosmetics={cosmetics}
          moving={moving}
          movingRef={movingRef}
          hatY={STREET_BODY_HAT_Y}
          accessoryY={STREET_BODY_ACCESSORY_Y}
          accessoryRadius={STREET_BODY_ACCESSORY_RADIUS}
        />
        {children}
      </group>
      <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.55, 16]} />
        <meshBasicMaterial
          color={selected || yours ? "#fff4b8" : "#142044"}
          transparent
          opacity={selected || yours ? 0.45 : 0.22}
        />
      </mesh>
      {pastureHudOverlaysVisible(hideHudOverlays) ? (
        <Html
          position={[0, STREET_BODY_LABEL_Y, 0]}
          sprite
          style={{ pointerEvents: "none" }}
          zIndexRange={[5, 0]}
        >
          <div className="pasture-label-anchor">
            <div ref={stackRef} className="pasture-label-stack">
              {bubble ? (
                <div ref={bubbleRef} className="pasture-bubble">
                  {worldSafeText(bubble)}
                </div>
              ) : null}
              <div
                className={
                  "pasture-mood-bubble" + (motion.sparkle ? " is-sparkle" : "")
                }
                data-mood={motion.kind}
                title={motion.label}
                aria-label={`Mood: ${motion.label}`}
              >
                <span className="pasture-mood-icon" aria-hidden="true">
                  {motion.icon}
                </span>
                {motion.sparkle ? (
                  <span className="pasture-mood-sparkle" aria-hidden="true">
                    *
                  </span>
                ) : null}
              </div>
              {emote && emote.id === "heart" ? (
                <div className="pasture-emote-heart" aria-hidden="true">
                  ♥
                </div>
              ) : null}
              <button
                ref={nameRef}
                type="button"
                className={
                  "pasture-pet-hit" +
                  (yours ? " yours" : "") +
                  (selected ? " is-selected" : "")
                }
                data-owner-label={label}
                data-species={model.species}
                data-feature={model.featureKind}
                style={{ pointerEvents: "auto" }}
                onClick={(event) => {
                  event.stopPropagation();
                  onClick?.();
                }}
              >
                {label}
              </button>
            </div>
          </div>
        </Html>
      ) : null}
    </group>
  );
}
