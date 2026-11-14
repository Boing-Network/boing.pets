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
import { pastureHopOffset } from "../../pasture3d/pastureGround";
import { worldSafeText } from "../lib/worldFont";
import {
  UNIT_SPHERE,
  UNIT_SPHERE_LO,
  petModelParams,
  smileTubeGeometry,
  type PetModelLook,
} from "../lib/petModel";
import { CosmeticAttachments } from "./CosmeticAttachments";
import { EMOTE_DURATION_MS, emoteActive, type EmoteId } from "../lib/emotes";
import { PetFeatureMesh } from "./PetFeatureMesh";
import { playMoodSfx } from "../../audio";
import {
  moodMotion,
  petMoodKind,
  type CareVitals,
} from "../../pasture3d/petMood";

const _worldPos = new Vector3();

export type PetMeshLook = PetModelLook;

export function PetMesh({
  look,
  name,
  cosmetics,
  moving = false,
  movingRef,
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
  const model = useMemo(() => petModelParams(look), [look]);
  const moodKind = petMoodKind(care);
  const motion = moodMotion(moodKind, reducedMotion);

  useFrame(({ camera, clock }) => {
    if (root.current && (nameRef.current || bubbleRef.current)) {
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
    }
    if (!hop.current) return;
    if (reducedMotion) {
      hop.current.position.y = 0;
      hop.current.rotation.y = 0;
      hop.current.rotation.z = 0;
      hop.current.scale.set(1, 1, 1);
      return;
    }
    const isMoving = movingRef?.current ?? moving;
    const baseY = pastureHopOffset(clock.elapsedTime, isMoving, reducedMotion);
    const now = Date.now();
    const playing = emote && emoteActive(emote.at, now);
    if (playing) {
      const u = Math.min(1, Math.max(0, (now - emote.at) / EMOTE_DURATION_MS));
      const pulse = Math.sin(u * Math.PI);
      if (emote.id === "wave") {
        hop.current.position.y = baseY + pulse * 0.12;
        hop.current.rotation.z = Math.sin(u * Math.PI * 4) * 0.35;
        hop.current.rotation.y = 0;
        hop.current.scale.set(1, 1, 1);
      } else if (emote.id === "hop" || emote.id === "play") {
        hop.current.position.y =
          baseY + Math.abs(Math.sin(u * Math.PI * 2)) * 0.42;
        hop.current.rotation.z = Math.sin(u * Math.PI * 2) * 0.12;
        hop.current.rotation.y = emote.id === "play" ? pulse * 0.4 : 0;
        hop.current.scale.setScalar(1 + pulse * 0.08);
      } else if (emote.id === "spin") {
        hop.current.position.y = baseY + pulse * 0.18;
        hop.current.rotation.z = 0;
        hop.current.rotation.y = u * Math.PI * 2;
        hop.current.scale.set(1, 1, 1);
      } else {
        hop.current.position.y = baseY + pulse * 0.16;
        hop.current.rotation.z = 0;
        hop.current.rotation.y = 0;
        hop.current.scale.setScalar(1 + pulse * 0.18);
      }
      return;
    }
    const extra = motion.bounceAmp
      ? (Math.sin(clock.elapsedTime * motion.bounceSpeed) * 0.5 + 0.5) *
        motion.bounceAmp
      : 0;
    hop.current.position.y = baseY + extra;
    hop.current.rotation.y = 0;
    hop.current.scale.set(
      1 + motion.droop * 0.05,
      1 - motion.droop * 0.18,
      1 + motion.droop * 0.05,
    );
    hop.current.rotation.z = isMoving
      ? Math.sin(clock.elapsedTime * 11) * 0.06
      : Math.sin(clock.elapsedTime * 2.4) * 0.02 - motion.droop * 0.25;
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
        <mesh
          geometry={UNIT_SPHERE}
          position={[model.body.cx, model.body.cy, model.body.cz]}
          scale={[model.body.x, model.body.y, model.body.z]}
          castShadow={false}
        >
          <meshStandardMaterial
            color={model.bodyColor}
            roughness={0.5}
            metalness={0}
          />
        </mesh>
        {model.feet.map((foot, i) => (
          <mesh
            key={"foot-" + i}
            geometry={UNIT_SPHERE_LO}
            position={[foot.x, foot.y, foot.z]}
            scale={[foot.cx, foot.cy, foot.cz]}
          >
            <meshStandardMaterial
              color={model.accentColor}
              roughness={0.52}
              metalness={0}
            />
          </mesh>
        ))}
        <PetFeatureMesh model={model} accent={model.accentColor} />
        {model.spots.map((spot, i) => (
          <mesh
            key={"spot-" + i}
            geometry={UNIT_SPHERE_LO}
            position={[spot.x, spot.y, spot.z]}
            scale={spot.r}
          >
            <meshStandardMaterial
              color={model.accentColor}
              transparent
              opacity={0.6}
              roughness={0.55}
              metalness={0}
            />
          </mesh>
        ))}
        {model.eyes.map((eye, i) => (
          <mesh
            key={"eye-" + i}
            geometry={UNIT_SPHERE_LO}
            position={[eye.x, eye.y, eye.z]}
            scale={eye.r}
          >
            <meshStandardMaterial
              color={model.faceColor}
              roughness={0.4}
              metalness={0}
            />
          </mesh>
        ))}
        <mesh geometry={smileTubeGeometry()} position={[0, model.body.cy, 0]}>
          <meshStandardMaterial
            color={model.faceColor}
            roughness={0.4}
            metalness={0}
          />
        </mesh>
        {model.showAntenna && !cosmetics?.hat ? (
          <mesh
            geometry={UNIT_SPHERE_LO}
            position={[model.antenna.x, model.antenna.y, model.antenna.z]}
            scale={model.antenna.r}
          >
            <meshStandardMaterial
              color={model.accentColor}
              emissive={model.accentColor}
              emissiveIntensity={0.2}
              roughness={0.45}
            />
          </mesh>
        ) : null}
        <CosmeticAttachments
          cosmetics={cosmetics}
          moving={moving}
          movingRef={movingRef}
          hatY={model.hatAnchorY}
          accessoryY={model.accessoryY}
          accessoryRadius={model.accessoryRadius}
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
          position={[0, model.labelY, 0]}
          center
          sprite
          style={{ pointerEvents: "none" }}
          zIndexRange={[5, 0]}
        >
          <div className="pasture-label-stack">
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
        </Html>
      ) : null}
    </group>
  );
}
