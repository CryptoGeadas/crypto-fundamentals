// Pure logic for protocol TVL and treasury summaries (no network), tested by build/check-defi.mjs.

export const TREASURY_MAX_AGE_DAYS = 7;
export const TREASURY_NONE_RETRY_DAYS = 30;
export const TREASURY_PER_RUN = 90;
const DAY = 86_400;

// TVL now and a month ago per token, summing every DefiLlama protocol that belongs to it
// (its own entry, or children of its parent protocol). lite/protocols2 carries tvlPrevMonth.
export function tvlByToken({ protocols = [], lite = [], parents = [], idmap = {}, ids = new Set() }) {
  const slugToGecko = {};
  for (const [gecko, e] of Object.entries(idmap)) if (e.p && ids.has(gecko)) slugToGecko[e.p] = gecko;
  const parentSlug = Object.fromEntries(parents.map((p) => [p.id, String(p.id).replace(/^parent#/, "")]));
  const liteById = Object.fromEntries(lite.map((p) => [String(p.defillamaId), p]));
  const out = {};
  for (const p of protocols) {
    const viaParent = slugToGecko[p.parentProtocolSlug] || slugToGecko[parentSlug[p.parentProtocol]];
    const gecko = viaParent || slugToGecko[p.slug];
    if (!gecko || !(p.tvl > 0)) continue;
    const l = liteById[String(p.id)];
    const prev = Number(l?.tvlPrevMonth) || 0;
    // A child's "excludeParent" TVL sits inside a sibling product and is already counted there, so
    // DefiLlama leaves it out of the parent's total (Spark Liquidity Layer → SparkLend). Same here.
    // DefiLlama doesn't record last month's split: on 5 Oct 2026 all 38 protocols with excludeParent TVL
    // reported tvlPrevMonth 0, and 37 reported tvlPrevWeek 0 with tvlPrevDay > 0. So 0 means "not
    // recorded", and today's share is assumed (#36); the daily job then replaces it from the parent's history.
    const ex = viaParent ? l?.chainTvls?.excludeParent : null;
    const exNow = Number(ex?.tvl) || 0;
    const exPrev = Number(ex?.tvlPrevMonth) || (exNow ? prev * (exNow / p.tvl) : 0);
    const e = (out[gecko] ||= { tvl: 0, tvlPrevMonth: 0 });
    e.tvl += p.tvl - exNow;
    e.tvlPrevMonth += prev - exPrev;
    if (exNow && !Number(ex?.tvlPrevMonth)) e.estimated = true;   // the daily job replaces it from the parent's history
  }
  for (const e of Object.values(out)) { e.tvl = Math.round(e.tvl); e.tvlPrevMonth = Math.round(e.tvlPrevMonth) || null; }
  return out;
}

// A protocol's TVL history (/protocol/<slug> "tvl": [{ date, totalLiquidityUSD }]) → today's value and
// the value 30 days before it. Used for parents whose month-ago split is only estimated (issue #27).
export function tvlFromSeries(series = [], now = Date.now() / 1000) {
  const pts = (series || []).filter((p) => p && p.totalLiquidityUSD > 0);
  if (!pts.length) return null;
  let prev = null;
  for (const p of pts) if (p.date <= now - 30 * 86400) prev = p.totalLiquidityUSD;
  return { tvl: Math.round(pts[pts.length - 1].totalLiquidityUSD), tvlPrevMonth: prev ? Math.round(prev) : null };
}

// /treasury/<slug> → { own, other }: value held in the project's own token vs everything else.
// currentChainTvls keys look like "Ethereum", "Ethereum-OwnTokens", "OwnTokens".
export function treasurySummary(t) {
  const c = t?.currentChainTvls;
  if (!c || typeof c !== "object") throw new Error("no currentChainTvls");
  const own = Number(c.OwnTokens) || 0;
  const other = Object.entries(c).filter(([k]) => !k.includes("-") && k !== "OwnTokens").reduce((a, [, v]) => a + (Number(v) || 0), 0);
  return { own: Math.round(own), other: Math.round(other), at: new Date().toISOString() };
}

export function treasuriesToRefresh(candidates, stored, now = Date.now() / 1000, cap = TREASURY_PER_RUN) {
  const due = [];
  for (const id of Object.keys(candidates)) {
    const t = stored[id]?.treasury;
    const age = t?.at ? (now - Date.parse(t.at) / 1000) / DAY : Infinity;
    const limit = t?.none ? TREASURY_NONE_RETRY_DAYS : TREASURY_MAX_AGE_DAYS;
    if (age >= limit) due.push([id, age]);
  }
  return due.sort((a, b) => b[1] - a[1]).slice(0, cap).map(([id]) => id);
}

// gecko id for a DefiLlama protocol id (own gecko_id, else its parent's), from /protocols + parents.
function protocolGecko(protocols, parents) {
  const parentGecko = Object.fromEntries(parents.map((p) => [p.id, p.gecko_id]));
  const byId = Object.fromEntries(protocols.map((p) => [String(p.id), p.gecko_id || parentGecko[p.parentProtocol] || null]));
  return (id, parentId) => byId[String(id)] || parentGecko[parentId] || parentGecko[id] || null;
}

// /hacks → { gecko: [{ date, name, amount, returned, cls }] }, newest first. Incidents are matched by
// DefiLlama protocol id, else by exact name; anything else (e.g. an exchange's regional entity) is skipped.
export function hacksByToken({ hacks = [], protocols = [], parents = [] }) {
  const geckoOf = protocolGecko(protocols, parents);
  // Fallback for incidents whose DefiLlama id is no longer in the protocols list (e.g. Aave's
  // Aug 2024 incident, id "1"): an exact, case-insensitive name match to a parent or protocol that
  // also runs on a chain the incident happened on (names get reused: "Rain", "swapX").
  const byName = {};
  const keep = (p, gecko) => { if (gecko) byName[String(p.name).toLowerCase()] ||= { gecko, chains: new Set(p.chains || []) }; };
  for (const p of parents) keep(p, p.gecko_id);
  for (const p of protocols) keep(p, p.gecko_id);
  const nameMatch = (h) => {
    const m = byName[String(h.name || "").toLowerCase()];
    return m && (h.chain || []).some((c) => m.chains.has(c)) ? m.gecko : null;
  };
  const out = {};
  for (const h of hacks) {
    const g = (h.defillamaId ? geckoOf(h.defillamaId, h.parentProtocolId) : null) || nameMatch(h);
    if (!g) continue;
    (out[g] ||= []).push({ date: h.date, name: h.name, amount: Number(h.amount) || 0, returned: Number(h.returnedFunds) || 0, cls: h.classification || "" });
  }
  for (const list of Object.values(out)) list.sort((a, b) => b.date - a.date);
  return out;
}

// /protocols audit_links → { gecko: { count, links: [first 5] } }, de-duplicated across child protocols.
export function auditsByToken({ protocols = [], parents = [] }) {
  const geckoOf = protocolGecko(protocols, parents);
  const sets = {};
  for (const p of protocols) {
    const g = geckoOf(p.id, p.parentProtocol);
    const links = (p.audit_links || []).filter((l) => typeof l === "string" && /^https?:\/\//.test(l));
    if (!g || !links.length) continue;
    for (const l of links) (sets[g] ||= new Set()).add(l);
  }
  return Object.fromEntries(Object.entries(sets).map(([g, s]) => [g, { count: s.size, links: [...s].slice(0, 5) }]));
}
