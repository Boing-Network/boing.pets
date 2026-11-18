import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  BackSide,
  Color,
  FogExp2,
  ShaderMaterial,
  type DirectionalLight,
  type Mesh,
} from "three";
import { MOON_DIRECTION, getNoiseTexture, worldTime } from "./gfx";

export const FOG_COLOR = "#0d2638";

const SKY_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_Position.z = gl_Position.w;
}
`;

const SKY_FRAGMENT = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uMid;
uniform vec3 uHorizon;
uniform vec3 uMoonDir;
uniform vec3 uMoonColor;
uniform sampler2D uNoise;
uniform float uTime;
varying vec3 vDir;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

void main() {
  vec3 dir = normalize(vDir);
  float up = max(dir.y, 0.0);
  vec3 color = mix(uHorizon, uMid, smoothstep(0.0, 0.22, up));
  color = mix(color, uZenith, smoothstep(0.15, 0.75, up));

  // Stars: one candidate per cell of a grid wrapped round the sky.
  vec3 grid = dir * 150.0;
  vec3 cell = floor(grid);
  float seedling = hash(cell);
  float star = step(0.992, seedling);
  float sparkle = 0.6 + 0.4 * sin(uTime * (1.0 + seedling * 3.0) + seedling * 40.0);
  float core = smoothstep(0.5, 0.05, length(fract(grid) - 0.5));
  color += vec3(0.8, 0.9, 1.0) * star * core * sparkle * smoothstep(0.02, 0.3, up) * 1.3;

  // Moon with a wide halo.
  float toMoon = dot(dir, uMoonDir);
  float disc = smoothstep(0.99905, 0.99935, toMoon);
  float craters = texture2D(uNoise, dir.xy * 9.0).r;
  color = mix(color, uMoonColor * (0.82 + 0.3 * craters), disc);
  color += uMoonColor * (pow(max(toMoon, 0.0), 900.0) * 0.5 + pow(max(toMoon, 0.0), 40.0) * 0.16) * (1.0 - disc);

  // Thin moonlit cloud bands drifting near the horizon.
  vec2 cloudUv = dir.xz / (dir.y + 0.28) * 0.11 + vec2(uTime * 0.0015, 0.0);
  float cloud = texture2D(uNoise, cloudUv).r * 0.65 + texture2D(uNoise, cloudUv * 2.7).a * 0.35;
  float band = smoothstep(0.5, 0.78, cloud) * smoothstep(0.0, 0.12, up) * smoothstep(0.75, 0.2, up);
  vec3 cloudColor = mix(uMid * 1.9, uMoonColor * 0.55, pow(max(toMoon, 0.0), 6.0));
  color = mix(color, cloudColor, band * 0.5);

  // Below the horizon everything settles into the fog color.
  color = mix(color, uHorizon, smoothstep(0.0, -0.08, dir.y));

  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

type Props = {
  /** Half-width of the area that receives moon shadows around the focus. */
  shadowReach?: number;
  /** Point the shadow area follows, usually the camera's focus on the ground. */
  focus: { x: number; y: number; z: number };
};

/** Night sky, fog and moonlight. */
export function Sky({ focus, shadowReach = 90 }: Props) {
  const scene = useThree((s) => s.scene);
  const dome = useRef<Mesh>(null);
  const moon = useRef<DirectionalLight>(null);

  const material = useMemo(() => {
    return new ShaderMaterial({
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      side: BackSide,
      depthWrite: false,
      depthTest: true,
      fog: false,
      uniforms: {
        uZenith: { value: new Color("#040818") },
        uMid: { value: new Color("#0b1a3a") },
        uHorizon: { value: new Color(FOG_COLOR) },
        uMoonDir: { value: MOON_DIRECTION.clone() },
        uMoonColor: { value: new Color("#eef4ff") },
        uNoise: { value: getNoiseTexture() },
        uTime: worldTime,
      },
    });
  }, []);
  useEffect(() => () => material.dispose(), [material]);

  useEffect(() => {
    const previous = scene.fog;
    const previousBackground = scene.background;
    scene.fog = new FogExp2(FOG_COLOR, 0.0024);
    scene.background = new Color(FOG_COLOR);
    return () => {
      scene.fog = previous;
      scene.background = previousBackground;
    };
  }, [scene]);

  useFrame(({ camera }) => {
    dome.current?.position.copy(camera.position);
    const light = moon.current;
    if (light) {
      // Snap the shadow area to whole texels so shadows do not swim when the
      // camera pans.
      const texel = (shadowReach * 2) / light.shadow.mapSize.x;
      const x = Math.round(focus.x / texel) * texel;
      const z = Math.round(focus.z / texel) * texel;
      light.target.position.set(x, focus.y, z);
      light.position
        .copy(MOON_DIRECTION)
        .multiplyScalar(220)
        .add(light.target.position);
      light.target.updateMatrixWorld();
    }
  });

  return (
    <>
      <mesh
        ref={dome}
        material={material}
        renderOrder={-10}
        frustumCulled={false}
      >
        <sphereGeometry args={[900, 32, 20]} />
      </mesh>
      <hemisphereLight args={["#8eb4e8", "#1a4034", 0.95]} />
      <ambientLight intensity={0.28} color="#9fc0ff" />
      <directionalLight
        ref={moon}
        color="#cfe0ff"
        intensity={2.35}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-shadowReach}
        shadow-camera-right={shadowReach}
        shadow-camera-top={shadowReach}
        shadow-camera-bottom={-shadowReach}
        shadow-camera-near={20}
        shadow-camera-far={520}
        shadow-bias={-0.0006}
        shadow-normalBias={0.35}
      />
    </>
  );
}
