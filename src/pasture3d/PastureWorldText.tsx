import { useFrame } from "@react-three/fiber";
import { useRef, type ComponentProps } from "react";
import { Group, Vector3 } from "three";
import { WorldText } from "../world/scene/WorldText";
import {
  clampLabelToViewport,
  labelDistanceScale,
  labelHudOpacity,
  labelScreenRect,
  pastureHudSafeRects,
  projectLocalBoxToScreen,
} from "./hudSafeLabel";

type Props = ComponentProps<typeof WorldText>;

type LabelMesh = {
  fillOpacity: number;
  outlineOpacity: number;
  visible: boolean;
  matrixWorld: import("three").Matrix4;
  textRenderInfo?: { blockBounds?: [number, number, number, number] };
};

const _world = new Vector3();
const _cam = new Vector3();
const _shifted = new Vector3();
const _local = new Vector3();
/** Troika outlineWidth on WorldText, plus a little AA slack. */
const TEXT_BOUNDS_PAD = 0.03;

export function PastureWorldText({
  position,
  fontSize = 0.35,
  children,
  ...props
}: Props) {
  const group = useRef<Group>(null);
  const offset = useRef<Group>(null);
  const text = useRef<LabelMesh | null>(null);
  const length =
    typeof children === "string" || typeof children === "number"
      ? String(children).length
      : 12;

  useFrame(({ camera, size }) => {
    const node = group.current;
    const shift = offset.current;
    const label = text.current;
    if (!node || !shift || !label) return;
    // Measure from the unclamped attachment so the shift is not compounded.
    shift.position.set(0, 0, 0);
    node.updateWorldMatrix(true, true);
    node.getWorldPosition(_world);
    _cam.copy(camera.position);
    const distance = _cam.distanceTo(_world);
    const scale = labelDistanceScale(distance);
    node.scale.setScalar(scale);
    node.updateWorldMatrix(true, true);
    _world.project(camera);
    if (_world.z < -1 || _world.z > 1) {
      label.visible = false;
      return;
    }
    const sx = (_world.x * 0.5 + 0.5) * size.width;
    const sy = (-_world.y * 0.5 + 0.5) * size.height;
    const fontPx = Math.max(
      10,
      (Number(fontSize) / Math.max(distance, 0.2)) * size.height * 0.58,
    );
    const bounds = label.textRenderInfo?.blockBounds;
    const rect = bounds
      ? projectLocalBoxToScreen(
          label.matrixWorld,
          bounds[0] - TEXT_BOUNDS_PAD,
          bounds[1] - TEXT_BOUNDS_PAD,
          bounds[2] + TEXT_BOUNDS_PAD,
          bounds[3] + TEXT_BOUNDS_PAD,
          camera,
          size,
        )
      : labelScreenRect(sx, sy, fontPx, length);
    const clamped = clampLabelToViewport(rect, size);
    if (!clamped) {
      label.visible = false;
      return;
    }
    if (clamped.dx !== 0 || clamped.dy !== 0) {
      const ndcX = ((sx + clamped.dx) / size.width) * 2 - 1;
      const ndcY = -((sy + clamped.dy) / size.height) * 2 + 1;
      _shifted.set(ndcX, ndcY, _world.z).unproject(camera);
      shift.position.copy(node.worldToLocal(_local.copy(_shifted)));
    }
    const midX = (clamped.left + clamped.right) / 2;
    const midY = (clamped.top + clamped.bottom) / 2;
    const opacity = labelHudOpacity(
      clamped,
      pastureHudSafeRects(size.width, size.height),
      size,
      {
        x: (midX / size.width) * 2 - 1,
        y: -((midY / size.height) * 2 - 1),
      },
    );
    label.fillOpacity = opacity;
    label.outlineOpacity = opacity;
    label.visible = opacity > 0.04;
  });

  return (
    <group ref={group} position={position}>
      <group ref={offset}>
        <WorldText
          ref={text}
          fontSize={fontSize}
          position={[0, 0, 0]}
          {...props}
        >
          {children}
        </WorldText>
      </group>
    </group>
  );
}
