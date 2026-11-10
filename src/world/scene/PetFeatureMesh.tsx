import type { Color } from "three";
import {
  PET_BODY_CENTER_Y,
  UNIT_SPHERE_MED,
  featureBounds,
  featureDepth,
  featureExtrudeGeometry,
  svgScale,
  svgToWorld,
  type PetModelParams,
} from "../lib/petModel";

export function PetFeatureMesh({
  model,
  accent,
}: {
  model: PetModelParams;
  accent: Color;
}) {
  const { feature, featureKind, shape } = model;

  if (feature.kind === "ellipses" || feature.kind === "circles") {
    const parts =
      feature.kind === "ellipses"
        ? feature.parts.map((part) => {
            const p = svgToWorld(part.cx, part.cy);
            return {
              x: p.x,
              y: PET_BODY_CENTER_Y + p.y,
              z: 0,
              sx: svgScale(part.rx),
              sy: svgScale(part.ry),
              sz: Math.min(svgScale(part.rx), featureDepth(featureKind) * 0.7),
            };
          })
        : feature.parts.map((part) => {
            const p = svgToWorld(part.cx, part.cy);
            const r = svgScale(part.r);
            return {
              x: p.x,
              y: PET_BODY_CENTER_Y + p.y,
              z: 0,
              sx: r,
              sy: r,
              sz: r * 0.85,
            };
          });
    return (
      <group>
        {parts.map((part, i) => (
          <mesh
            key={i}
            geometry={UNIT_SPHERE_MED}
            position={[part.x, part.y, part.z]}
            scale={[part.sx, part.sy, part.sz]}
            castShadow={false}
          >
            <meshStandardMaterial
              color={accent}
              roughness={0.5}
              metalness={0}
            />
          </mesh>
        ))}
      </group>
    );
  }

  if (featureKind === "mushroom-cap") {
    const box = featureBounds(feature);
    const p = svgToWorld((box.minX + box.maxX) / 2, (box.minY + box.maxY) / 2);
    const rx = svgScale((box.maxX - box.minX) / 2);
    const ry = svgScale((box.maxY - box.minY) / 2);
    return (
      <mesh
        geometry={UNIT_SPHERE_MED}
        position={[p.x, PET_BODY_CENTER_Y + p.y, 0]}
        scale={[rx, ry, rx * 0.85]}
        castShadow={false}
      >
        <meshStandardMaterial color={accent} roughness={0.5} metalness={0} />
      </mesh>
    );
  }

  const geo = featureExtrudeGeometry(shape, featureKind, feature.d);
  return (
    <mesh
      geometry={geo}
      position={[0, PET_BODY_CENTER_Y, 0]}
      castShadow={false}
    >
      <meshStandardMaterial color={accent} roughness={0.5} metalness={0} />
    </mesh>
  );
}
