// Pure logic for unlock data (no network), tested by build/check-unlocks.mjs.
// Source: DefiLlama's public unlock pages (the /emissions API is paid). The overview page
// (defillama.com/unlocks) gives every tracked token's current supply and next event; each
// token's own page (defillama.com/unlocks/<slug>) gives its full cumulative schedule.

export const DETAIL_MAX_AGE_DAYS = 7;   // refresh each token's full schedule about weekly
export const DETAIL_PER_RUN = 40;       // polite cap on per-token pages fetched in one run
const DAY = 86_400;

export function nextData(html) {
  const m = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html || "");
  if (!m) return null;
  try { return JSON.parse(m[1]).props?.pageProps ?? null; } catch { return null; }
}

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

// Token page → compact schedule: monthly cumulative unlocked supply per category, plus the
// upcoming events. Uses DefiLlama's "documented" schedule.
export function summariseDetail(pageProps, now = Date.now() / 1000) {
  const em = pageProps?.emissions;
  const ds = em?.datasets?.documented;
  if (!ds?.dimensions?.length || !ds.source?.length) return null;
  const cats = ds.dimensions.slice(1);
  const rows = ds.source.map((r) => [Math.round(r[0] / 1000), ...r.slice(1).map((x) => Number(x) || 0)]);
  // first row of each calendar month, plus the last row, keeps the chart light
  const seen = new Set();
  const monthly = rows.filter((r, i) => {
    const d = new Date(r[0] * 1000);
    const key = d.getUTCFullYear() * 12 + d.getUTCMonth();
    if (i === rows.length - 1 || !seen.has(key)) { seen.add(key); return true; }
    return false;
  });
  const upcoming = (em.events || []).filter((e) => e.timestamp >= now)
    .map((e) => ({ ts: e.timestamp, amount: (e.noOfTokens || []).reduce((a, b) => a + (Number(b) || 0), 0), cat: e.category || "", type: e.unlockType || "cliff" }))
    .sort((a, b) => a.ts - b.ts).slice(0, 24);
  return { cats, monthly, upcoming, maxSupply: num(em.meta?.maxSupply), generatedAt: new Date(now * 1000).toISOString() };
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
