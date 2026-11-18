/**
 * Night territory atmosphere inspired by the open-world key art.
 * Presentation only — does not alter the territory graph.
 */

export function WorldAtmosphere() {
  return (
    <>
      <color attach="background" args={["#06101c"]} />
      <fog attach="fog" args={["#071624", 16, 42]} />

      <ambientLight intensity={0.28} color="#6e90b0" />
      <directionalLight
        position={[-6, 11, -3]}
        intensity={0.7}
        color="#d7ebff"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <pointLight
        position={[0.2, 4.5, -8]}
        color="#f0c878"
        intensity={1.8}
        distance={34}
      />
      <pointLight
        position={[0, 0.8, 2]}
        color="#3ecfc0"
        intensity={1.0}
        distance={18}
      />

      {/* Luminous water as the world floor */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.14, 0]}
        receiveShadow
      >
        <planeGeometry args={[34, 24]} />
        <meshStandardMaterial
          color="#082838"
          emissive="#145868"
          emissiveIntensity={0.55}
          roughness={0.22}
          metalness={0.4}
        />
      </mesh>

      {/* Soft shore pads under the territory graph */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.05, 0]}
        receiveShadow
      >
        <planeGeometry args={[14, 5.5]} />
        <meshStandardMaterial
          color="#101c24"
          emissive="#0e2a30"
          emissiveIntensity={0.15}
          roughness={0.95}
        />
      </mesh>

      {/* Lily pads / biolume water cues */}
      {(
        [
          [-3.2, -0.1, 3.6],
          [-1.0, -0.1, 4.4],
          [1.2, -0.1, 3.9],
          [3.6, -0.1, 3.2],
          [-4.6, -0.1, 2.0],
          [0.2, -0.1, 5.4],
          [4.8, -0.1, 1.4],
          [-5.2, -0.1, -2.2],
          [5.4, -0.1, -1.8],
        ] as const
      ).map((pos, index) => (
        <mesh key={index} position={pos} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.2 + (index % 3) * 0.06, 16]} />
          <meshStandardMaterial
            color="#143f36"
            emissive="#2ec4a0"
            emissiveIntensity={0.65}
            roughness={0.6}
          />
        </mesh>
      ))}

      {/* Floating islands */}
      <group position={[-8.5, 2.6, -7.2]}>
        <mesh castShadow>
          <cylinderGeometry args={[1.4, 1.85, 0.55, 7]} />
          <meshStandardMaterial color="#1a2a28" roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.4, 0]}>
          <cylinderGeometry args={[1.05, 1.35, 0.35, 7]} />
          <meshStandardMaterial
            color="#243832"
            emissive="#1f6a50"
            emissiveIntensity={0.4}
            roughness={0.85}
          />
        </mesh>
        <mesh position={[0, -1.2, 0.5]}>
          <boxGeometry args={[0.4, 2.2, 0.18]} />
          <meshStandardMaterial
            color="#8fd8ff"
            emissive="#6ad0ff"
            emissiveIntensity={0.85}
            transparent
            opacity={0.5}
          />
        </mesh>
      </group>

      <mesh position={[7.8, 2.9, -7.8]} castShadow>
        <cylinderGeometry args={[1.05, 1.4, 0.48, 6]} />
        <meshStandardMaterial color="#18262a" roughness={0.9} />
      </mesh>
      <mesh position={[7.8, 3.3, -7.8]}>
        <cylinderGeometry args={[0.75, 1.0, 0.3, 6]} />
        <meshStandardMaterial
          color="#223038"
          emissive="#2a5a50"
          emissiveIntensity={0.25}
        />
      </mesh>

      {/* Distant city set dressing */}
      <group position={[0.3, 3.4, -9.5]}>
        <mesh position={[0, 0.35, 0]}>
          <boxGeometry args={[3.4, 0.7, 1.5]} />
          <meshStandardMaterial
            color="#e8dcc8"
            emissive="#f0c878"
            emissiveIntensity={0.6}
            roughness={0.45}
          />
        </mesh>
        {(
          [
            [-1.25, 1.15, 0],
            [-0.55, 1.55, 0.1],
            [0.2, 1.3, -0.05],
            [0.95, 1.75, 0.05],
            [1.45, 1.05, -0.1],
          ] as const
        ).map((pos, index) => (
          <mesh key={index} position={pos}>
            <boxGeometry
              args={[0.28 + (index % 3) * 0.05, 1.1 + (index % 2) * 0.5, 0.28]}
            />
            <meshStandardMaterial
              color="#f2e8d6"
              emissive="#ffd27a"
              emissiveIntensity={0.7}
              roughness={0.4}
            />
          </mesh>
        ))}
        <mesh position={[0.15, 2.05, 0]}>
          <sphereGeometry args={[0.38, 14, 12]} />
          <meshStandardMaterial
            color="#f7efe2"
            emissive="#ffd78a"
            emissiveIntensity={0.85}
            roughness={0.3}
          />
        </mesh>
        <pointLight
          position={[0, 1.3, 1.1]}
          color="#ffd27a"
          intensity={2.2}
          distance={16}
        />
      </group>

      {/* Moon */}
      <mesh position={[-7.2, 9.8, -6]}>
        <sphereGeometry args={[1.2, 24, 24]} />
        <meshBasicMaterial color="#eef5ff" />
      </mesh>
      <pointLight
        position={[-7, 9.2, -5]}
        color="#dcecff"
        intensity={1.35}
        distance={42}
      />
    </>
  );
}
