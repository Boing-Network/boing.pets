import { blake3 } from "@noble/hashes/blake3";
import { bytesToHex } from "@noble/hashes/utils";
import {
  buildReferenceNftCollectionDeployMetaTx,
  decodeReferenceNftCalldata,
  encodeReferenceMintBatchCalldataHex,
  predictNonceDerivedContractAddress,
  referenceNftOwnerStorageKey,
  referenceNftTokenIdWordFromU64,
} from "@boing-network/boing-sdk";
import { hex32 } from "./core";
import { BOND_AMOUNT } from "./tycoon";

export function petTokenId(owner: string) {
  const n = BigInt(`0x${hex32(owner).slice(2, 14)}`) % 2n ** 32n;
  return referenceNftTokenIdWordFromU64(n === 0n ? 1n : n);
}

export function petMetadataHash(owner: string) {
  return `0x${bytesToHex(blake3(new TextEncoder().encode(`boing.pets:nft:v1:${hex32(owner)}`)))}`;
}

export function predictedKennel(owner: string, nonce: bigint) {
  return predictNonceDerivedContractAddress(hex32(owner), nonce);
}

export function deployKennelTx() {
  return {
    ...buildReferenceNftCollectionDeployMetaTx({
      collectionName: "Boing Pets",
      collectionSymbol: "PET",
      purposeCategory: "nft",
    }),
    display: "Boing Pets: deploy the shared pet NFT kennel on testnet.",
  };
}

export function mintPetTx(owner: string, contract: string) {
  const tokenId = petTokenId(owner);
  const calldata = encodeReferenceMintBatchCalldataHex(owner, [tokenId], [petMetadataHash(owner)]);
  const accounts = [hex32(owner), hex32(contract)].sort();
  return {
    type: "contract_call" as const,
    contract: hex32(contract),
    calldata,
    access_list: { read: accounts, write: accounts },
    display: "Boing Pets: mint your pet NFT into your wallet.",
  };
}

export function bondTx(unbond = false) {
  return {
    type: unbond ? "unbond" : "bond",
    amount: BOND_AMOUNT,
    display: unbond
      ? "Boing Pets: unbond 0.01 testnet BOING from your pet stake."
      : "Boing Pets: bond 0.01 testnet BOING to stake with your pet NFT.",
  };
}

export function ownerStorageKey(tokenId: string) {
  return referenceNftOwnerStorageKey(tokenId);
}

function payload(tx: Record<string, unknown>) {
  const body = tx.payload;
  if (!body || typeof body !== "object") throw new Error("Transaction has no payload");
  return body as Record<string, unknown>;
}

function variant(tx: Record<string, unknown>, names: string[]) {
  const body = payload(tx);
  for (const name of names) if (body[name] && typeof body[name] === "object") return body[name] as Record<string, unknown>;
  return null;
}

export function verifyDeployTx(tx: Record<string, unknown>, owner: string, nonce: number, contract: string) {
  if (hex32(tx.sender) !== hex32(owner)) throw new Error("Deploy belongs to another wallet");
  if (Number(tx.nonce) !== nonce) throw new Error("Deploy nonce does not match this challenge");
  const deploy = variant(tx, [
    "ContractDeployWithPurposeAndMetadata",
    "ContractDeployWithPurpose",
    "contract_deploy_meta",
  ]);
  if (!deploy) throw new Error("Expected a Boing NFT collection deploy");
  if (hex32(predictedKennel(owner, BigInt(nonce))) !== hex32(contract))
    throw new Error("Kennel address does not match the deployer nonce");
}

export function verifyMintTx(tx: Record<string, unknown>, owner: string, contract: string, tokenId: string) {
  if (hex32(tx.sender) !== hex32(owner)) throw new Error("Mint belongs to another wallet");
  const call = variant(tx, ["ContractCall", "contract_call"]);
  if (!call || hex32(call.contract) !== hex32(contract)) throw new Error("Mint called a different contract");
  const decoded = decodeReferenceNftCalldata(String(call.calldata));
  if (!decoded || decoded.selector !== 6) throw new Error("Expected a reference NFT mint");
  if (hex32(decoded.to) !== hex32(owner) || !decoded.tokenIds.some((id) => hex32(id) === hex32(tokenId)))
    throw new Error("Mint was not for this wallet's pet NFT");
}

export function verifyBondTx(tx: Record<string, unknown>, owner: string, unbond = false) {
  if (hex32(tx.sender) !== hex32(owner)) throw new Error("Stake belongs to another wallet");
  const bond = variant(tx, unbond ? ["Unbond", "unbond"] : ["Bond", "bond"]);
  if (!bond || String(bond.amount) !== BOND_AMOUNT) throw new Error("Expected a 0.01 BOING bond");
}
