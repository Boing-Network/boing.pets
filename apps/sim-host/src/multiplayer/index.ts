/**
 * Multiplayer host seam (M22).
 * Networking and accounts live here — never inside packages/sim.
 */
export {
  isValidAccountId,
  LOCAL_ACCOUNT_ID,
  resolveAccountId,
} from "./account";
export {
  allocateSessionId,
  createClientRegistry,
  type ClientConnection,
  type ClientEmit,
  type ClientRegistry,
} from "./client-registry";
export {
  canAcceptForAccount,
  createInfluenceGateBook,
  gateForAccount,
  hydrateInfluenceBook,
  localAcceptedAtMs,
  serializeInfluenceBook,
  type InfluenceGateBook,
} from "./influence-book";
export {
  createSharedWorldHost,
  type SharedWorldHost,
  type SharedWorldHostOptions,
} from "./shared-world-host";
export {
  encodeWsServerMessage,
  parseWsClientMessage,
  type WsClientToServer,
  type WsServerToClient,
} from "./ws-protocol";
export {
  listenSharedWorldWs,
  type SharedWorldWsServer,
  type SharedWorldWsServerOptions,
} from "./ws-server";
