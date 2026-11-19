/**
 * Vite worker entry for the browser sim-host.
 * Lives outside `src/` so the client renderer package boundary stays intact:
 * the map UI imports only `@boing-pets/contract`, while this dedicated worker
 * owns HostRuntime + IndexedDB persistence.
 */
import "../sim-host/src/browser/host-worker";
