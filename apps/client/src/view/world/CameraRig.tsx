import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { MathUtils, Vector3, type PerspectiveCamera } from "three";
import type { WorldModel } from "./world-model";

type Focus = { x: number; y: number; z: number } | null;

type Props = {
  model: WorldModel;
  /** World point to keep in view when a creature is selected. */
  focus: Focus;
  /** Called when the orbit target moves, so moon shadows can follow. */
  onTarget: (target: { x: number; y: number; z: number }) => void;
};

type ControlsHandle = {
  target: Vector3;
  update: () => void;
};

/**
 * Pan, zoom and orbit sized for the open landscape. Selecting a creature
 * eases the view toward it without fighting the user's own drag.
 */
export function CameraRig({ model, focus, onTarget }: Props) {
  const controls = useRef<ControlsHandle | null>(null);
  const { camera } = useThree();
  const desired = useMemo(() => new Vector3(), []);
  const scratch = useMemo(() => new Vector3(), []);
  const userDriving = useRef(false);
  const driveUntil = useRef(0);

  const span = Math.max(
    model.bounds.maxX - model.bounds.minX,
    model.bounds.maxZ - model.bounds.minZ,
  );
  const minDistance = 12;
  const maxDistance = Math.max(180, span * 1.15);
  const home = useMemo(() => {
    let cx = 0;
    let cz = 0;
    const count = Math.max(1, model.regions.length);
    for (const region of model.regions) {
      cx += region.center.x / count;
      cz += region.center.z / count;
    }
    const y = model.heightAt(cx, cz);
    return { x: cx, y: y + 1.2, z: cz };
  }, [model]);

  useEffect(() => {
    const cam = camera as PerspectiveCamera;
    cam.near = 0.4;
    cam.far = 4000;
    cam.fov = 42;
    cam.position.set(
      home.x - span * 0.08,
      Math.max(55, span * 0.32),
      home.z + span * 0.55,
    );
    cam.updateProjectionMatrix();
    const ctrl = controls.current;
    if (ctrl) {
      ctrl.target.set(home.x, home.y, home.z);
      ctrl.update();
    }
    onTarget(home);
  }, [camera, home, onTarget, span]);

  useEffect(() => {
    if (!focus) return;
    desired.set(focus.x, focus.y + 0.6, focus.z);
    driveUntil.current = performance.now() + 1400;
    userDriving.current = false;
  }, [desired, focus]);

  useEffect(() => {
    // Demo / media helper: frame a world point from outside the canvas.
    const api = {
      lookAt(x: number, y: number, z: number, distance = 28) {
        const ctrl = controls.current;
        if (!ctrl) return;
        ctrl.target.set(x, y, z);
        camera.position.set(
          x - distance * 0.35,
          y + distance * 0.55,
          z + distance * 0.85,
        );
        ctrl.update();
        userDriving.current = true;
        driveUntil.current = 0;
        onTarget({ x, y, z });
      },
      /** Frame the current selection focus (set by WorldScene). */
      frameFocus(distance = 14) {
        const point = (
          window as unknown as {
            __livingPetsFocus?: { x: number; y: number; z: number };
          }
        ).__livingPetsFocus;
        if (!point) return false;
        api.lookAt(point.x, point.y + 0.35, point.z, distance);
        return true;
      },
      home() {
        const ctrl = controls.current;
        if (!ctrl) return;
        ctrl.target.set(home.x, home.y, home.z);
        camera.position.set(
          home.x - span * 0.08,
          Math.max(55, span * 0.32),
          home.z + span * 0.55,
        );
        ctrl.update();
        onTarget(home);
      },
      regions: model.regions.map((r) => ({
        name: r.name,
        x: r.center.x,
        y: model.heightAt(r.center.x, r.center.z),
        z: r.center.z,
        water: model.bodies[r.index]!,
      })),
    };
    (
      window as unknown as { __livingPetsCamera?: typeof api }
    ).__livingPetsCamera = api;
    return () => {
      delete (window as unknown as { __livingPetsCamera?: typeof api })
        .__livingPetsCamera;
    };
  }, [camera, home, model, onTarget, span]);

  useFrame(() => {
    const ctrl = controls.current;
    if (!ctrl) return;
    onTarget({ x: ctrl.target.x, y: ctrl.target.y, z: ctrl.target.z });
    if (userDriving.current) return;
    if (performance.now() > driveUntil.current) return;
    if (!focus) return;
    desired.set(focus.x, focus.y + 0.6, focus.z);
    ctrl.target.lerp(desired, 0.08);
    // Keep a readable distance while easing toward the creature.
    scratch.copy(camera.position).sub(ctrl.target);
    const distance = scratch.length();
    const want = MathUtils.clamp(distance, 18, 48);
    if (Math.abs(distance - want) > 0.05) {
      scratch.setLength(want);
      camera.position.copy(ctrl.target).add(scratch);
    }
    ctrl.update();
  });

  return (
    <OrbitControls
      ref={controls as never}
      makeDefault
      enablePan
      enableDamping
      dampingFactor={0.08}
      minDistance={minDistance}
      maxDistance={maxDistance}
      maxPolarAngle={Math.PI / 2.08}
      minPolarAngle={0.18}
      screenSpacePanning={false}
      onStart={() => {
        userDriving.current = true;
        driveUntil.current = 0;
      }}
      onEnd={() => {
        userDriving.current = false;
      }}
    />
  );
}
