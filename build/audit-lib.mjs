// Daily self-audit (issue #28): pure comparisons between what the page computes and figures the
// sources publish themselves. The step (build/step-audit.mjs) fetches; build/audit-issue.mjs keeps the
// "Data drift" issue in sync. Drift is reported, never acted on: it doesn't change data or fail a run.

export const DRIFT_TITLE = "Data drift";

// Tolerances, as a share of the source's figure. Each says why it is that loose.
export const TOL = {
  mcap: 0.03,   // CoinGecko updates price, supply and market cap at slightly different moments
  fdv: 0.03,    // same as above
  fdvMax: 0.10, // max supply this much above total before "FDV counts total supply" is worth a mention
  supply: 0.25, // DefiLlama and CoinGecko define "circulating" differently (treasury, staking); only big gaps matter
  fees: 0.01,   // same source, same days: anything beyond rounding is a calculation error on our side
  tvl: 0.05,    // the job's TVL can be up to a day older than DefiLlama's live figure
};

const off = (ours, theirs) => (theirs ? Math.abs(ours / theirs - 1) : null);
const pct = (x) => `${(x * 100).toFixed(1)}%`;
const n = (v) => (Math.abs(v) >= 1e9 ? `${(v / 1e9).toFixed(2)}B` : Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : Math.round(v).toLocaleString("en-US"));

// CoinGecko consistency for one /coins/markets row.
export function coingeckoDrift(m) {
  const out = [];
  if (!m?.id || !(m.current_price > 0)) return out;
  const p = m.current_price;
  if (m.market_cap > 0 && m.circulating_supply > 0) {
    const d = off(p * m.circulating_supply, m.market_cap);
    if (d > TOL.mcap) out.push({ check: "mcap", id: m.id, detail: `market cap ${n(m.market_cap)} vs price × circulating ${n(p * m.circulating_supply)} (${pct(d)} apart)` });
  }
  // CoinGecko may compute FDV from max supply or from total supply. Matching neither is a contradiction;
  // matching total while max is >10% higher is a definition lead: FDV-based figures understate future dilution.
  const fdv = m.fully_diluted_valuation;
  if (fdv > 0 && (m.max_supply > 0 || m.total_supply > 0)) {
    const dMax = m.max_supply > 0 ? off(p * m.max_supply, fdv) : null, dTotal = m.total_supply > 0 ? off(p * m.total_supply, fdv) : null;
    const okMax = dMax != null && dMax <= TOL.fdv, okTotal = dTotal != null && dTotal <= TOL.fdv;
    if (!okMax && !okTotal) out.push({ check: "fdv", id: m.id, detail: `FDV ${n(fdv)} matches neither price × max supply (${m.max_supply ? n(p * m.max_supply) : "none"}) nor price × total supply (${m.total_supply ? n(p * m.total_supply) : "none"})` });
    else if (okTotal && !okMax && m.max_supply > m.total_supply * (1 + TOL.fdvMax)) {
      out.push({ check: "fdvTotal", id: m.id, detail: `FDV ${n(fdv)} counts total supply ${n(m.total_supply)}; max supply ${n(m.max_supply)} would give ${n(p * m.max_supply)}` });
    }
  }
  if (m.max_supply > 0 && m.circulating_supply > m.max_supply * 1.001) {
    out.push({ check: "supply", id: m.id, detail: `circulating ${n(m.circulating_supply)} is above max supply ${n(m.max_supply)}` });
  }
  return out;
}

// DefiLlama's circulating (unlock data) vs CoinGecko's.
export function supplyDrift(id, defillamaCirc, coingeckoCirc) {
  const d = off(defillamaCirc, coingeckoCirc);
  return d != null && defillamaCirc > 0 && d > TOL.supply
    ? [{ check: "circulating", id, detail: `DefiLlama counts ${n(defillamaCirc)} circulating, CoinGecko ${n(coingeckoCirc)} (${pct(d)} apart)` }] : [];
}

// The page's 30-day fee window vs DefiLlama's own published 30-day total.
export function feeDrift(id, ours, theirs) {
  const d = off(ours ?? 0, theirs);
  return theirs > 0 && d > TOL.fees ? [{ check: "fees30", id, detail: `page's 30-day fees ${n(ours ?? 0)} vs DefiLlama's ${n(theirs)} (${pct(d)} apart)` }] : [];
}

// The job's TVL vs DefiLlama's protocol TVL.
export function tvlDrift(id, ours, theirs) {
  const d = off(ours ?? 0, theirs);
  return theirs > 0 && d > TOL.tvl ? [{ check: "tvl", id, detail: `stored TVL ${n(ours ?? 0)} vs DefiLlama's ${n(theirs)} (${pct(d)} apart)` }] : [];
}

// A fixed-size slice of a sorted list, continuing where yesterday stopped (wraps around).
export function rotate(ids, cursor = 0, size = 30) {
  const list = [...ids].sort();
  if (!list.length) return { pick: [], next: 0 };
  const start = cursor % list.length;
  const pick = [];
  for (let i = 0; i < Math.min(size, list.length); i++) pick.push(list[(start + i) % list.length]);
  return { pick, next: (start + pick.length) % list.length };
}

export const keyOf = (it) => `${it.check}:${it.id}`;

// What to do with the "Data drift" issue. New items (not in yesterday's list) earn a comment, which
// notifies; otherwise the issue body is just refreshed quietly.
export function decideDrift(items, previousKeys = [], openIssue = null) {
  const fresh = items.filter((it) => !previousKeys.includes(keyOf(it)));
  if (!items.length) return openIssue ? "close" : "none";
  if (!openIssue) return "create";
  return fresh.length ? "update+comment" : "update";
}

const LABEL = { mcap: "CoinGecko market cap", fdv: "CoinGecko FDV (contradiction)", fdvTotal: "FDV counts total, not max supply (page understates future dilution)", supply: "CoinGecko supply", circulating: "Circulating supply (sources disagree)", fees30: "30-day fees", tvl: "TVL" };

export function driftBody(items, { runUrl = "", at = new Date().toISOString(), sampled = {} } = {}) {
  const groups = {};
  for (const it of items) (groups[it.check] ||= []).push(it);
  // Systematic patterns can run to dozens of tokens: show 10 per group; the full list is in site/data/audit.json.
  const SHOW = 10;
  const lines = Object.entries(groups).flatMap(([c, its]) => [`### ${LABEL[c] || c} (${its.length})`,
    ...its.slice(0, SHOW).map((it) => `- \`${it.id}\`: ${it.detail}`),
    ...(its.length > SHOW ? [`- … and ${its.length - SHOW} more (full list: \`site/data/audit.json\`)`] : []), ""]);
  return [
    `Self-audit of ${new Date(at).toUTCString().replace(/:\d\d GMT$/, " UTC")}: ${items.length} item(s) outside tolerance.`,
    "",
    "Each line compares what the page uses with a figure the source publishes itself. Drift is a lead to a general rule to fix (as in #25–#27), not a per-token correction. Tolerances: `build/audit-lib.mjs`.",
    "",
    ...lines,
    sampled.fees || sampled.tvl ? `Sampled today: ${sampled.fees || 0} tokens for fees, ${sampled.tvl || 0} for TVL (rotating).` : "",
    runUrl ? `Run log: ${runUrl}` : "",
  ].join("\n");
}
