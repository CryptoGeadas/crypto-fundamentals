// Pure logic for peer valuation benchmarks (no network), tested by build/check-peers.mjs.
// For every fee-earning token in the universe: FDV ÷ yearly fees and FDV ÷ yearly revenue, grouped by
// DefiLlama category. Chains form their own group, compared on chain fees; "Chain + DeFi" tokens
// (Hyperliquid, Arbitrum) are compared in their protocol's category, matching the page, which takes
// their fees from the protocol side.


// fee rows (from /overview/fees, one call per dataType) → { gecko: { protocol: {v, cat}, chain: v } }
export function feesByToken({ feeRows = [], protocols = [], parents = [], chains = [] }) {
  const parentGecko = Object.fromEntries(parents.map((p) => [p.id, p.gecko_id]));
  const byId = Object.fromEntries(protocols.map((p) => [String(p.id), { g: p.gecko_id || parentGecko[p.parentProtocol] || null, cat: p.category }]));
  const chainGecko = Object.fromEntries(chains.map((c) => ["chain#" + c.name.toLowerCase(), c.gecko_id]));
  const out = {};
  for (const r of feeRows) {
    const v = Number(r.total30d) || 0;
    if (!(v > 0)) continue;
    // A row with no figure for the latest day has stopped updating (#32, #34): its calendar 30 days hold
    // only a few old days, which would read as an absurdly expensive peer. A zero day still counts.
    if (r.total24h == null) continue;
    const id = String(r.defillamaId ?? r.id ?? "");
    if (id.toLowerCase().startsWith("chain#")) {
      const g = chainGecko[id.toLowerCase()];
      if (g) (out[g] ||= {}).chain = ((out[g] ||= {}).chain || 0) + v;
      continue;
    }
    const p = byId[id] || (parentGecko[id] ? { g: parentGecko[id], cat: r.category } : null);
    if (!p?.g) continue;
    const e = ((out[p.g] ||= {}).protocol ||= { v: 0, cats: {} });
    e.v += v;
    const cat = r.category || p.cat || "Other";
    e.cats[cat] = (e.cats[cat] || 0) + v;
  }
  for (const e of Object.values(out)) if (e.protocol) e.protocol.cat = Object.entries(e.protocol.cats).sort((a, b) => b[1] - a[1])[0][0];
  return out;
}

// → { groups: { <name>: [{ id, pf, pr }] }, byToken: { <id>: { group, pf, pr } } }
export function buildPeers(universeTokens, idmap, fees, revenue) {
  const groups = {}, byToken = {};
  for (const t of universeTokens) {
    const e = idmap[t.id] || {};
    const f = fees[t.id], r = revenue[t.id];
    const fdv = t.fdv || t.mcap;
    if (!fdv) continue;
    let group, f30, r30;
    if (e.c && !(e.p && e.f)) { group = "Chain"; f30 = f?.chain; r30 = r?.chain; }           // plain chain
    else if (f?.protocol) { group = f.protocol.cat; f30 = f.protocol.v; r30 = r?.protocol?.v; } // DeFi or Chain + DeFi
    else continue;
    if (!(f30 > 0)) continue;
    const pf = round(fdv / (f30 * 12)), pr = r30 > 0 ? round(fdv / (r30 * 12)) : null;
    (groups[group] ||= []).push({ id: t.id, pf, pr });
    byToken[t.id] = { group, pf, pr };
  }
  return { groups, byToken };
}

const round = (x) => Math.round(x * 100) / 100;
