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
  type EmitMeta,
} from "./client-registry";
export {
  SESSION_TOKEN_TTL_MS,
  generateOwnerKey,
  loadOrCreateSecret,
  newGuestAccountId,
  ownerKeyMatches,
  sanitizeDisplayName,
  signSessionToken,
  verifySessionToken,
  type SessionClaims,
} from "./tokens";
export {
  createFloodGate,
  validateCommand,
  validateQuery,
  type FloodGate,
  type Validated,
} from "./validate";
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
