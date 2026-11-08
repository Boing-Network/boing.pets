import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { resolvePlazaIdentity } from "../lib/presenceApi";
import {
  PRESENCE_MOVE_MIN_MS,
  type PresencePlayer,
  type ServerPresenceMessage,
} from "../lib/presenceProtocol";
import type { LivePose } from "../scene/Player";

export function usePlazaPresence(
  zoneId: string,
  livePose: MutableRefObject<LivePose>,
  enabled = true,
) {
  const [players, setPlayers] = useState<PresencePlayer[]>([]);
  const [status, setStatus] = useState<"off" | "connecting" | "live" | "error">(
    "off",
  );
  const [error, setError] = useState<string | null>(null);
  const selfId = useRef("");

  useEffect(() => {
    if (!enabled) {
      setStatus("off");
      setPlayers([]);
      return;
    }

    let closed = false;
    let socket: WebSocket | null = null;
    let timer = 0;
    setStatus("connecting");
    setError(null);

    void (async () => {
      const identity = await resolvePlazaIdentity(zoneId);
      if (closed) return;
      selfId.current = identity.id;

      const protocol = location.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(
        `${protocol}//${location.host}/api/world/presence?zone=${encodeURIComponent(zoneId)}`,
      );
      let lastSent = 0;

      const sendMove = () => {
        if (!socket || socket.readyState !== WebSocket.OPEN || closed) return;
        const now = performance.now();
        if (now - lastSent < PRESENCE_MOVE_MIN_MS) return;
        lastSent = now;
        const pose = livePose.current;
        socket.send(
          JSON.stringify({
            type: "move",
            x: pose.x,
            y: pose.y,
            z: pose.z,
          }),
        );
      };

      socket.addEventListener("open", () => {
        const pose = livePose.current;
        socket?.send(
          JSON.stringify({
            type: "hello",
            id: identity.id,
            name: identity.name,
            color: identity.color,
            x: pose.x,
            y: pose.y,
            z: pose.z,
            ...(identity.token ? { token: identity.token } : {}),
          }),
        );
        setStatus("live");
      });

      socket.addEventListener("message", (event) => {
        if (typeof event.data !== "string") return;
        let message: ServerPresenceMessage;
        try {
          message = JSON.parse(event.data) as ServerPresenceMessage;
        } catch {
          return;
        }
        if (message.type === "welcome") {
          setPlayers(message.players.filter((p) => p.id !== selfId.current));
          return;
        }
        if (message.type === "join") {
          if (message.player.id === selfId.current) return;
          setPlayers((prev) => {
            if (prev.some((p) => p.id === message.player.id)) return prev;
            return [...prev, message.player];
          });
          return;
        }
        if (message.type === "move") {
          if (message.id === selfId.current) return;
          setPlayers((prev) =>
            prev.map((p) =>
              p.id === message.id
                ? { ...p, x: message.x, y: message.y, z: message.z }
                : p,
            ),
          );
          return;
        }
        if (message.type === "leave") {
          setPlayers((prev) => prev.filter((p) => p.id !== message.id));
          return;
        }
        if (message.type === "error") {
          setError(message.message);
          setStatus("error");
        }
      });

      socket.addEventListener("close", () => {
        if (!closed) setStatus("error");
      });
      socket.addEventListener("error", () => {
        setError("Presence socket error");
        setStatus("error");
      });

      timer = window.setInterval(sendMove, PRESENCE_MOVE_MIN_MS);
    })();

    return () => {
      closed = true;
      window.clearInterval(timer);
      socket?.close(1000, "leave");
      setPlayers([]);
      setStatus("off");
    };
  }, [zoneId, enabled, livePose]);

  return {
    players,
    status,
    error,
    selfId: selfId.current,
  };
}
