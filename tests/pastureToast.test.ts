import { afterEach, describe, expect, it, vi } from "vitest";
import { notice, pastureToastDismissMs } from "../src/ui/appRuntime";

function installYardDom() {
  const host = {
    append(node: { parentElement: unknown }) {
      node.parentElement = host;
    },
  };
  const canvas = { id: "pasture-canvas" };
  let toast: {
    hidden: boolean;
    className: string;
    classList: { toggle: (name: string, on: boolean) => void };
    parentElement: unknown;
    setAttribute: () => void;
    replaceChildren: () => void;
    append: () => void;
    text: string;
  } | null = null;
  const created: (typeof toast)[] = [];
  const documentStub = {
    querySelector(selector: string) {
      if (selector === "#pasture-canvas") return canvas;
      if (selector === ".pasture-3d-stage") return host;
      if (selector === ".pasture-tx-toast") return toast;
      if (selector === "#notice") return null;
      return null;
    },
    createElement(tag: string) {
      const node = {
        hidden: false,
        className: "",
        classList: { toggle() {} },
        parentElement: null as unknown,
        setAttribute() {},
        replaceChildren() {},
        append() {},
        textContent: "",
      };
      created.push(node);
      if (tag === "div") toast = node;
      return node;
    },
  };
  vi.stubGlobal("document", documentStub);
  return {
    get toast() {
      return toast;
    },
  };
}

describe("Yard activity toasts", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps a retry toast up and dismisses a miss after a few seconds", () => {
    expect(pastureToastDismissMs()).toBe(4200);
    expect(pastureToastDismissMs(() => undefined)).toBeNull();
    vi.useFakeTimers();
    const dom = installYardDom();
    notice(
      "Missed it — no signature needed. Try again if you have attempts left.",
      true,
    );
    expect(dom.toast?.hidden).toBe(false);
    vi.advanceTimersByTime(4199);
    expect(dom.toast?.hidden).toBe(false);
    vi.advanceTimersByTime(1);
    expect(dom.toast?.hidden).toBe(true);
  });
});
