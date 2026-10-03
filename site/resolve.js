// Resolve a pasted contract address that is NOT in the verified universe to a CoinGecko id.
// Solana addresses go straight to CoinGecko. EVM addresses are probed across chains in a single
// DefiLlama call first (it answers for whichever chains hold the address), then CoinGecko is
// asked for that chain's token. All keyless, all from the visitor's browser.
import { SourceError } from "./coingecko.js";

// DefiLlama coins chain key → CoinGecko platform id
const EVM_CHAINS = {
  ethereum: "ethereum", bsc: "binance-smart-chain", base: "base", arbitrum: "arbitrum-one",
  polygon: "polygon-pos", optimism: "optimistic-ethereum", avax: "avalanche",
};

async function json(url) {
  let res;
  try { res = await fetch(url, { headers: { accept: "application/json" } }); }
  catch { throw new SourceError("The lookup service could not be reached. Check your connection and try again."); }
  if (res.status === 404) return null;
  if (res.status === 429) throw new SourceError("CoinGecko is rate-limiting requests right now. Wait a minute and try again.", 429);
  if (!res.ok) throw new SourceError(`The lookup failed (HTTP ${res.status}).`, res.status);
  return res.json();
}

const cgContract = (platform, address) =>
  json(`https://api.coingecko.com/api/v3/coins/${platform}/contract/${encodeURIComponent(address)}`).then((c) => c?.id || null);

export async function resolveAddress(address, kind) {
  if (kind === "solana") return cgContract("solana", address);
  const keys = Object.keys(EVM_CHAINS).map((k) => `${k}:${address.toLowerCase()}`).join(",");
  const probe = await json(`https://coins.llama.fi/prices/current/${keys}`);
  const found = Object.keys(probe?.coins || {}).map((k) => k.split(":")[0]);
  for (const chain of found) {
    const id = await cgContract(EVM_CHAINS[chain], address);
    if (id) return id;
  }
  return null;
}
