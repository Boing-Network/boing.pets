import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef, type MutableRefObject } from "react";
import type { WorldModel } from "../view/world/world-model";
import { reportAudioScene } from "./bind";
import { zoomFromDistance } from "./design";

type Props = {
  model: WorldModel;
  /** The camera's orbit target, kept current by `CameraRig`. */
  focus: MutableRefObject<{ x: number; y: number; z: number }>;
};

/** Seconds between samples: ambience changes slowly, so 5 Hz is plenty. */
const SAMPLE_EVERY = 0.2;

/**
 * Tells the audio what the camera is looking at: which biome, how near the
 * water, how far zoomed out. Renders nothing.
 */
export function WorldAudioProbe({ model, focus }: Props) {
  const { camera } = useThree();
  const wait = useRef(0);
  const territoryCenters = useMemo(
    () =>
      new Map(
        model.regions.map((r) => [
          r.territoryId,
          { x: r.center.x, z: r.center.z },
        ]),
      ),
    [model],
  );

  useFrame((_, delta) => {
    wait.current -= delta;
    if (wait.current > 0) return;
    wait.current = SAMPLE_EVERY;

    const target = focus.current;
    // Riverbanks and the edges between territories count as "the wilds" in
    // the model; for sound, the nearest territory within reach still owns
    // the spot, so its insects and creatures are heard there.
    let region = model.regionAt(target.x, target.z);
    if (region == null) {
      let best = Infinity;
      for (const candidate of model.regions) {
        const reach =
          Math.hypot(
            candidate.center.x - target.x,
            candidate.center.z - target.z,
          ) / candidate.radius;
        if (reach < best && reach < 1.6) {
          best = reach;
          region = candidate;
        }
      }
    }
    // The camera's right-hand direction on the ground plane.
    const e = camera.matrixWorld.elements;
    const length = Math.hypot(e[0]!, e[2]!) || 1;
    reportAudioScene({
      biome: region?.biome.id ?? null,
      waterDistance: model.waterDistAt(target.x, target.z),
      zoom: zoomFromDistance(
        Math.hypot(
          camera.position.x - target.x,
          camera.position.y - target.y,
          camera.position.z - target.z,
        ),
      ),
      listener: {
        x: target.x,
        z: target.z,
        rightX: e[0]! / length,
        rightZ: e[2]! / length,
      },
      territoryId: region?.territoryId ?? null,
      territoryCenters,
    });
  });

  return null;
}
