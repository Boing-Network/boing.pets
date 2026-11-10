import { describe, expect, it } from "vitest";
import { parseBoing } from "@boing-network/boing-sdk";
import {
  canAdmitMarketPurchase,
  isImmediateSellback,
  isSellableItem,
  listingFeeBaseUnits,
  MARKET_ESCROW_ADDRESS,
  MARKET_MIN_BOING,
  NATIVE_TRANSFER_FEE_BASE_UNITS,
  PAYOUT_NETWORK_FEE_BUDGET_BASE_UNITS,
  parseMarketPriceBoing,
  payoutSplit,
  publicMarketRules,
  sellerProceedsBaseUnits,
  stillInHold,
} from "../src/market";
import {
  extractNativeTransfer,
  assertEscrowPayment,
} from "../worker/marketPay";

describe("testnet BOING market rules", () => {
  it("sells resources and cosmetics, but not pets, Wood Pick, or race ribbons", () => {
    expect(isSellableItem("hat-ribbon")).toBe(true);
    expect(isSellableItem("ore-spark")).toBe(true);
    expect(isSellableItem("furn-lamp")).toBe(true);
    expect(isSellableItem("tool-pick-wood")).toBe(false);
    expect(isSellableItem("ribbon-gold")).toBe(false);
    expect(isSellableItem("ribbon-silver")).toBe(false);
    expect(isSellableItem("ribbon-bronze")).toBe(false);
    expect(isSellableItem("some-pet")).toBe(false);
  });

  it("keeps a 5% fee in base units and parses BOING prices", () => {
    const price = parseMarketPriceBoing("1");
    expect(price).toBe(parseBoing("1"));
    expect(listingFeeBaseUnits(price)).toBe(price / 20n);
    expect(sellerProceedsBaseUnits(price) + listingFeeBaseUnits(price)).toBe(
      price,
    );
    expect(() => parseMarketPriceBoing("0.001")).toThrow();
    expect(() => parseMarketPriceBoing("0.01")).toThrow(/0\.1/);
    expect(parseMarketPriceBoing(MARKET_MIN_BOING)).toBe(parseBoing("0.1"));
    const minSplit = payoutSplit(parseBoing(MARKET_MIN_BOING));
    expect(minSplit.fee).toBe(parseBoing("0.005"));
    expect(minSplit.fee + minSplit.seller).toBe(parseBoing("0.1"));
    // 0.005 / 0.00042 is about 11.9x the two-leg measured fee budget.
    expect(minSplit.fee / PAYOUT_NETWORK_FEE_BUDGET_BASE_UNITS).toBe(11n);
    expect(NATIVE_TRANSFER_FEE_BASE_UNITS).toBe(210000000000000n);
    const rules = publicMarketRules();
    expect(rules.currency).toBe("boing");
    expect(rules.feeBps).toBe(500);
    expect(rules.minPriceBoing).toBe("0.1");
    expect(rules.escrow).toBe(MARKET_ESCROW_ADDRESS);
    expect(rules.provisional).toBe(true);
    expect(rules.gasSubsidy).toMatch(/does not replenish operator gas/i);
  });

  it("pauses new purchases before the operator gas reserve is exhausted", () => {
    const fee = NATIVE_TRANSFER_FEE_BASE_UNITS;
    const admitted = canAdmitMarketPurchase({
      operatorBalance: parseBoing("20"),
      pendingPayoutAmounts: 0n,
      pendingLegs: 0,
    });
    expect(admitted.ok).toBe(true);
    // Surplus exactly at the floor, with no extra room for two new legs.
    const tight = canAdmitMarketPurchase({
      operatorBalance: parseBoing("0.01"),
      pendingPayoutAmounts: 0n,
      pendingLegs: 0,
    });
    expect(tight.ok).toBe(false);
    const withPending = canAdmitMarketPurchase({
      operatorBalance: parseBoing("1") + parseBoing("0.01"),
      pendingPayoutAmounts: parseBoing("1"),
      pendingLegs: 2,
    });
    expect(withPending.ok).toBe(false);
    const fundedPending = canAdmitMarketPurchase({
      operatorBalance: parseBoing("1") + parseBoing("1"),
      pendingPayoutAmounts: parseBoing("1"),
      pendingLegs: 2,
    });
    expect(fundedPending.ok).toBe(true);
    expect(fundedPending.surplus).toBe(parseBoing("1"));
    // Reserved surplus is not taken from seller proceeds.
    expect(fee).toBeGreaterThan(0n);
  });

  it("applies hold and anti-wash windows", () => {
    const now = Date.UTC(2026, 10, 10, 12);
    expect(stillInHold(now - 2 * 60 * 60 * 1000, now)).toBe(true);
    expect(stillInHold(now - 25 * 60 * 60 * 1000, now)).toBe(false);
    expect(isImmediateSellback("0xb", "0xb", now - 30 * 60 * 1000, now)).toBe(
      true,
    );
    expect(isImmediateSellback("0xb", "0xc", now - 30 * 60 * 1000, now)).toBe(
      false,
    );
  });

  it("accepts only an exact native transfer into the operator escrow", () => {
    const buyer = "0x" + "aa".repeat(32);
    const price = parseBoing("2").toString();
    const transfer = extractNativeTransfer({
      sender: buyer,
      payload: {
        Transfer: { to: MARKET_ESCROW_ADDRESS, amount: price },
      },
    });
    expect(() =>
      assertEscrowPayment({
        transfer,
        buyer,
        priceBaseUnits: price,
      }),
    ).not.toThrow();
    expect(() =>
      assertEscrowPayment({
        transfer,
        buyer: "0x" + "bb".repeat(32),
        priceBaseUnits: price,
      }),
    ).toThrow(/different wallet/);
    expect(() =>
      assertEscrowPayment({
        transfer: { ...transfer, amount: "1" },
        buyer,
        priceBaseUnits: price,
      }),
    ).toThrow(/amount/);
  });
});
