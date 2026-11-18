import type { IpcClient } from "./ipc";
import { useWorldViewStore } from "../state/worldViewStore";
import { useUiStore } from "../state/uiStore";

/** Wire host pushes into Zustand. Call once at boot, before the first snapshot. */
export function bindIpcToStores(ipc: IpcClient): () => void {
  return ipc.onHostMessage((message) => {
    useWorldViewStore.getState().applyHostMessage(message);
    if (message.message === "world.clock") {
      useUiStore.getState().setPaused(message.body.paused);
      useUiStore.getState().setScale(message.body.scale);
    }
  });
}
