import { useFrame } from "@react-three/fiber";
import { useRef, type ComponentProps } from "react";
import { Group, Vector3 } from "three";
import { WorldText } from "../world/scene/WorldText";
import {
  labelDistanceScale,
  labelHudOpacity,
  labelScreenRect,
  pastureHudSafeRects,
} from "./hudSafeLabel";

type Props = ComponentProps<typeof WorldText>;

const _world = new Vector3();
const _cam = new Vector3();

export function PastureWorldText({
  position,
  fontSize = 0.35,
  children,
  ...props
}: Props) {
  const group = useRef<Group>(null);
  const text = useRef<{
    fillOpacity: number;
    outlineOpacity: number;
    visible: boolean;
  } | null>(null);
  const length =
    typeof children === "string" || typeof children === "number"
      ? String(children).length
      : 12;

  useFrame(({ camera, size }) => {
    const node = group.current;
    const label = text.current;
    if (!node || !label) return;
    node.getWorldPosition(_world);
    _cam.copy(camera.position);
    const distance = _cam.distanceTo(_world);
    const scale = labelDistanceScale(distance);
    node.scale.setScalar(scale);
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
    const rect = labelScreenRect(sx, sy, fontPx, length);
    const opacity = labelHudOpacity(
      rect,
      pastureHudSafeRects(size.width, size.height),
      size,
      { x: _world.x, y: _world.y },
    );
    label.fillOpacity = opacity;
    label.outlineOpacity = opacity;
    label.visible = opacity > 0.04;
  });

  return (
    <group ref={group} position={position}>
      <WorldText ref={text} fontSize={fontSize} position={[0, 0, 0]} {...props}>
        {children}
      </WorldText>
    </group>
  );
}
