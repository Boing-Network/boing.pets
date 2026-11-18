/**
 * Soft elliptical contact shadow under a creature. Grounds the silhouette
 * against night terrain without relying only on distant moon shadow maps.
 */
type Props = {
  /** Local-space radius of the soft pad. */
  radius?: number;
  opacity?: number;
  /** Lift slightly to avoid z-fighting with terrain. */
  y?: number;
};

export function GroundContact({
  radius = 0.28,
  opacity = 0.42,
  y = 0.012,
}: Props) {
  return (
    <mesh
      position={[0, y, 0.02]}
      rotation={[-Math.PI / 2, 0, 0]}
      renderOrder={-1}
    >
      <circleGeometry args={[radius, 28]} />
      <meshBasicMaterial
        color="#05080c"
        transparent
        opacity={opacity}
        depthWrite={false}
      />
    </mesh>
  );
}
