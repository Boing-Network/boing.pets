import { describe, expect, it } from "vitest";
import { decodeReferenceNftCalldata } from "@boing-network/boing-sdk";
import { dailyRate, evolutionStage, previewKibble, yardSpot } from "../src/tycoon";
import { mintPetTx, petTokenId, verifyMintTx } from "../src/nft";
import { DAY } from "../src/core";

describe("tycoon yard", () => {
  it("lets a fed buddy earn, and only sells snacks when the belly is full", () => {
    const fed = { hunger: 100, happiness: 100, status: "bouncy", buildings: [] as const, nftStaked: false, bonded: false };
    const stand = dailyRate({ ...fed, buildings: ["stand"] });
    const hungryStand = dailyRate({ ...fed, hunger: 0, status: "stray", buildings: ["stand"] });
    expect(stand).toBeGreaterThan(dailyRate(fed));
    expect(stand).toBeGreaterThan(hungryStand);
    const toy = dailyRate({ ...fed, buildings: ["toy"] });
    const glumToy = dailyRate({ ...fed, happiness: 0, buildings: ["toy"] });
    expect(toy).toBeGreaterThan(glumToy);
    const home = dailyRate({ ...fed, buildings: ["pen"] });
    const stray = dailyRate({ hunger: 0, happiness: 10, status: "stray", buildings: ["pen"], nftStaked: false, bonded: false });
    expect(home).toBeGreaterThan(stray);
  });
  it("grows a buddy from care, age, and practice", () => {
    expect(evolutionStage(0, 0, 0)).toBe("hatchling");
    expect(evolutionStage(DAY * 4, 3, 2)).toBe("grown");
    expect(evolutionStage(DAY * 10, 6, 4)).toBe("elder");
  });
  it("caps offline earnings at three days", () => {
    const preview = previewKibble({ stored: 5, settledAt: 0, now: 10 * DAY, ratePerDay: 48 });
    expect(preview.kibble).toBe(5 + 48 * 3);
  });
  it("gives every wallet a stable yard spot", () => {
    const owner = "0x" + "ab".repeat(32);
    expect(yardSpot(owner)).toEqual(yardSpot(owner));
  });
  it("builds a reference NFT mint the server can verify", () => {
    const owner = "0x" + "11".repeat(32);
    const contract = "0x" + "22".repeat(32);
    const tx = mintPetTx(owner, contract);
    const decoded = decodeReferenceNftCalldata(tx.calldata);
    expect(decoded?.selector).toBe(6);
    verifyMintTx(
      { sender: owner, payload: { ContractCall: { contract, calldata: tx.calldata } } },
      owner,
      contract,
      petTokenId(owner),
    );
  });
});