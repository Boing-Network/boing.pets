import { describe, expect, it } from "vitest";
import { decodeReferenceNftCalldata } from "@boing-network/boing-sdk";
import { dailyRate, previewKibble, yardSpot } from "../src/tycoon";
import { mintPetTx, petTokenId, verifyMintTx } from "../src/nft";
import { DAY } from "../src/core";

describe("tycoon yard", () => {
  it("pays more when an NFT is staked and a pen is open", () => {
    const plain = dailyRate({ status: "bouncy", buildings: [], nftStaked: false, bonded: false });
    const staked = dailyRate({ status: "bouncy", buildings: ["pen"], nftStaked: true, bonded: true });
    expect(staked).toBeGreaterThan(plain * 2);
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