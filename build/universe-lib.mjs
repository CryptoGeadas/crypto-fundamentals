// Pure logic for the daily universe build (no network), so it can be tested with fixtures.

import { fdvOf } from "../site/fdv.js";

export const TOP_N = 300;       // always in the universe
export const MAX_RANK = 1500;   // beyond TOP_N, only tokens with a DefiLlama entry, up to this rank

// gecko_id → where DefiLlama knows this token. Uses DefiLlama's own gecko_id fields,
// never fuzzy name matching (decision 10).
//   p: protocol slug to query (a parent protocol wins over its children)
//   c: chain name, when the token is a chain's native token
//   f: 1 when its protocol earned fees in the last 30 days; fc: 1 when its chain did (see feeEarners)
export function llamaIndex({ protocols = [], parents = [], chains = [], fees = { protocol: new Set(), chain: new Set() } }) {
  const idx = {};
  const put = (gecko, key, value) => {
    if (!gecko) return;
    const e = (idx[gecko] ||= {});
    if (e[key] == null) e[key] = value;
  };
  for (const p of parents) put(p.gecko_id, "p", String(p.id).replace(/^parent#/, ""));
  for (const p of protocols) if (!p.parentProtocol) put(p.gecko_id, "p", p.slug);
  for (const p of protocols) if (p.parentProtocol) put(p.gecko_id, "p", p.slug);
  for (const c of chains) put(c.gecko_id, "c", c.name);
  for (const g of fees.protocol) if (idx[g]?.p) idx[g].f = 1;
  for (const g of fees.chain) if (idx[g]?.c) idx[g].fc = 1;
  return idx;
}

// gecko_ids whose DefiLlama protocol or chain earned fees in the last 30 days. Fee rows are filed
// under child protocols ("Aave V3") and chains ("chain#solana"), so they are mapped back to the
// token through the child's own gecko_id, its parent protocol, or the chain (prototype finding).
// Returns two sets, because "the chain earns fees" (ETH, SOL) and "a protocol earns fees" (Aave,
// Hyperliquid's exchange) mean different things for the type rule.
export function feeEarners({ feeRows = [], protocols = [], parents = [], chains = [] }) {
  const parentGecko = Object.fromEntries(parents.map((p) => [p.id, p.gecko_id]));
  const byId = Object.fromEntries(protocols.map((p) => [String(p.id), p.gecko_id || parentGecko[p.parentProtocol] || null]));
  const chainGecko = Object.fromEntries(chains.map((c) => ["chain#" + c.name.toLowerCase(), c.gecko_id]));
  const protocol = new Set(), chain = new Set();
  for (const r of feeRows) {
    if (!((r.total30d || 0) > 0)) continue;
    const id = String(r.defillamaId ?? r.id ?? "");
    if (id.toLowerCase().startsWith("chain#")) { const g = chainGecko[id.toLowerCase()]; if (g) chain.add(g); continue; }
    const g = byId[id] || parentGecko[id];
    if (g) protocol.add(g);
  }
  return { protocol, chain };
}

// Decision 18: top 300 by market cap, plus any token ranked 301–1,500 with any DefiLlama entry.
export function buildUniverse(markets, llama, platformsById = {}) {
  const seen = new Set();
  const tokens = [];
  for (const m of markets) {
    const rank = m.market_cap_rank;
    if (!rank || rank > MAX_RANK || seen.has(m.id)) continue;
    const inLlama = Boolean(llama[m.id]);
    if (rank > TOP_N && !inLlama) continue;
    seen.add(m.id);
    tokens.push({
      id: m.id,
      sym: String(m.symbol || "").toUpperCase(),
      name: m.name,
      rank,
      img: m.image || "",
      llama: inLlama ? 1 : 0,
      mcap: m.market_cap || null,
      fdv: fdvOf(m.current_price, m.max_supply, m.total_supply),   // same definition as the page (#29, #31)
      addr: cleanPlatforms(platformsById[m.id]),
    });
  }
  return tokens.sort((a, b) => a.rank - b.rank);
}

// Keep only real contract addresses (drops empty strings and non-address registry ids).
export function cleanPlatforms(platforms) {
  const out = {};
  for (const [chain, a] of Object.entries(platforms || {})) {
    if (typeof a === "string" && (/^0x[0-9a-fA-F]{40}$/.test(a) || /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a))) out[chain] = a;
  }
  return out;
}
