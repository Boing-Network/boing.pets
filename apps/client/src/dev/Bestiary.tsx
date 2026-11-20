/**
 * Bestiary: every species on one moonlit stage, for art review and
 * screenshots. Dev-only (`?bestiary`, or `?bestiary=<slug>` for one close-up);
 * lazy-loaded, so the game bundle does not carry it.
 *
 * Same sky, fog and moonlight as the world, a patch of ground, and each
 * species walking in place on a slow loop (`?pose=idle|walk|graze|rest`).
 */
import { Text } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { BufferAttribute, Color, PlaneGeometry } from "three";
import { SPECIES_CATALOG } from "@boing-pets/contract";
import { CreaturePresentation } from "../view/creatures/CreaturePresentation";
import { worldScaleForSkin } from "../view/creatures/materials";
import { NEUTRAL_POSE, type CreaturePose } from "../view/motion/pose";
import { skinForSpecies } from "../view/species-skins";
import { Sky } from "../view/world/Sky";
import { worldTime } from "../view/world/gfx";

type PoseMode = "idle" | "walk" | "graze" | "rest";

function poseAt(mode: PoseMode, t: number, flier: boolean): CreaturePose {
  switch (mode) {
    case "walk":
      return {
        ...NEUTRAL_POSE,
        gait: (t * 0.9) % 1,
        gaitWeight: flier ? 0.9 : 0.85,
        bob: flier ? 0.35 + Math.sin(t * 2.4) * 0.06 : 0,
        headPitch: -0.04,
      };
    case "graze":
      return {
        ...NEUTRAL_POSE,
        headPitch: -0.7,
        bodyPitch: 0.18,
        crouch: 0.2,
        bob: flier ? 0.15 : 0,
      };
    case "rest":
      return {
        ...NEUTRAL_POSE,
        headPitch: -0.15,
        bodyPitch: 0.15,
        crouch: 0.3,
      };
    case "idle":
    default:
      return {
        ...NEUTRAL_POSE,
        headPitch: Math.sin(t * 0.7) * 0.08,
        bob: flier ? 0.28 + Math.sin(t * 1.6) * 0.04 : 0,
        gaitWeight: flier ? 0.35 : 0,
        gait: (t * 1.2) % 1,
      };
  }
}

function Specimen({
  speciesId,
  position,
  yaw,
  mode,
  phase,
  label,
}: {
  speciesId: number;
  position: [number, number, number];
  yaw: number;
  mode: PoseMode;
  phase: number;
  label: boolean;
}) {
  const pose = useRef<CreaturePose>(NEUTRAL_POSE);
  const group = useRef<import("three").Group>(null);
  const skin = skinForSpecies(speciesId);
  const flier = skin.locomotion === "fly" || skin.locomotion === "hover";
  useFrame(() => {
    const t = worldTime.value + phase;
    pose.current = poseAt(mode, t, flier);
    if (group.current) {
      const hover = flier
        ? 0.9 + pose.current.bob
        : 0.02 - pose.current.crouch * 0.12;
      group.current.position.set(position[0], position[1] + hover, position[2]);
      group.current.rotation.set(pose.current.bodyPitch, yaw, 0);
    }
  });
  return (
    <>
      <group ref={group} scale={worldScaleForSkin(skin.id, false)}>
        <CreaturePresentation
          speciesId={speciesId}
          selected={false}
          pose={pose}
        />
      </group>
      {label ? (
        <Text
          position={[position[0], 0.05, position[2] + 1.25]}
          rotation={[-Math.PI / 2.6, 0, 0]}
          fontSize={0.26}
          color="#d9e4ef"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.02}
          outlineColor="#050b12"
        >
          {skin.label}
        </Text>
      ) : null}
    </>
  );
}

function Ground({ size }: { size: number }) {
  const geometry = useMemo(() => {
    const g = new PlaneGeometry(size, size, 96, 96);
    g.rotateX(-Math.PI / 2);
    const pos = g.getAttribute("position");
    const colors = new Float32Array(pos.count * 3);
    const a = new Color("#1d3a2c");
    const b = new Color("#2c4a33");
    const c = new Color("#3a3a30");
    const tmp = new Color();
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const n =
        Math.sin(x * 0.9) * Math.cos(z * 1.1) * 0.5 +
        Math.sin(x * 2.7 + z * 1.9) * 0.25 +
        0.5;
      tmp.copy(a).lerp(b, Math.min(1, Math.max(0, n)));
      if (Math.sin(x * 0.37 + z * 0.23) > 0.75) tmp.lerp(c, 0.5);
      colors[i * 3] = tmp.r;
      colors[i * 3 + 1] = tmp.g;
      colors[i * 3 + 2] = tmp.b;
      pos.setY(i, Math.sin(x * 0.21) * Math.cos(z * 0.17) * 0.12);
    }
    g.setAttribute("color", new BufferAttribute(colors, 3));
    g.computeVertexNormals();
    return g;
  }, [size]);
  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial vertexColors roughness={0.95} metalness={0} />
    </mesh>
  );
}

function Clock() {
  useFrame((_, delta) => {
    worldTime.value += Math.min(delta, 0.05);
  });
  return null;
}

/** Species whose heads (or antlers) stand well above their backs. */
const TALL = new Set(["moss-stag", "silver-deer", "reed-heron"]);
/** Fliers hover about 0.9 world units up; frame them in the air. */
const FLIERS = new Set([
  "lantern-moth",
  "field-nightjar",
  "gloam-bat",
  "crag-owl",
]);

export function Bestiary() {
  const params = new URLSearchParams(window.location.search);
  const only = params.get("bestiary") ?? "";
  const mode = (params.get("pose") ?? "walk") as PoseMode;
  const focus = useRef({ x: 0, y: 0, z: 0 });
  const single = SPECIES_CATALOG.find((row) => row.slug === only);
  const rows = single ? [single] : [...SPECIES_CATALOG];
  const cols = 7;
  const spacing = 3.2;
  const placed = rows.map((row, index) => {
    const col = index % cols;
    const line = Math.floor(index / cols);
    const x = single ? 0 : (col - (cols - 1) / 2) * spacing;
    const lines = Math.ceil(rows.length / cols);
    const z = single ? 0 : (line - (lines - 1) / 2) * spacing * 1.05;
    return { row, x, z };
  });
  // Close-up framing scales with the species' world size (works for the
  // old and new renderers alike, so before/after shots line up).
  const size = single
    ? worldScaleForSkin(single.slug, false) *
      (TALL.has(single.slug) ? 0.62 : 0.4)
    : 1;
  const camera = single
    ? {
        position: [size * 0.75, size * 0.9, size * 2.9] as [
          number,
          number,
          number,
        ],
        fov: 34,
      }
    : {
        position: [0, 10.5, 15 + (rows.length > 7 ? 2 : 0)] as [
          number,
          number,
          number,
        ],
        fov: 42,
      };
  return (
    <div style={{ position: "fixed", inset: 0, background: "#0d2638" }}>
      <Canvas
        shadows
        dpr={[1, 1.75]}
        camera={{ ...camera, near: 0.1, far: 2000 }}
        onCreated={({ camera: cam, gl }) => {
          gl.setClearColor("#0d2638");
          cam.lookAt(
            0,
            single ? size * 0.42 + (FLIERS.has(single.slug) ? 1.1 : 0) : 0,
            single ? 0 : 0.6,
          );
        }}
      >
        <Clock />
        <Sky focusRef={focus} shadowReach={single ? 8 : 24} />
        <Ground size={single ? 30 : 60} />
        {placed.map(({ row, x, z }, index) => (
          <Specimen
            key={row.id}
            speciesId={row.id}
            position={[x, 0, z]}
            yaw={single ? 1.15 : 0.85}
            mode={mode}
            phase={index * 0.37}
            label={!single}
          />
        ))}
      </Canvas>
      <div
        style={{
          position: "fixed",
          left: 16,
          top: 12,
          color: "#d9e4ef",
          font: "600 18px Georgia, serif",
          textShadow: "0 1px 3px #000",
        }}
      >
        {single ? single.displayName : `Bestiary · ${rows.length} species`}
      </div>
    </div>
  );
}
