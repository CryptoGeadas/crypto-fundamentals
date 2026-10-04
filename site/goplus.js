// Holders and contract safety from GoPlus (keyless, browser-accessible), one call per token, for EVM chains
// and Solana alike (decision 19: the same raw "top 10 wallets as a share of supply" everywhere).
// The token is checked on its HOME chain (CoinGecko asset_platform_id): a bridged copy elsewhere
// (ARB on Ethereum) has holders that say nothing about the token.

const EVM_CHAIN_IDS = {
  ethereum: 1, "binance-smart-chain": 56, base: 8453, "arbitrum-one": 42161, "polygon-pos": 137,
  "optimistic-ethereum": 10, avalanche: 43114,
};
const FALLBACK_ORDER = ["ethereum", "solana", "base", "arbitrum-one", "binance-smart-chain", "polygon-pos", "optimistic-ethereum", "avalanche"];

// Which chain and address to check: the home chain if GoPlus supports it, else the first supported one.
export function pickContract(token) {
  const c = token.contracts || {};
  const supported = (k) => (k === "solana" || EVM_CHAIN_IDS[k]) && c[k];
  if (token.homeChain && supported(token.homeChain)) return { chain: token.homeChain, address: c[token.homeChain], home: true };
  const k = FALLBACK_ORDER.find(supported);
  return k ? { chain: k, address: c[k], home: false } : null;
}

const on = (v) => v === "1" || v === 1;

// GoPlus EVM result → flags present on this contract (missing fields mean "not applicable").
export function evmFlags(r) {
  const f = [];
  if (on(r.is_honeypot)) f.push("Honeypot (cannot sell)");
  if (on(r.cannot_sell_all)) f.push("Cannot sell all");
  if (on(r.is_mintable)) f.push("Can mint new tokens");
  if (on(r.owner_change_balance)) f.push("Owner can change balances");
  if (on(r.hidden_owner)) f.push("Hidden owner");
  if (on(r.can_take_back_ownership)) f.push("Ownership can be reclaimed");
  if (on(r.transfer_pausable)) f.push("Transfers can be paused");
  if (on(r.is_blacklisted)) f.push("Blacklist function");
  if (on(r.slippage_modifiable)) f.push("Tax can be changed");
  if (on(r.selfdestruct)) f.push("Self-destruct");
  if (on(r.external_call)) f.push("External call risk");
  const buy = Number(r.buy_tax) || 0, sell = Number(r.sell_tax) || 0;
  if (buy > 0 || sell > 0) f.push(`Trading tax ${Math.round(buy * 100)}% buy / ${Math.round(sell * 100)}% sell`);
  if (on(r.is_proxy)) f.push("Upgradeable (proxy) contract");
  if (r.is_open_source === "0") f.push("Source code not verified");
  return f;
}

// GoPlus Solana result → flags. Each authority is an object with status "1" when active.
export function solanaFlags(r) {
  const st = (k) => on(r[k]?.status);
  const f = [];
  if (st("mintable")) f.push("Mint authority active");
  if (st("freezable")) f.push("Freeze authority active");
  if (st("closable")) f.push("Account closing enabled");
  if (st("balance_mutable_authority")) f.push("Balances can be changed");
  if (st("transfer_hook")) f.push("Transfer hook");
  if ((r.transfer_fee && Object.keys(r.transfer_fee).length) || st("transfer_fee_upgradable")) f.push("Transfer fee");
  if (on(r.non_transferable)) f.push("Non-transferable");
  return f;
}

// → { chain, home, holderCount, holders: [{ address, percent, contract, locked, tag }], flags: [...] } or throws.
export async function fetchSecurity(token) {
  const pick = pickContract(token);
  if (!pick) return null;
  const url = pick.chain === "solana"
    ? `https://api.gopluslabs.io/api/v1/solana/token_security?contract_addresses=${encodeURIComponent(pick.address)}`
    : `https://api.gopluslabs.io/api/v1/token_security/${EVM_CHAIN_IDS[pick.chain]}?contract_addresses=${encodeURIComponent(pick.address)}`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`GoPlus HTTP ${res.status}`);
  const body = await res.json();
  if (body.code !== 1) throw new Error(`GoPlus: ${body.message || "error"}`);
  const result = body.result || {};
  const r = result[pick.address] || result[pick.address.toLowerCase()] || Object.values(result)[0];
  if (!r) throw new Error("GoPlus has no data for this contract");
  const holders = (r.holders || []).slice(0, 10).map((h) => ({
    address: h.address || h.account, percent: Number(h.percent) * 100, contract: on(h.is_contract), locked: on(h.is_locked), tag: h.tag || "",
  }));
  return {
    chain: pick.chain, home: pick.home, address: pick.address,
    holderCount: Number(r.holder_count) || null,
    holders,
    flags: pick.chain === "solana" ? solanaFlags(r) : evmFlags(r),
  };
}
