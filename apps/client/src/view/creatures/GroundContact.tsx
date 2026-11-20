/**
 * Soft contact shadow under a creature: a radial falloff, not a hard disc,
 * so the body settles into the night ground. One geometry, one texture and
 * one material shared by every creature.
 */
import {
  CanvasTexture,
  MeshBasicMaterial,
  PlaneGeometry,
  type Texture,
} from "three";

let shared: { geometry: PlaneGeometry; material: MeshBasicMaterial } | null =
  null;

function softTexture(): Texture | null {
  if (typeof document === "undefined") return null;
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const g = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.45, "rgba(255,255,255,0.7)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new CanvasTexture(canvas);
}

function contactShared() {
  if (shared == null) {
    const geometry = new PlaneGeometry(1, 1);
    geometry.rotateX(-Math.PI / 2);
    shared = {
      geometry,
      material: new MeshBasicMaterial({
        color: "#03060a",
        alphaMap: softTexture(),
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      }),
    };
  }
  return shared;
}

type Props = {
  /** Local-space radius of the soft pad. */
  radius?: number;
  /** Lift slightly to avoid z-fighting with terrain. */
  y?: number;
  ref?: React.Ref<import("three").Mesh>;
};

export function GroundContact({ radius = 0.28, y = 0.012, ref }: Props) {
  const { geometry, material } = contactShared();
  return (
    <mesh
      ref={ref}
      geometry={geometry}
      material={material}
      position={[0, y, 0]}
      scale={[radius * 1.7, 1, radius * 2.3]}
      renderOrder={-1}
    />
  );
}
