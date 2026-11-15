import { describe, expect, it } from "vitest";
import { pastureToastDismissMs } from "../src/ui/toastDismiss";

describe("Yard activity toasts", () => {
  it("dismisses a miss and keeps a retry toast up", () => {
    expect(pastureToastDismissMs()).toBe(4200);
    expect(
      pastureToastDismissMs(() => {
        /* retry stays until the player acts */
      }),
    ).toBeNull();
  });
});
