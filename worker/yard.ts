import * as ed from "@noble/ed25519";
import { blake3 } from "@noble/hashes/blake3";
import { hexToBytes } from "@noble/hashes/utils";
import { DAY, dayOf, hex32, state, traits, type Pet } from "../src/core";
import {
  bondTx,
  deployKennelTx,
  mintPetTx,
  ownerStorageKey,
  petMetadataHash,
  petTokenId,
  predictedKennel,
  verifyBondTx,
  verifyDeployTx,
  verifyMintTx,
} from "../src/nft";
import {
  BOND_AMOUNT,
  BUILDINGS,
  FIELD_RADIUS,
  buildingOf,
  dailyRate,
  evolutionStage,
  isYardAction,
  online,
  previewKibble,
  yardSpot,
  type Building,
  type Skill,
  type YardAction,
} from "../src/tycoon";
import { includedTx, type Receipt, type RpcBlock } from "./proof";

export class YardError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

type Detail = { contract?: string; tokenId?: string; nonce?: number; kind?: Building; skill?: Skill };

async function rpc<T>(env: Env, method: string, params: unknown[] = []): Promise<T> {
  try {
    const response = await fetch(env.RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error("HTTP error");
    const body = (await response.json()) as { result: T; error?: unknown };
    if (body.error || body.result === undefined) throw new Error("RPC rejected request");
    return body.result;
  } catch (error) {
    if (error instanceof YardError) throw error;
    throw new YardError(503, "Testnet RPC is unavailable. No pet state was changed; retry later.");
  }
}

const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "cache-control": "no-store" } });

async function kennel(env: Env) {
  return env.DB.prepare("SELECT contract,deployer,created_at FROM kennel WHERE id=1").first<{
    contract: string;
    deployer: string;
    created_at: number;
  }>();
}

async function buildings(env: Env, owner: string) {
  const rows = await env.DB.prepare("SELECT kind FROM stalls WHERE owner=?").bind(owner).all<{ kind: Building }>();
  return rows.results.map((row) => row.kind);
}

async function skillBook(env: Env, owner: string, now: number) {
  const rows = await env.DB.prepare("SELECT skill,points,last_day FROM skills WHERE owner=?").bind(owner).all<{
    skill: Skill;
    points: number;
    last_day: number;
  }>();
  const book = { forage: 0, greet: 0, play: 0 };
  const practiced: Skill[] = [];
  let sum = 0;
  for (const row of rows.results) {
    book[row.skill] = row.points;
    sum += row.points;
    if (row.last_day === dayOf(now)) practiced.push(row.skill);
  }
  return { book, sum, practiced };
}

async function rateFor(
  env: Env,
  owner: string,
  petState: { hunger: number; happiness: number; status: string },
  now: number,
) {
  const nft = await env.DB.prepare("SELECT staked FROM pet_nfts WHERE owner=?").bind(owner).first<{ staked: number }>();
  const yard = await env.DB.prepare("SELECT bonded FROM yards WHERE owner=?").bind(owner).first<{ bonded: number }>();
  const skills = await skillBook(env, owner, now);
  return dailyRate({
    hunger: petState.hunger,
    happiness: petState.happiness,
    status: petState.status,
    buildings: await buildings(env, owner),
    nftStaked: nft?.staked === 1,
    bonded: yard?.bonded === 1,
    ...skills.book,
  });
}

export async function yardState(env: Env, viewer: string | null, now: number) {
  const pets = await env.DB.prepare("SELECT * FROM pets ORDER BY created_at DESC LIMIT 24").all<Pet>();
  const seen = await env.DB.prepare("SELECT owner,seen_at,x,z FROM presence").all<{
    owner: string;
    seen_at: number;
    x: number | null;
    z: number | null;
  }>();
  const here = new Map(seen.results.map((row) => [row.owner, row]));
  const collection = await kennel(env);
  const roster = await Promise.all(
    pets.results.map(async (pet) => {
      const events = await env.DB.prepare("SELECT action,created_at FROM events WHERE owner=? ORDER BY created_at")
        .bind(pet.owner)
        .all<{ action: "hatch" | "feed" | "checkin"; created_at: number }>();
      const petState = state(pet, events.results, now);
      const nft = await env.DB.prepare("SELECT staked,token_id,contract FROM pet_nfts WHERE owner=?")
        .bind(pet.owner)
        .first<{ staked: number; token_id: string; contract: string }>();
      const skills = await skillBook(env, pet.owner, now);
      const place = here.get(pet.owner);
      return {
        owner: pet.owner,
        hatch_tx: pet.hatch_tx,
        traits: traits(pet.owner, pet.hatch_tx),
        state: petState,
        stage: evolutionStage(now - pet.created_at, events.results.length, skills.sum),
        wandered: place?.x !== null && place?.x !== undefined && place.z !== null && place.z !== undefined,
        spot:
          place?.x !== null && place?.x !== undefined && place.z !== null && place.z !== undefined
            ? { x: place.x, z: place.z }
            : yardSpot(pet.owner),
        online: online(place?.seen_at ?? null, now),
        nft: nft ? { tokenId: nft.token_id, contract: nft.contract, staked: nft.staked === 1 } : null,
        buildings: await buildings(env, pet.owner),
      };
    }),
  );
  let me = null;
  if (viewer) {
    const mine = roster.find((pet) => pet.owner === viewer);
    const row = await env.DB.prepare("SELECT kibble,settled_at,bonded FROM yards WHERE owner=?").bind(viewer).first<{
      kibble: number;
      settled_at: number;
      bonded: number;
    }>();
    const pet = await env.DB.prepare("SELECT created_at FROM pets WHERE owner=?").bind(viewer).first<{ created_at: number }>();
    if (pet && mine) {
      const preview = previewKibble({
        stored: row?.kibble ?? 0,
        settledAt: row?.settled_at ?? pet.created_at,
        now,
        ratePerDay: await rateFor(env, viewer, mine.state, now),
      });
      const skills = await skillBook(env, viewer, now);
      me = {
        kibble: preview.kibble,
        rate: await rateFor(env, viewer, mine.state, now),
        stage: mine.stage,
        skills: skills.book,
        practiced: skills.practiced,
        minted: Boolean(mine.nft),
        staked: mine.nft?.staked === true,
        bonded: row?.bonded === 1,
        buildings: mine.buildings,
      };
    }
  }
  return json({ now, collection: collection?.contract ?? null, me, pets: roster });
}

async function issue(env: Env, owner: string, action: YardAction, now: number) {
  const pet = await env.DB.prepare("SELECT * FROM pets WHERE owner=?").bind(owner).first<Pet>();
  if (!pet) throw new YardError(409, "Hatch your buddy before opening the yard");
  const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM yard_challenges WHERE owner=? AND created_at>?")
    .bind(owner, now - 60_000)
    .first<{ n: number }>();
  if ((recent?.n || 0) >= 6) throw new YardError(429, "Too many requests. Try again in a minute.");
  const home = await kennel(env);
  const events = await env.DB.prepare("SELECT action,created_at FROM events WHERE owner=? ORDER BY created_at")
    .bind(owner)
    .all<{ action: "hatch" | "feed" | "checkin"; created_at: number }>();
  const petState = state(pet, events.results, now);
  let height = 0;
  let detail: Detail = {};
  let transaction: Record<string, unknown> | null = null;
  const chain = action === "deploy_nft" || action === "mint_nft" || action === "bond" || action === "unbond";
  if (chain) {
    const info = await rpc<{ chain_id: number }>(env, "boing_getNetworkInfo");
    if (info.chain_id !== 6913) throw new YardError(503, "Pets only supports Boing testnet 6913");
    height = await rpc<number>(env, "boing_chainHeight");
  }
  if (action === "deploy_nft") {
    if (home) throw new YardError(409, "The pet NFT kennel is already open");
    const account = await rpc<{ nonce: number }>(env, "boing_getAccount", [owner]);
    detail = { nonce: account.nonce, contract: predictedKennel(owner, BigInt(account.nonce)) };
    transaction = deployKennelTx();
  }
  if (action === "mint_nft") {
    if (!home) throw new YardError(409, "The kennel NFT collection has not been deployed yet");
    const existing = await env.DB.prepare("SELECT owner FROM pet_nfts WHERE owner=?").bind(owner).first();
    if (existing) throw new YardError(409, "Your pet NFT is already minted");
    detail = { contract: home.contract, tokenId: petTokenId(owner) };
    transaction = mintPetTx(owner, home.contract);
  }
  if (action === "bond" || action === "unbond") {
    const minted = await env.DB.prepare("SELECT owner FROM pet_nfts WHERE owner=?").bind(owner).first();
    if (!minted) throw new YardError(409, "Mint your pet NFT before bonding BOING");
    transaction = bondTx(action === "unbond");
  }
  if (action === "stake_nft" || action === "unstake_nft") {
    const minted = await env.DB.prepare("SELECT token_id,contract,staked FROM pet_nfts WHERE owner=?")
      .bind(owner)
      .first<{ token_id: string; contract: string; staked: number }>();
    if (!minted) throw new YardError(409, "Mint your pet NFT before staking it");
    if (action === "stake_nft" && minted.staked === 1) throw new YardError(409, "Your pet NFT is already staked");
    if (action === "unstake_nft" && minted.staked !== 1) throw new YardError(409, "Your pet NFT is not staked");
    await assertNftOwner(env, minted.contract, minted.token_id, owner);
    detail = { contract: minted.contract, tokenId: minted.token_id };
  }
  const skill = action.startsWith("train_") ? (action.slice("train_".length) as Skill) : null;
  if (skill) {
    const known = await env.DB.prepare("SELECT last_day FROM skills WHERE owner=? AND skill=?").bind(owner, skill).first<{
      last_day: number;
    }>();
    if (known?.last_day === dayOf(now)) throw new YardError(409, "Already practiced today. Come back after midnight UTC.");
    detail = { skill };
  }
  const kind = buildingOf(action);
  if (kind) {
    const owned = await env.DB.prepare("SELECT kind FROM stalls WHERE owner=? AND kind=?").bind(owner, kind).first();
    if (owned) throw new YardError(409, `${BUILDINGS[kind].label} is already built`);
    detail = { kind };
  }
  const id = crypto.randomUUID();
  const expires = now + 60 * 60_000;
  const message = `Boing Pets v1\nOrigin: ${env.APP_ORIGIN}\nChain: 6913\nAction: ${action}\nOwner: ${owner}\nNonce: ${id}\nExpires: ${expires}`;
  await env.DB.prepare(
    "INSERT INTO yard_challenges(id,owner,action,message,amount,created_at,expires_at,min_height,detail) VALUES(?,?,?,?,?,?,?,?,?)",
  )
    .bind(id, owner, action, message, BOND_AMOUNT, now, expires, height, JSON.stringify(detail))
    .run();
  return json({
    id,
    owner,
    action,
    message,
    amount: BOND_AMOUNT,
    expires_at: expires,
    transaction,
    detail,
    metadata: action === "mint_nft" ? petMetadataHash(owner) : null,
    status: petState.status,
  });
}

async function assertNftOwner(env: Env, contract: string, tokenId: string, owner: string) {
  const stored = await rpc<{ value: string }>(env, "boing_getContractStorage", [contract, ownerStorageKey(tokenId)]);
  if (hex32(stored.value) !== hex32(owner)) throw new YardError(409, "Your wallet no longer holds this pet NFT");
}

async function settle(env: Env, owner: string, now: number) {
  const pet = await env.DB.prepare("SELECT * FROM pets WHERE owner=?").bind(owner).first<Pet>();
  if (!pet) throw new YardError(409, "Hatch your buddy first");
  const events = await env.DB.prepare("SELECT action,created_at FROM events WHERE owner=? ORDER BY created_at")
    .bind(owner)
    .all<{ action: "hatch" | "feed" | "checkin"; created_at: number }>();
  const petState = state(pet, events.results, now);
  const row = await env.DB.prepare("SELECT kibble,settled_at,bonded FROM yards WHERE owner=?").bind(owner).first<{
    kibble: number;
    settled_at: number;
    bonded: number;
  }>();
  const preview = previewKibble({
    stored: row?.kibble ?? 0,
    settledAt: row?.settled_at ?? pet.created_at,
    now,
    ratePerDay: await rateFor(env, owner, petState, now),
  });
  if (row) {
    await env.DB.prepare("UPDATE yards SET kibble=?,settled_at=? WHERE owner=?").bind(preview.kibble, now, owner).run();
  } else {
    await env.DB.prepare("INSERT INTO yards(owner,kibble,settled_at,bonded) VALUES(?,?,?,0)")
      .bind(owner, preview.kibble, now)
      .run();
  }
  return preview.kibble;
}

export async function confirmYard(env: Env, body: Record<string, unknown>, now: number) {
  if (typeof body.id !== "string") return null;
  const row = await env.DB.prepare("SELECT * FROM yard_challenges WHERE id=?").bind(body.id).first<{
    id: string;
    owner: string;
    action: YardAction;
    message: string;
    amount: string;
    expires_at: number;
    min_height: number;
    detail: string;
  }>();
  if (!row) return null;
  if (row.expires_at < now) throw new YardError(410, "Challenge expired. Start a new yard action.");
  const done = await env.DB.prepare("SELECT id FROM yard_events WHERE id=?").bind(row.id).first();
  if (done) return json({ ok: true, alreadyConfirmed: true });
  const detail = JSON.parse(row.detail) as Detail;
  const signed = ["stake_nft", "unstake_nft", "collect", "buy_pen", "buy_stand", "buy_toy", "train_forage", "train_greet", "train_play", "wander"].includes(
    row.action,
  );
  let hash: string | null = null;
  if (signed) {
    if (typeof body.signature !== "string" || !/^(0x)?[0-9a-f]{128}$/i.test(body.signature))
      throw new YardError(400, "Invalid signature format");
    const ok = await ed.verifyAsync(
      hexToBytes(body.signature.replace(/^0x/i, "")),
      blake3(new TextEncoder().encode(row.message)),
      hexToBytes(row.owner.slice(2)),
    );
    if (!ok) throw new YardError(403, "Signature does not match this wallet and challenge");
  } else {
    hash = hex32(body.tx_hash);
    const info = await rpc<{ chain_id: number }>(env, "boing_getNetworkInfo");
    if (info.chain_id !== 6913) throw new YardError(503, "Pets only supports Boing testnet 6913");
    const receipt = await rpc<Receipt | null>(env, "boing_getTransactionReceipt", [hash]);
    const block = receipt
      ? await rpc<RpcBlock | null>(env, "boing_getBlockByHeight", [receipt.block_height, true, false])
      : null;
    let tx: Record<string, unknown>;
    try {
      tx = includedTx(hash, { owner: row.owner, amount: row.amount, min_height: row.min_height }, receipt, block);
    } catch (error) {
      throw new YardError(receipt ? 400 : 425, error instanceof Error ? error.message : "Invalid transaction");
    }
    if (row.action === "deploy_nft") verifyDeployTx(tx, row.owner, detail.nonce ?? -1, detail.contract ?? "");
    if (row.action === "mint_nft") verifyMintTx(tx, row.owner, detail.contract ?? "", detail.tokenId ?? "");
    if (row.action === "bond" || row.action === "unbond") verifyBondTx(tx, row.owner, row.action === "unbond");
  }
  const statements = [
    env.DB.prepare("INSERT INTO yard_events(id,owner,action,tx_hash,created_at,day) VALUES(?,?,?,?,?,?)").bind(
      row.id,
      row.owner,
      row.action,
      hash,
      now,
      dayOf(now),
    ),
  ];
  if (row.action === "deploy_nft") {
    statements.push(
      env.DB.prepare("INSERT INTO kennel(id,contract,deployer,created_at) VALUES(1,?,?,?)").bind(
        detail.contract,
        row.owner,
        now,
      ),
    );
  }
  if (row.action === "mint_nft") {
    const stored = await rpc<{ value: string }>(env, "boing_getContractStorage", [
      detail.contract,
      ownerStorageKey(detail.tokenId ?? ""),
    ]);
    if (hex32(stored.value) !== row.owner) throw new YardError(409, "Mint did not give this wallet the pet NFT");
    statements.push(
      env.DB.prepare("INSERT INTO pet_nfts(owner,token_id,contract,mint_tx,staked) VALUES(?,?,?,?,0)").bind(
        row.owner,
        detail.tokenId,
        detail.contract,
        hash,
      ),
    );
  }
  if (row.action === "stake_nft" || row.action === "unstake_nft") {
    await assertNftOwner(env, detail.contract ?? "", detail.tokenId ?? "", row.owner);
    statements.push(
      env.DB.prepare("UPDATE pet_nfts SET staked=? WHERE owner=?").bind(row.action === "stake_nft" ? 1 : 0, row.owner),
    );
  }
  if (row.action === "bond" || row.action === "unbond") {
    const existing = await env.DB.prepare("SELECT owner FROM yards WHERE owner=?").bind(row.owner).first();
    if (!existing) {
      statements.push(
        env.DB.prepare("INSERT INTO yards(owner,kibble,settled_at,bonded) VALUES(?,?,?,?)").bind(
          row.owner,
          0,
          now,
          row.action === "bond" ? 1 : 0,
        ),
      );
    } else {
      statements.push(
        env.DB.prepare("UPDATE yards SET bonded=? WHERE owner=?").bind(row.action === "bond" ? 1 : 0, row.owner),
      );
    }
  }
  const kind = buildingOf(row.action);
  if (kind) {
    const balance = await settle(env, row.owner, now);
    if (balance < BUILDINGS[kind].cost) throw new YardError(409, `Need ${BUILDINGS[kind].cost} kibble for ${BUILDINGS[kind].label}`);
    statements.push(
      env.DB.prepare("UPDATE yards SET kibble=kibble-? WHERE owner=?").bind(BUILDINGS[kind].cost, row.owner),
      env.DB.prepare("INSERT INTO stalls(owner,kind,created_at) VALUES(?,?,?)").bind(row.owner, kind, now),
    );
  }
  if (row.action === "collect") await settle(env, row.owner, now);
  if (detail.skill) {
    statements.push(
      env.DB.prepare(
        "INSERT INTO skills(owner,skill,points,last_day) VALUES(?,?,1,?) ON CONFLICT(owner,skill) DO UPDATE SET points=skills.points+1,last_day=excluded.last_day",
      ).bind(row.owner, detail.skill, dayOf(now)),
    );
  }
  if (row.action === "wander") {
    statements.push(
      env.DB.prepare(
        "INSERT INTO presence(owner,seen_at,pass,pass_until) VALUES(?,?,?,?) ON CONFLICT(owner) DO UPDATE SET seen_at=excluded.seen_at,pass=excluded.pass,pass_until=excluded.pass_until",
      ).bind(row.owner, now, row.id, now + DAY),
    );
  }
  try {
    await env.DB.batch(statements);
  } catch {
    throw new YardError(409, "That yard action was already recorded");
  }
  return json({ ok: true, pass: row.action === "wander" ? row.id : undefined });
}

export async function yardPost(env: Env, body: Record<string, unknown>, path: string, now: number) {
  if (path === "/api/presence") {
    const owner = hex32(body.owner);
    const pet = await env.DB.prepare("SELECT owner FROM pets WHERE owner=?").bind(owner).first();
    if (!pet) throw new YardError(404, "No buddy for that wallet");
    const x = Number(body.x);
    const z = Number(body.z);
    const moving = Number.isFinite(x) && Number.isFinite(z);
    if (moving) {
      if (Math.hypot(x, z) > FIELD_RADIUS) throw new YardError(400, "That spot is outside the pasture");
      const pass = await env.DB.prepare("SELECT pass,pass_until FROM presence WHERE owner=?").bind(owner).first<{
        pass: string | null;
        pass_until: number | null;
      }>();
      if (!pass?.pass || pass.pass !== body.pass || (pass.pass_until ?? 0) < now)
        throw new YardError(403, "Sign a short wander pass before walking the pasture");
      await env.DB.prepare(
        "UPDATE presence SET seen_at=?,x=?,z=? WHERE owner=?",
      )
        .bind(now, x, z, owner)
        .run();
    } else {
      await env.DB.prepare(
        "INSERT INTO presence(owner,seen_at) VALUES(?,?) ON CONFLICT(owner) DO UPDATE SET seen_at=excluded.seen_at",
      )
        .bind(owner, now)
        .run();
    }
    return json({ ok: true, now });
  }
  if (path !== "/api/challenge") return null;
  const action = String(body.action);
  if (!isYardAction(action)) return null;
  return issue(env, hex32(body.owner), action, now);
}
