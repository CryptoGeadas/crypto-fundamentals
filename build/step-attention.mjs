// Daily step 6: attention (issue #24), a free stand-in for social chatter.
//   site/data/attention.json  (shape documented in site/attention.js)
// Records CoinGecko's trending searches once a day, and each token's CoinGecko watchlist users on a
// weekly rotation (one paced CoinGecko call per token, capped per run). Keyless.

import { recordTrending, recordWatch, watchDue, dayKey } from "../site/attention.js";

const CG = "https://api.coingecko.com/api/v3";
const MIN_TRENDING = 5;

export async function attentionStep({ report, net, data }) {
  const [universe, prev] = [await data.read("universe.json"), await data.read("attention.json")];
  if (!universe) { report.error("attention", "No token list; attention data kept."); report.datasets.attention = { status: "kept" }; return; }
  const now = Date.now();
  let trending = prev?.trending || {};
  const watch = { ...(prev?.watch || {}) };

  // Trending searches: one call. A short or empty list is suspicious, so today is skipped, not recorded as "nobody trending".
  try {
    const t = await net.getJson(`${CG}/search/trending`, "coingecko", { coingecko: true });
    const ids = (t.coins || []).map((c) => c.item?.id).filter(Boolean);
    if (ids.length >= MIN_TRENDING) trending = recordTrending(trending, ids, now);
    else report.warn("coingecko", `Trending searches returned only ${ids.length} coins; today was not recorded.`);
  } catch (e) {
    report.warn("coingecko", `Trending searches not recorded today (${e.message}).`);
  }

  // Watchlist users: weekly per token, oldest first.
  const cap = process.env.WATCH_CAP ? Number(process.env.WATCH_CAP) : 90;
  const due = watchDue(universe.tokens.map((t) => t.id), watch, now, cap);
  let done = 0;
  for (const id of due) {
    try {
      const c = await net.getJson(`${CG}/coins/${encodeURIComponent(id)}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false&sparkline=false`, "coingecko", { coingecko: true });
      const n = Number(c.watchlist_portfolio_users);
      if (n > 0) { watch[id] = recordWatch(watch[id], n, now); done++; }
    } catch (e) {
      report.warn("coingecko", `Watchlist snapshots paused after ${done} of ${due.length} (${e.message}); the rest are retried tomorrow.`);
      break;
    }
  }

  const count = Object.keys(watch).length;
  await data.publish("attention", "attention.json",
    { generated: new Date().toISOString(), started: prev?.started || dayKey(now), count, trending, watch }, count, prev?.count ?? null, 0);
  console.log(`Attention: ${Object.keys(trending).length} trending days kept; watchlist snapshots ${done}/${due.length} today; ${count} tokens tracked.`);
}
