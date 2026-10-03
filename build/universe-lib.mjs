// Pure logic for the daily universe build (no network), so it can be tested with fixtures.

export const TOP_N = 300;       // always in the universe
export const MAX_RANK = 1500;   // beyond TOP_N, only tokens with a DefiLlama entry, up to this rank

// gecko_id → where DefiLlama knows this token. Uses DefiLlama's own gecko_id fields,
// never fuzzy name matching (decision 10).
//   p: protocol slug to query (a parent protocol wins over its children)
//   c: chain name, when the token is a chain's native token
export function llamaIndex({ protocols = [], parents = [], chains = [] }) {
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
  return idx;
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
