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
} from "@boing-pets/contract";
import type { MintEdge } from "../boing";
import { clockView } from "../clock";
import type { WorldRepository } from "../persist/repository";
import {
  createHostRuntime,
  type CommandContext,
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
  }): Promise<ClientConnection | null>;
  leave(sessionId: string): void;
  /** Route a command from a joined session to the single writer. */
  handleCommand(sessionId: string, message: ClientToHost): Promise<void>;
  handleQuery(sessionId: string, message: ClientToHost): Promise<QueryResult>;
  quit(): Promise<void>;
};

export function createSharedWorldHost(
  options: SharedWorldHostOptions,
): SharedWorldHost {
  const clients = createClientRegistry();
  const nowMs = options.nowMs ?? (() => Date.now());

  const runtime = createHostRuntime({
    repository: options.repository,
    seed: options.seed,
    nowMs,
    autoFrame: options.autoFrame,
    mintEdge: options.mintEdge,
    preferPatches: true,
    emit(message) {
      clients.broadcast(message);
      options.onBroadcast?.(message);
    },
  });

  let started = false;

  const host: SharedWorldHost = {
    runtime,
    clients,

    async start() {
      if (started) throw new Error("shared host already started");
      await runtime.start();
      started = true;
    },

    async join({ accountId, emit, sessionId: requestedId }) {
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
      };
      clients.register(connection);

      emit({
        message: "session.welcome",
        body: {
          sessionId,
          accountId,
          worldId: runtime.session.snapshot.world.id,
          tick: runtime.session.snapshot.world.lastTick,
        },
      });
      emit({
        message: "world.snapshot",
        body: buildWorldView(runtime.session.snapshot),
      });
      emit({
        message: "world.clock",
        body: clockView(runtime.clock, runtime.session),
      });

      return connection;
    },

    leave(sessionId) {
      clients.unregister(sessionId);
    },

    async handleCommand(sessionId, message) {
      if (
        message.message === "session.join" ||
        message.message === "session.leave"
      ) {
        return;
      }
      const client = clients.get(sessionId);
      if (client == null) return;
      const context: CommandContext = { accountId: client.accountId };
      await runtime.handleCommand(message, context);
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
