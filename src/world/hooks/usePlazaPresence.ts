import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { resolvePlazaIdentity } from "../lib/presenceApi";
import {
  PRESENCE_MOVE_MIN_MS,
  type PresencePlayer,
  type ServerPresenceMessage,
} from "../lib/presenceProtocol";
import type { LivePose } from "../scene/Player";
import { plazaErrorMessage } from "../lib/plazaJoinGate";

export function usePlazaPresence(
  zoneId: string,
  livePose: MutableRefObject<LivePose>,
  enabled = true,
  /** When true, may open Express to request accounts / sign a presence token. */
  allowPrompt = false,
  /** Bump to force a clean reconnect (e.g. retry wallet promote). */
  joinNonce = 0,
) {
  const [players, setPlayers] = useState<PresencePlayer[]>([]);
  const [status, setStatus] = useState<"off" | "connecting" | "live" | "error">(
    "off",
  );
  const [error, setError] = useState<string | null>(null);
  const [walletBound, setWalletBound] = useState(false);
  const selfId = useRef("");

  useEffect(() => {
    if (!enabled) {
      setStatus("off");
      setPlayers([]);
      setWalletBound(false);
      return;
    }

    let closed = false;
    let socket: WebSocket | null = null;
    let timer = 0;
    /** Server has accepted our hello (welcome received). Moves before this race the async token check. */
    let joined = false;
    setStatus("connecting");
    setError(null);
    setWalletBound(false);

    const tearDown = (code = 1000, reason = "leave") => {
      closed = true;
      joined = false;
      window.clearInterval(timer);
      timer = 0;
      if (socket) {
        try {
          socket.close(code, reason);
        } catch {
          /* already closed */
        }
        socket = null;
      }
    };

    const onPageHide = () => tearDown(1000, "pagehide");
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onPageHide);

    void (async () => {
      const identity = await resolvePlazaIdentity(zoneId, { allowPrompt });
      if (closed) return;
      selfId.current = identity.id;
      setWalletBound(!!identity.wallet);

      const protocol = location.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(
        `${protocol}//${location.host}/api/world/presence?zone=${encodeURIComponent(zoneId)}`,
      );
      let lastSent = 0;

      const sendMove = () => {
        // Do not send moves until the server has welcomed us — wallet hello
        // validates the presence token in D1 and can lose a race with the interval.
        if (
          !joined ||
          !socket ||
          socket.readyState !== WebSocket.OPEN ||
          closed
        )
          return;
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

      const startMoveLoop = () => {
        if (timer || closed) return;
        timer = window.setInterval(sendMove, PRESENCE_MOVE_MIN_MS);
      };

      socket.addEventListener("open", () => {
        if (closed) return;
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
        // Stay on "connecting" until welcome — avoids false "live" during handshake.
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
          joined = true;
          setPlayers(message.players.filter((p) => p.id !== selfId.current));
          setStatus("live");
          setError(null);
          startMoveLoop();
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
          // Ignore stale handshake races if we somehow still get one.
          if (!joined && message.message === "Send hello first") return;
          setError(plazaErrorMessage(message.message));
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
    })();

    return () => {
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onPageHide);
      tearDown(1000, "leave");
      setPlayers([]);
      setStatus("off");
      setWalletBound(false);
    };
  }, [zoneId, enabled, livePose, allowPrompt, joinNonce]);

  return {
    players,
    status,
    error,
    walletBound,
    selfId: selfId.current,
  };
}
