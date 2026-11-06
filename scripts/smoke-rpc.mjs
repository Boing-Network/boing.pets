const url = process.env.PETS_RPC_URL || "https://testnet-rpc.boing.network";
async function rpc(method, params = []) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(15000),
  });
  const j = await r.json();
  if (!r.ok || j.error) throw Error(`RPC ${method} failed`);
  return j.result;
}
const info = await rpc("boing_getNetworkInfo");
if (info.chain_id !== 6913) throw Error("Not testnet 6913");
const height = await rpc("boing_chainHeight");
const block = await rpc("boing_getBlockByHeight", [height, true, false]);
if (!block || block.header.height !== height)
  throw Error("Block read unavailable");
console.log("Testnet 6913 metadata and block/receipt reads: OK");
