import { useFrame, useThree } from "@react-three/fiber";
import { useRef, type MutableRefObject } from "react";
import { Fog, type DirectionalLight, type HemisphereLight } from "three";
import * as THREE from "three";
import { tickMeadowWind } from "./meadowWind";
import { publicPastureDay, samplePastureDay } from "./pastureDay";

/** Live atmosphere flags for decor (fireflies, etc.). */
export const pastureDayLive = { showFireflies: false, isNight: false };

/** Set to an hour 0-24 to freeze lighting (screenshots / debug). Null uses the public mid-morning lock, not the wall clock. */
export const pastureHourOverride: { current: number | null } = {
  current: null,
};

export function MeadowAtmosphere({
  preferPerf,
  reducedMotion = false,
}: {
  preferPerf: boolean;
  reducedMotion?: boolean;
  followRef?: MutableRefObject<{ x: number; z: number }>;
}) {
  const sun = useRef<DirectionalLight>(null);
  const fill = useRef<DirectionalLight>(null);
  const hemi = useRef<HemisphereLight>(null);
  const ambient = useRef<THREE.AmbientLight>(null);
  const { scene, gl } = useThree();
  const shadows = !preferPerf;

  useFrame(({ clock }) => {
    if (!reducedMotion) tickMeadowWind(clock.elapsedTime);
    const hour = pastureHourOverride.current;
    const day =
      hour == null ? publicPastureDay() : samplePastureDay(hour, true);
    pastureDayLive.showFireflies = day.showFireflies;
    pastureDayLive.isNight = day.isNight;
    if (ambient.current) ambient.current.intensity = day.ambient;
    if (hemi.current) {
      hemi.current.color.set(day.hemiSky);
      hemi.current.groundColor.set(day.hemiGround);
      hemi.current.intensity = day.hemiIntensity;
    }
    if (sun.current) {
      sun.current.color.set(day.sunColor);
      sun.current.intensity = day.sunIntensity;
      // Pin the dusk key to the plaza so lighting matches the locked
      // late-afternoon look instead of dragging long shadows with the pet.
      sun.current.position.set(day.sunX, day.sunY, day.sunZ);
      sun.current.target.position.set(0, 0, 0);
      sun.current.target.updateMatrixWorld();
    }
    if (fill.current) {
      fill.current.color.set(day.fillColor);
      fill.current.intensity = day.fillIntensity;
    }
    if (scene.background && "set" in scene.background) {
      (scene.background as THREE.Color).set(day.background);
    } else {
      scene.background = new THREE.Color(day.background);
    }
    if (scene.fog instanceof Fog) {
      scene.fog.color.set(day.fogColor);
      scene.fog.near = day.fogNear;
      scene.fog.far = day.fogFar;
    }
    gl.toneMappingExposure = day.exposure;
  });

  const first = publicPastureDay();
  return (
    <>
      <color attach="background" args={[first.background]} />
      <fog attach="fog" args={[first.fogColor, first.fogNear, first.fogFar]} />
      <ambientLight ref={ambient} intensity={first.ambient} />
      <hemisphereLight
        ref={hemi}
        args={[first.hemiSky, first.hemiGround, first.hemiIntensity]}
      />
      <directionalLight
        ref={sun}
        intensity={first.sunIntensity}
        color={first.sunColor}
        position={[first.sunX, first.sunY, first.sunZ]}
        castShadow={shadows}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={1}
        shadow-camera-far={70}
        shadow-camera-left={-32}
        shadow-camera-right={32}
        shadow-camera-top={32}
        shadow-camera-bottom={-32}
        shadow-bias={-0.0004}
        shadow-normalBias={0.035}
        shadow-radius={3}
        shadow-intensity={0.42}
      />
      <directionalLight
        ref={fill}
        intensity={first.fillIntensity}
        color={first.fillColor}
        position={[22, 14, -8]}
      />
    </>
  );
}
