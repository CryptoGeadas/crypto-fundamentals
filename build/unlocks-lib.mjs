// Pure logic for unlock data (no network), tested by build/check-unlocks.mjs.
// Source: DefiLlama's public datasets host (the /emissions API is paid). emissionsIndex gives every
// tracked token's current supply and next event (the same rows as defillama.com/unlocks);
// emissions/<slug> gives a token's full cumulative schedule.

export const DETAIL_MAX_AGE_DAYS = 7;   // refresh each token's full schedule about weekly
export const DETAIL_PER_RUN = 40;       // polite cap on per-token pages fetched in one run
const DAY = 86_400;

// Overview row → compact summary for tokens in our universe.
export function summariseOverview(rows, universeIds) {
  const out = {};
  for (const r of rows || []) {
    const id = r.gecko_id;
    if (!id || !universeIds.has(id) || out[id]) continue;
    const next = r.nextEventV2 || (r.nextEvent ? { date: r.nextEvent.date, amount: r.nextEvent.toUnlock, unlockType: "cliff" } : null);
    out[id] = {
      slug: r.protocolSlug,
      circ: num(r.circSupply), max: num(r.maxSupply), locked: num(r.totalLocked),
      perDay: num(r.unlocksPerDay) || 0,
      next: next && next.date ? { ts: next.date, amount: num(next.amount), type: next.unlockType || "cliff" } : null,
    };
  }
  return out;
}

// Token schedule → compact form: monthly cumulative unlocked supply per category, plus upcoming
// events. From DefiLlama's public datasets host (defillama-datasets.llama.fi/emissions/<slug>),
// which serves the data behind the website without its bot challenge. Shape:
//   documentedData.data = [{ label, data: [{ timestamp (s), unlocked (cumulative), ... }] }]
export function summariseDataset(e, now = Date.now() / 1000) {
  const series = e?.documentedData?.data;
  if (!Array.isArray(series) || !series.length || !series[0]?.data?.length) return null;
  const cats = series.map((s) => s.label);
  const byTs = new Map();
  series.forEach((s, c) => {
    for (const p of s.data) {
      if (!byTs.has(p.timestamp)) byTs.set(p.timestamp, new Array(cats.length).fill(null));
      byTs.get(p.timestamp)[c] = Number(p.unlocked) || 0;
    }
  });
  // carry each category's last known value forward where a series has no point for a date
  const last = new Array(cats.length).fill(0);
  const rows = [...byTs.keys()].sort((a, b) => a - b).map((ts) => [ts, ...byTs.get(ts).map((v, c) => (v == null ? last[c] : (last[c] = v)))]);
  const seen = new Set();
  const monthly = rows.filter((r, i) => {
    const d = new Date(r[0] * 1000);
    const key = d.getUTCFullYear() * 12 + d.getUTCMonth();
    if (i === rows.length - 1 || !seen.has(key)) { seen.add(key); return true; }
    return false;
  }).map((r) => [r[0], ...r.slice(1).map((v) => Math.round(v))]);
  const upcoming = (e.metadata?.events || []).filter((ev) => ev.timestamp >= now)
    .map((ev) => ({ ts: ev.timestamp, amount: (ev.noOfTokens || []).reduce((a, b) => a + (Number(b) || 0), 0), cat: ev.category || "", type: ev.unlockType || "cliff" }))
    .sort((a, b) => a.ts - b.ts).slice(0, 24);
  return { cats, monthly, upcoming, maxSupply: num(e.supplyMetrics?.maxSupply ?? e.metadata?.total), generatedAt: new Date(now * 1000).toISOString() };
}

// Cumulative unlocked supply at time `ts` (seconds), from monthly rows, linear between rows.
export function unlockedAt(monthly, ts) {
  if (!monthly?.length) return null;
  const total = (r) => r.slice(1).reduce((a, b) => a + b, 0);
  if (ts <= monthly[0][0]) return total(monthly[0]);
  for (let i = 1; i < monthly.length; i++) {
    if (ts <= monthly[i][0]) {
      const [a, b] = [monthly[i - 1], monthly[i]];
      const f = (ts - a[0]) / (b[0] - a[0] || 1);
      return total(a) + (total(b) - total(a)) * f;
    }
  }
  return total(monthly[monthly.length - 1]);
}

// Tokens whose detail should be fetched this run: missing, older than a week, or whose stored
// next unlock has passed (schedule moved on). Oldest first, capped.
export function detailsToRefresh(summary, stored, now = Date.now() / 1000, cap = DETAIL_PER_RUN) {
  const due = [];
  for (const [id, s] of Object.entries(summary)) {
    if (!(s.locked > 0)) continue;
    const d = stored[id];
    const age = d?.generatedAt ? (now - Date.parse(d.generatedAt) / 1000) / DAY : Infinity;
    const passed = d?.upcoming?.[0] && d.upcoming[0].ts < now;
    if (age >= DETAIL_MAX_AGE_DAYS || passed) due.push([id, age]);
  }
  return due.sort((a, b) => b[1] - a[1]).slice(0, cap).map(([id]) => id);
}

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
