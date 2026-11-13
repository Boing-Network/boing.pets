import { useFrame } from "@react-three/fiber";
import { useRef, type MutableRefObject } from "react";
import type { LivePose } from "../world/scene/Player";
import {
  shouldTriggerSocialPlay,
  type SocialPlayPeer,
} from "../world/lib/emotes";

export function SocialPlayWatch({
  enabled,
  selfId,
  livePose,
  others,
  onPlay,
}: {
  enabled: boolean;
  selfId: string;
  livePose: MutableRefObject<LivePose>;
  others: SocialPlayPeer[];
  onPlay: (peerId: string) => void;
}) {
  const othersRef = useRef(others);
  othersRef.current = others;
  const lastPlayByPeer = useRef(new Map<string, number>());
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const onPlayRef = useRef(onPlay);
  onPlayRef.current = onPlay;

  useFrame(() => {
    if (!enabledRef.current || !selfId) return;
    const hit = shouldTriggerSocialPlay({
      now: Date.now(),
      selfId,
      myPos: { x: livePose.current.x, z: livePose.current.z },
      others: othersRef.current,
      lastPlayByPeer: lastPlayByPeer.current,
    });
    if (!hit) return;
    lastPlayByPeer.current.set(hit.id, Date.now());
    onPlayRef.current(hit.id);
  });
  return null;
}
