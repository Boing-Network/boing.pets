import { useFrame } from "@react-three/fiber";
import { useRef, type ComponentProps } from "react";
import { Group, Vector3 } from "three";
import { WorldText } from "../world/scene/WorldText";
import { YARD_LABEL_FONT_URL } from "../world/lib/worldFont";
import {
  YARD_LABEL_FILL,
  YARD_LABEL_STROKE,
  YARD_LABEL_TAG_FILL,
} from "./yardLabels";
import {
  clampLabelToViewport,
  labelDistanceScale,
  labelHudOpacity,
  labelScreenRect,
  pastureHudSafeRects,
  projectLocalBoxToScreen,
} from "./hudSafeLabel";
import { readPastureTouchPrefs } from "./mobileControls";

type Props = ComponentProps<typeof WorldText> & { tag?: string };

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
  fontSize = 0.42,
  tag,
  children,
  color = YARD_LABEL_FILL,
  outlineColor = YARD_LABEL_STROKE,
  outlineWidth = 0.07,
  font = YARD_LABEL_FONT_URL,
  ...props
}: Props) {
  const group = useRef<Group>(null);
  const offset = useRef<Group>(null);
  const text = useRef<LabelMesh | null>(null);
  const tagText = useRef<LabelMesh | null>(null);
  const title =
    typeof children === "string" || typeof children === "number"
      ? String(children)
      : "";
  const length = Math.max(title.length, tag?.length ?? 0, 8);

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
      if (tagText.current) tagText.current.visible = false;
      return;
    }
    const sx = (_world.x * 0.5 + 0.5) * size.width;
    const sy = (-_world.y * 0.5 + 0.5) * size.height;
    const fontPx = Math.max(
      10,
      (Number(fontSize) / Math.max(distance, 0.2)) * size.height * 0.58,
    );
    const bounds = label.textRenderInfo?.blockBounds;
    let rect = bounds
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
    if (tag) {
      const tagH = (rect.bottom - rect.top) * 0.55;
      rect = { ...rect, bottom: rect.bottom + tagH };
    }
    const clamped = clampLabelToViewport(rect, size);
    if (!clamped) {
      label.visible = false;
      if (tagText.current) tagText.current.visible = false;
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
      pastureHudSafeRects(
        size.width,
        size.height,
        readPastureTouchPrefs().touchControls,
      ),
      size,
      {
        x: (midX / size.width) * 2 - 1,
        y: -((midY / size.height) * 2 - 1),
      },
    );
    label.fillOpacity = opacity;
    label.outlineOpacity = opacity;
    label.visible = opacity > 0.04;
    if (tagText.current) {
      tagText.current.fillOpacity = opacity;
      tagText.current.outlineOpacity = opacity;
      tagText.current.visible = opacity > 0.04;
    }
  });

  const tagSize = Number(fontSize) * 0.4;

  return (
    <group ref={group} position={position}>
      <group ref={offset}>
        <WorldText
          ref={text}
          font={font}
          fontSize={fontSize}
          color={color}
          outlineColor={outlineColor}
          outlineWidth={outlineWidth}
          position={[0, 0, 0]}
          {...props}
        >
          {children}
        </WorldText>
        {tag ? (
          <WorldText
            ref={tagText}
            font={font}
            fontSize={tagSize}
            color={YARD_LABEL_TAG_FILL}
            outlineColor={outlineColor}
            outlineWidth={0.05}
            position={[0, -Number(fontSize) * 0.82, 0]}
            anchorX={props.anchorX ?? "center"}
            anchorY={props.anchorY ?? "middle"}
          >
            {tag}
          </WorldText>
        ) : null}
      </group>
    </group>
  );
}
