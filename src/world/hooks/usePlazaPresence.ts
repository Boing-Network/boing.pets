import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import type { EquippedCosmetics } from "../../content/cosmetics";
import { resolvePlazaIdentity } from "../lib/presenceApi";
import {
  PRESENCE_MOVE_MIN_MS,
  type PresencePlayer,
  type ServerPresenceMessage,
} from "../lib/presenceProtocol";
import type { LivePose } from "../scene/Player";
import { plazaErrorMessage } from "../lib/plazaJoinGate";

export type PresenceChat = {
  id: string;
  name: string;
  text: string;
  at: number;
};

export type PlazaPresenceOptions = {
  allowSocialSession?: boolean;
  cosmetics?: EquippedCosmetics;
  presenceUrl?: string;
};

export function usePlazaPresence(
  zoneId: string,
  livePose: MutableRefObject<LivePose>,
  enabled = true,
  /** When true, may open Express to request accounts / sign a presence token. */
  allowPrompt = false,
  /** Bump to force a clean reconnect (e.g. retry wallet promote). */
  joinNonce = 0,
  options: PlazaPresenceOptions = {},
) {
  const [players, setPlayers] = useState<PresencePlayer[]>([]);
  const [chats, setChats] = useState<PresenceChat[]>([]);
  const [status, setStatus] = useState<"off" | "connecting" | "live" | "error">(
    "off",
  );
  const [error, setError] = useState<string | null>(null);
  const [walletBound, setWalletBound] = useState(false);
  const selfId = useRef("");
  const socketRef = useRef<WebSocket | null>(null);
  const joinedRef = useRef(false);
  const cosmeticsRef = useRef(options.cosmetics);
  cosmeticsRef.current = options.cosmetics;
  const allowSocialSession = options.allowSocialSession ?? false;
  const presenceUrl = options.presenceUrl;

  useEffect(() => {
    if (!enabled) {
      setStatus("off");
      setPlayers([]);
      setChats([]);
      setWalletBound(false);
      return;
    }

    let closed = false;
    let socket: WebSocket | null = null;
    let timer = 0;
    /** Server has accepted our hello (welcome received). Moves before this race the async token check. */
    let joined = false;
    joinedRef.current = false;
    setStatus("connecting");
    setError(null);
    setWalletBound(false);

    const tearDown = (code = 1000, reason = "leave") => {
      closed = true;
      joined = false;
      joinedRef.current = false;
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
      socketRef.current = null;
    };

    const onPageHide = () => tearDown(1000, "pagehide");
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onPageHide);

    void (async () => {
      const identity = await resolvePlazaIdentity(zoneId, {
        allowPrompt,
        allowSocialSession,
      });
      if (closed) return;
      selfId.current = identity.id;
      setWalletBound(!!identity.wallet);

      const protocol = location.protocol === "https:" ? "wss:" : "ws:";
      const override =
        presenceUrl ||
        (typeof window !== "undefined"
          ? window.__PASTURE_PRESENCE_URL__
          : undefined);
      socket = new WebSocket(
        override ||
          `${protocol}//${location.host}/api/world/presence?zone=${encodeURIComponent(zoneId)}`,
      );
      socketRef.current = socket;
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
        const cosmetics = cosmeticsRef.current;
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
            ...(identity.session ? { session: identity.session } : {}),
            ...(cosmetics ? { cosmetics } : {}),
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
          joinedRef.current = true;
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
        if (message.type === "cosmetics") {
          if (message.id === selfId.current) return;
          setPlayers((prev) =>
            prev.map((p) =>
              p.id === message.id ? { ...p, cosmetics: message.cosmetics } : p,
            ),
          );
          return;
        }
        if (message.type === "chat") {
          setChats((prev) => [...prev, message].slice(-40));
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
      setChats([]);
      setStatus("off");
      setWalletBound(false);
    };
  }, [
    zoneId,
    enabled,
    livePose,
    allowPrompt,
    joinNonce,
    allowSocialSession,
    presenceUrl,
  ]);

  const sendChat = useCallback((text: string) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN || !joinedRef.current)
      return false;
    socket.send(JSON.stringify({ type: "chat", text }));
    return true;
  }, []);

  const sendCosmetics = useCallback((cosmetics?: EquippedCosmetics) => {
    cosmeticsRef.current = cosmetics;
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN || !joinedRef.current)
      return;
    socket.send(JSON.stringify({ type: "cosmetics", cosmetics }));
  }, []);

  return {
    players,
    chats,
    status,
    error,
    walletBound,
    selfId: selfId.current,
    sendChat,
    sendCosmetics,
  };
}

declare global {
  interface Window {
    __PASTURE_PRESENCE_URL__?: string;
  }
}
