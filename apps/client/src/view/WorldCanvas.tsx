import { Canvas } from "@react-three/fiber";
import { WorldScene } from "./world/WorldScene";

export function WorldCanvas() {
  return (
    <Canvas
      shadows
      dpr={[1, 1.75]}
      camera={{ position: [20, 70, 120], fov: 42, near: 0.4, far: 4000 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      onCreated={({ gl }) => {
        gl.setClearColor("#0d2638");
        gl.shadowMap.enabled = true;
      }}
    >
      <WorldScene />
    </Canvas>
  );
}
