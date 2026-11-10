import { describe, expect, it } from "vitest";
import {
  isChatWalletRequiredMessage,
  planPlazaBind,
  shouldPromoteForChat,
  shouldSilentRejoin,
} from "../src/world/lib/plazaChatAuth";

describe("plaza chat auth policy", () => {
  it("recognizes the server guest-chat error", () => {
    expect(
      isChatWalletRequiredMessage("Chat requires a signed-in wallet"),
    ).toBe(true);
    expect(
      isChatWalletRequiredMessage("Chat is cooling down. Please wait."),
    ).toBe(false);
  });

  it("prefers a cached token, then a social session, then a prompted sign", () => {
    const base = {
      hasAccounts: true,
      hasPresenceToken: false,
      hasSocialSession: false,
      allowPrompt: false,
      allowSocialSession: true,
    };
    expect(planPlazaBind({ ...base, hasPresenceToken: true })).toBe("token");
    expect(planPlazaBind({ ...base, hasSocialSession: true })).toBe("session");
    expect(planPlazaBind({ ...base, allowPrompt: true })).toBe("prompt");
    expect(planPlazaBind(base)).toBe("guest-with-wallet");
    expect(planPlazaBind({ ...base, hasAccounts: false })).toBe("guest");
  });

  it("rejoins once after wallet hydrate and promotes chat when the wallet is already signed in", () => {
    expect(
      shouldSilentRejoin({
        walletBound: false,
        status: "live",
        owner: "0x" + "ab".repeat(32),
        alreadyAttempted: false,
      }),
    ).toBe(true);
    expect(
      shouldSilentRejoin({
        walletBound: false,
        status: "live",
        owner: "0x" + "ab".repeat(32),
        alreadyAttempted: true,
      }),
    ).toBe(false);
    expect(
      shouldPromoteForChat({
        walletBound: false,
        owner: "0x" + "ab".repeat(32),
      }),
    ).toBe(true);
    expect(shouldPromoteForChat({ walletBound: true, owner: "0xabc" })).toBe(
      false,
    );
    expect(shouldPromoteForChat({ walletBound: false, owner: null })).toBe(
      false,
    );
  });
});
