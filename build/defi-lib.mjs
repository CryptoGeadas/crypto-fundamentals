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
  const prevMonth = Object.fromEntries(lite.map((p) => [String(p.defillamaId), p.tvlPrevMonth]));
  const out = {};
  for (const p of protocols) {
    const gecko = slugToGecko[p.parentProtocolSlug] || slugToGecko[parentSlug[p.parentProtocol]] || slugToGecko[p.slug];
    if (!gecko || !(p.tvl > 0)) continue;
    const e = (out[gecko] ||= { tvl: 0, tvlPrevMonth: 0 });
    e.tvl += p.tvl;
    e.tvlPrevMonth += Number(prevMonth[String(p.id)]) || 0;
  }
  for (const e of Object.values(out)) { e.tvl = Math.round(e.tvl); e.tvlPrevMonth = Math.round(e.tvlPrevMonth) || null; }
  return out;
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
