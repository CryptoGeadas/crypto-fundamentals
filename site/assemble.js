// Token assembly (#78): the one place that turns source results into the token object the ratings
// read (rating.js analyse). No fetching, no cache, no page code: the page (app.js) fetches and
// hands the results in, and the checks build tokens the same way (build/check-assemble.mjs).
//
//   assembleToken(market, cls, sources, daily) → t
//     market   the normalised CoinGecko token (coingecko.js normalise)
//     cls      its type (classify.js), e.g. { type: "defi" }
//     sources  { marketAt, entry, detail, llama, security, firstPrice, peg }
//              llama / security / firstPrice / peg are { value, at, failed? }: what a live lookup
//              returned, when, and whether it failed. A failed source stays unknown, never "none".
//     daily    the daily job's files: { unlocks, supply, meta, attention, defi, peers }
//   setLlama / setPeg / setSecurity(t, …)
//     put one live source's result on the token. The first load and the Retry button both use
//     them, so a retried source lands exactly as a first load would.
import { pegOf } from "./classify.js";
import { supplyGrowth } from "./supply.js";
import { trendingDays, watchChange } from "./attention.js";

const NOTHING = { value: null, at: null };

export function setLlama(t, value) {
  t.llama = value ?? null;
  t.sourceFailed.defillama = Boolean(value?.failed);
}

// st: the token's entry in DefiLlama's stablecoin list; null or { listed: false } = not listed.
// A failed lookup keeps the peg the token already has (on a first load: the peg from categories only).
export function setPeg(t, st, failed = false) {
  t.sourceFailed.defillama = failed;
  if (failed && t.peg !== undefined) return;
  t.peg = pegOf(t.categories, failed || st?.listed === false ? null : st ?? null);
}

export function setSecurity(t, value, failed = false) {
  t.sourceFailed.goplus = failed;
  t.security = failed ? null : value ?? null;
}

export function assembleToken(market, cls, sources = {}, daily = {}) {
  const { marketAt = Date.now(), entry = null, detail = null, llama = NOTHING, security = NOTHING, firstPrice = NOTHING, peg = NOTHING } = sources;
  const id = market.id;
  const t = { ...market, fetchedAt: new Date(marketAt), sourceFailed: {} };

  const u = daily.unlocks?.[id];
  t.unlocks = u ? { ...u, detail } : null;
  t.supplyGrowthNow = supplyGrowth({ history: daily.supply?.[id], unlocks: u }); // #55: null = unknown

  // A pegged token has no protocol data to show (#53): only its peg is read from DefiLlama.
  const pegged = cls.type === "pegged";
  if (pegged) { t.llama = null; setPeg(t, peg.value, Boolean(peg.failed)); }
  else setLlama(t, llama.value);
  setSecurity(t, security.value, Boolean(security.failed));
  t.firstPriceTs = firstPrice.value ?? null;

  // When each part was fetched: the oldest slow lookup is what the refresh line reports.
  const slowAts = [llama, security, firstPrice, peg].filter((x) => entry || x !== llama).map((x) => x.at).filter(Boolean);
  t.dataAt = { market: marketAt, slow: slowAts.length ? Math.min(...slowAts) : marketAt };

  t.meta = daily.meta?.[id] || null;
  t.attention = { trending: trendingDays(id, daily.attention?.trending), watch: t.watchlist ?? null,
    change: watchChange(daily.attention?.watch?.[id], t.watchlist) };
  const d = daily.defi?.[id];
  t.defiExtra = d ? { hacks: d.hacks || [], audits: d.audits || null } : null;
  t.peers = daily.peers ? { group: daily.peers.byToken?.[id]?.group, groups: daily.peers.groups, secondary: entry?.c ? "Chain" : null } : null;
  return t;
}
