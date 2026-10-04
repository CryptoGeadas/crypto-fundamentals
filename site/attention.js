// Attention: a free stand-in for social chatter (issue #24). Pure functions, shared by the daily job
// (which records the history) and the page (which reads it). No DOM, no network.
//
// data/attention.json = { generated, started, trending: { "YYYY-MM-DD": [coingecko ids] },
//                         watch: { <id>: [["YYYY-MM-DD", watchlist users], ...] } }
// Trending: CoinGecko's top trending searches, recorded once a day by the job.
// Watch: CoinGecko watchlist users per token, recorded weekly (rotation), compared with today's live count.

const DAY_MS = 86_400_000;
export const TRENDING_KEEP_DAYS = 45;
export const WATCH_KEEP_DAYS = 120;
export const WATCH_EVERY_DAYS = 7;
export const WINDOW_DAYS = 30;

export const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);
const ageDays = (key, now) => (now - Date.parse(key + "T00:00:00Z")) / DAY_MS;

// Today's trending list added to the history (replacing today's, if any); old days dropped.
export function recordTrending(history = {}, ids = [], now = Date.now()) {
  const out = {};
  for (const [k, v] of Object.entries(history)) if (ageDays(k, now) < TRENDING_KEEP_DAYS) out[k] = v;
  out[dayKey(now)] = [...new Set(ids)];
  return out;
}

// { days, of }: on how many of the recorded days in the last 30 the token was trending.
// null when nothing has been recorded in the window yet (unknown, never "zero").
export function trendingDays(id, history = {}, now = Date.now()) {
  const recent = Object.entries(history || {}).filter(([k]) => ageDays(k, now) < WINDOW_DAYS);
  if (!recent.length) return null;
  return { days: recent.filter(([, ids]) => ids.includes(id)).length, of: recent.length };
}

// A watchlist snapshot added to a token's series (one per day), old snapshots dropped.
export function recordWatch(series = [], count, now = Date.now()) {
  const key = dayKey(now);
  return [...series.filter(([k]) => k !== key && ageDays(k, now) < WATCH_KEEP_DAYS), [key, count]];
}

// Tokens whose last snapshot is a week old or more (never-recorded first), capped per run.
export function watchDue(ids, watch = {}, now = Date.now(), cap = 90) {
  const due = [];
  for (const id of ids) {
    const last = (watch[id] || []).at(-1)?.[0];
    const age = last ? ageDays(last, now) : Infinity;
    if (age >= WATCH_EVERY_DAYS) due.push([id, age]);
  }
  return due.sort((a, b) => b[1] - a[1]).slice(0, cap).map(([id]) => id);
}

// Change of watchlist users against the snapshot closest to 30 days ago (between 21 and 45 days old).
// null when no snapshot is old enough yet.
export function watchChange(series = [], nowCount, now = Date.now()) {
  if (!(nowCount > 0)) return null;
  const old = (series || []).map(([k, v]) => [k, v, ageDays(k, now)]).filter(([, v, a]) => v > 0 && a >= 21 && a <= 45)
    .sort((x, y) => Math.abs(x[2] - WINDOW_DAYS) - Math.abs(y[2] - WINDOW_DAYS))[0];
  if (!old) return null;
  return { pct: (nowCount / old[1] - 1) * 100, from: old[1], since: old[0], days: Math.round(old[2]) };
}
