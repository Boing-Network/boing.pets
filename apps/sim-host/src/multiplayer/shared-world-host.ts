/**
 * Shared-world host seam (M22).
 *
 * One HostRuntime (single writer) owns clock, catch-up, persistence, and the
 * influence queue. Multiple client sessions attach as view + influence only.
 * Pure `step()` stays inside the runtime's session path — never at the edge.
 */
import type {
  ClientToHost,
  HostToClient,
  QueryResult,
  SessionRole,
  TimeScale,
} from "@boing-pets/contract";
import type { MintEdge } from "../boing";
import { clockView } from "../clock";
import type { WorldRepository } from "../persist/repository";
import {
  createHostRuntime,
  type CommandContext,
  type CommandOutcome,
  type HostRuntime,
} from "../runtime/host-runtime";
import { buildWorldView } from "../view/world-view";
import { isValidAccountId } from "./account";
import {
  allocateSessionId,
  createClientRegistry,
  type ClientConnection,
  type ClientEmit,
  type ClientRegistry,
} from "./client-registry";

export type SharedWorldHostOptions = {
  repository: WorldRepository;
  seed?: number;
  nowMs?: () => number;
  autoFrame?: boolean;
  mintEdge?: MintEdge;
  /**
   * Optional outer emit (logging / metrics). Fan-out to clients is separate.
   */
  onBroadcast?: (message: HostToClient) => void;
  /** Scale for a world with no saved clock preference. */
  initialScale?: TimeScale;
};

export type SharedWorldHost = {
  runtime: HostRuntime;
  clients: ClientRegistry;
  start(): Promise<void>;
  /**
   * Register a transport sink and complete the join handshake.
   * Sends session.welcome, world.snapshot, and world.clock to that client.
   */
  join(options: {
    accountId: string;
    emit: ClientEmit;
    sessionId?: string;
    /** Default "player". Owners may pause / rescale. */
    role?: SessionRole;
    displayName?: string;
  }): Promise<ClientConnection | null>;
  leave(sessionId: string): void;
  /** Re-send a base snapshot + clock to one session (after a seq gap). */
  resync(sessionId: string): void;
  /** Current broadcast sequence number. */
  readonly seq: number;
  /**
   * Route a command from a joined session to the single writer. Clock
   * commands from non-owners are refused (`not_owner`).
   */
  handleCommand(
    sessionId: string,
    message: ClientToHost,
  ): Promise<CommandOutcome>;
  handleQuery(sessionId: string, message: ClientToHost): Promise<QueryResult>;
  quit(): Promise<void>;
};

export function createSharedWorldHost(
  options: SharedWorldHostOptions,
): SharedWorldHost {
  const clients = createClientRegistry();
  const nowMs = options.nowMs ?? (() => Date.now());
  let seq = 0;

  const runtime = createHostRuntime({
    repository: options.repository,
    seed: options.seed,
    nowMs,
    autoFrame: options.autoFrame,
    mintEdge: options.mintEdge,
    preferPatches: true,
    initialScale: options.initialScale,
    emit(message) {
      seq += 1;
      clients.broadcast(message, { seq });
      options.onBroadcast?.(message);
    },
  });

  function sendBase(connection: ClientConnection): void {
    connection.emit(
      {
        message: "world.snapshot",
        body: buildWorldView(runtime.session.snapshot),
      },
      { seq, base: true },
    );
    connection.emit(
      {
        message: "world.clock",
        body: clockView(runtime.clock, runtime.session),
      },
      { seq, base: true },
    );
    // The world's offline catch-up (from this launch); clients show it once.
    if (runtime.lastCatchup != null) {
      connection.emit(
        { message: "world.catchup", body: runtime.lastCatchup },
        { seq, base: true },
      );
    }
  }

  let started = false;

  const host: SharedWorldHost = {
    runtime,
    clients,
    get seq() {
      return seq;
    },

    async start() {
      if (started) throw new Error("shared host already started");
      await runtime.start();
      started = true;
    },

    async join({
      accountId,
      emit,
      sessionId: requestedId,
      role = "player",
      displayName,
    }) {
      if (!started) {
        emit({
          message: "session.rejected",
          body: { reason: "host_not_ready" },
        });
        return null;
      }
      if (!isValidAccountId(accountId)) {
        emit({
          message: "session.rejected",
          body: { reason: "invalid_account" },
        });
        return null;
      }

      const sessionId = requestedId ?? allocateSessionId(nowMs());
      if (clients.get(sessionId) != null) {
        emit({
          message: "session.rejected",
          body: { reason: "already_joined" },
        });
        return null;
      }

      const connection: ClientConnection = {
        sessionId,
        accountId,
        emit,
        joinedAtMs: nowMs(),
        role,
        displayName: displayName ?? accountId,
      };
      clients.register(connection);

      emit(
        {
          message: "session.welcome",
          body: {
            sessionId,
            accountId,
            worldId: runtime.session.snapshot.world.id,
            tick: runtime.session.snapshot.world.lastTick,
            role,
            displayName: connection.displayName,
          },
        },
        { seq, base: true },
      );
      sendBase(connection);

      return connection;
    },

    leave(sessionId) {
      clients.unregister(sessionId);
    },

    resync(sessionId) {
      const client = clients.get(sessionId);
      if (client != null) sendBase(client);
    },

    async handleCommand(sessionId, message) {
      if (
        message.message === "session.join" ||
        message.message === "session.leave"
      ) {
        return { ok: true };
      }
      const client = clients.get(sessionId);
      if (client == null) {
        return { ok: false, code: "influence_rejected", detail: "not joined" };
      }
      if (message.message.startsWith("clock.") && client.role !== "owner") {
        return {
          ok: false,
          code: "not_owner",
          detail: "only the world owner can pause or change speed",
        };
      }
      const context: CommandContext = { accountId: client.accountId };
      return runtime.handleCommand(message, context);
    },

    async handleQuery(sessionId, message) {
      const client = clients.get(sessionId);
      if (client == null) throw new Error("session not joined");
      return runtime.handleQuery(message);
    },

    async quit() {
      clients.clear();
      await runtime.quit();
      started = false;
    },
  };

  return host;
}
