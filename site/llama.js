// Live DefiLlama data, fetched in the visitor's browser (keyless, CORS-open endpoints).
// Heavy per-protocol endpoints (TVL history, treasury) are precomputed daily into data/defi.json.

const API = "https://api.llama.fi";
const DAY = 86_400;

async function json(url) {
  const r = await fetch(url, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// Sum of [ts, value] points with lo <= ts < hi (seconds).
export function windowSum(chart, lo, hi) {
  let s = 0, n = 0;
  for (const [ts, v] of chart || []) if (ts >= lo && ts < hi) { s += Number(v) || 0; n++; }
  return n ? s : null;
}

// Last 12 calendar months of daily values, summed per month.
export function monthlySums(chart, months = 12) {
  const by = new Map();
  for (const [ts, v] of chart || []) {
    const d = new Date(ts * 1000);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    by.set(key, (by.get(key) || 0) + (Number(v) || 0));
  }
  return [...by.keys()].sort().slice(-months).map((m) => ({ m, v: Math.round(by.get(m)) }));
}

// The last 30 complete days and the 30 days ending 90 days before them. Anchored to the latest
// complete data point, not the clock: some series publish a day late (a clock window would hold 29
// days), others already carry today's unfinished day (dropped). Points are stamped at the start of
// their day (UTC).
export function feeWindows(chart = [], now = Date.now() / 1000) {
  const done = chart.filter(([t]) => t + DAY <= now);
  if (!done.length) return { d30: null, prev: null };
  const end = done[done.length - 1][0] + DAY;
  return { d30: windowSum(done, end - 30 * DAY, end), prev: windowSum(done, end - 120 * DAY, end - 90 * DAY) };
}

// Fees / revenue / holders revenue for a protocol slug or chain: last 30 days, the 30 days ending
// 90 days earlier (for the trend), and monthly totals for the chart.
export async function feeSummary(slug, dataType) {
  const d = await json(`${API}/summary/fees/${encodeURIComponent(slug)}?dataType=${dataType}`);
  const chart = d.totalDataChart || [];
  return { ...feeWindows(chart), monthly: monthlySums(chart) };
}

const chainSlug = (name) => name.toLowerCase().replace(/\s+/g, "-");

// Everything the traction / accrual / treasury areas need for one token. Each piece may be null.
export async function loadLlama(id, entry, defi, cls, now = Date.now() / 1000) {
  if (!entry) return null;
  const out = { fees: null, revenue: null, holders: null, accrualFees: null, tvl: null, chain: null, treasury: null, failed: false };
  // "No data" (DefiLlama answers 400/404 for a protocol it does not cover) is different from
  // "DefiLlama did not answer" (network, rate limit, 5xx): only the second offers a retry.
  const settle = (p) => p.then((v) => v, (e) => { if (!/HTTP 40[04]/.test(e?.message || "")) out.failed = true; return null; });
  const jobs = [];
  if (cls.type === "chain" && entry.c) {
    const c = chainSlug(entry.c);
    if (cls.alsoDefi && entry.p) {
      // "Chain + DeFi" (Hyperliquid, Arbitrum): the protocol side is the business behind the token, so
      // fees and revenue come from it; the chain's own gas fees are kept for context only.
      jobs.push(settle(feeSummary(entry.p, "dailyFees")).then((v) => { out.fees = v; out.accrualFees = v; out.feesFrom = "protocol"; }));
      jobs.push(settle(feeSummary(entry.p, "dailyRevenue")).then((v) => (out.revenue = v)));
      jobs.push(settle(feeSummary(c, "dailyFees")).then((v) => (out.chainFees = v)));
    } else {
      jobs.push(settle(feeSummary(c, "dailyFees")).then((v) => (out.fees = v)));
      jobs.push(settle(feeSummary(c, "dailyRevenue")).then((v) => (out.revenue = v)));
    }
    jobs.push(settle(json(`${API}/v2/historicalChainTvl/${encodeURIComponent(entry.c)}`)).then((h) => {
      if (!h?.length) return;
      const at = (t) => { let v = null; for (const p of h) if (p.date <= t) v = p.tvl; return v; };
      out.tvl = { now: h[h.length - 1].tvl, prev: at(now - 30 * DAY) };
    }));
    jobs.push(Promise.all([
      settle(json(`${API}/overview/dexs/${encodeURIComponent(entry.c)}?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true`)),
      settle(json(`https://stablecoins.llama.fi/stablecoincharts/${encodeURIComponent(entry.c)}`)),
    ]).then(([dex, st]) => {
      const usd = (row) => row?.totalCirculatingUSD?.peggedUSD ?? null;
      const stNow = st?.length ? usd(st[st.length - 1]) : null;
      const st90 = st?.length ? usd([...st].reverse().find((r) => Number(r.date) <= now - 90 * DAY)) : null;
      out.chain = { dex30: dex?.total30d ?? null, stables: stNow, stables90: st90 };
    }));
    if (cls.alsoDefi && entry.p) {
      jobs.push(settle(feeSummary(entry.p, "dailyHoldersRevenue")).then((v) => (out.holders = v)));
    }
  } else if (entry.p) {
    jobs.push(settle(feeSummary(entry.p, "dailyFees")).then((v) => { out.fees = v; out.accrualFees = v; }));
    jobs.push(settle(feeSummary(entry.p, "dailyRevenue")).then((v) => (out.revenue = v)));
    jobs.push(settle(feeSummary(entry.p, "dailyHoldersRevenue")).then((v) => (out.holders = v)));
    if (defi?.tvl) out.tvl = { now: defi.tvl, prev: defi.tvlPrevMonth, estimated: Boolean(defi.estimated) };
  }
  if (defi?.treasury && !defi.treasury.none) out.treasury = defi.treasury;
  await Promise.all(jobs);
  return out;
}
