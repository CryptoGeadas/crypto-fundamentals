// Shared rating module: metric definitions and rating logic.
//
// Pure functions only, with no DOM and no network, so the exact same file runs in the
// browser (the public page) and in Node (the build check now, AI Insights later).
// Thresholds are never hard-coded here; they come from the house rules.

export const LEVELS = ["Very low", "Low", "Neutral", "High", "Very high"];

export const AREAS = [
  { id: "valuation", name: "Valuation" },
  { id: "traction", name: "Traction" },
  { id: "accrual", name: "Value accrual" },
  { id: "dilution", name: "Dilution" },
  { id: "holders", name: "Holders" },
  { id: "market", name: "Market health" },
  { id: "attention", name: "Attention" },
  { id: "treasury", name: "Treasury" },
  { id: "security", name: "Security" },
  { id: "dev", name: "Development" },
  { id: "backers", name: "Backers & age" },
];

// Which areas apply to each token type (decision 2 and the PRD metric set).
export const AREAS_BY_TYPE = {
  defi: ["valuation", "traction", "accrual", "dilution", "holders", "market", "attention", "treasury", "security", "dev", "backers"],
  chain: ["valuation", "traction", "dilution", "holders", "market", "attention", "treasury", "security", "dev", "backers"],
  narrative: ["dilution", "holders", "market", "attention", "security", "dev", "backers"],
  meme: ["dilution", "holders", "market", "attention", "security"],
};

// Areas a token actually gets: its type's areas, plus value accrual for a chain whose
// protocol side earns fees (decision 14).
export function areasFor(type, alsoDefi = false) {
  const base = AREAS_BY_TYPE[type] || AREAS_BY_TYPE.narrative;
  return alsoDefi && !base.includes("accrual") ? AREAS.map((a) => a.id).filter((id) => base.includes(id) || id === "accrual") : base;
}

import { peerPercentile } from "./peers.js";
import { HOUSE_RULES } from "./house-rules.js";
import { maxGap } from "./fdv.js";

// ---------------------------------------------------------------- formatters
export const fmt = {
  usd(v) {
    if (v == null || !Number.isFinite(v)) return "—";
    const a = Math.abs(v);
    if (a >= 1e12) return "$" + (v / 1e12).toFixed(2) + "T";
    if (a >= 1e9) return "$" + (v / 1e9).toFixed(2) + "B";
    if (a >= 1e6) return "$" + (v / 1e6).toFixed(1) + "M";
    if (a >= 1e3) return "$" + (v / 1e3).toFixed(1) + "K";
    if (a >= 1) return "$" + v.toFixed(2);
    return fmt.price(v);
  },
  num(v) {
    if (v == null || !Number.isFinite(v)) return "—";
    const a = Math.abs(v);
    if (a >= 1e12) return (v / 1e12).toFixed(2) + "T";
    if (a >= 1e9) return (v / 1e9).toFixed(2) + "B";
    if (a >= 1e6) return (v / 1e6).toFixed(1) + "M";
    if (a >= 1e3) return (v / 1e3).toFixed(1) + "K";
    return v.toFixed(a < 10 ? 1 : 0);
  },
  // Prices keep their digits ($2,734.12); tiny prices get 3 significant digits, never
  // scientific notation ($0.000000116, not $1.16e-7). Only large totals are abbreviated.
  price(v) {
    if (v == null || !Number.isFinite(v)) return "—";
    if (v >= 1) return "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (v <= 0) return "$0";
    return "$" + v.toFixed(Math.min(20, 2 - Math.floor(Math.log10(v))));
  },
  pct: (v, d = 0) => (v == null || !Number.isFinite(v) ? "—" : v.toFixed(d) + "%"),
  // Enough decimals that a value never rounds onto a band edge it sits below (1.47 must not read "1.5×").
  x: (v) => (v == null || !Number.isFinite(v) ? "—" : (v >= 100 ? Math.round(v).toLocaleString("en-US") : v >= 10 ? v.toFixed(1) : v.toFixed(2)) + "×"),
  chg: (v) => (v == null || !Number.isFinite(v) ? "—" : (v > 0 ? "+" : "") + v.toFixed(1) + "%"),
};

// ---------------------------------------------------------------- metric definitions
// yard: "fixed" (house-rule bands) | "shown" (context, never rated).
// val(token) returns a number, or null when the source has no data.
export const METRICS = [
  {
    id: "circulatingShare",
    area: "dilution",
    label: "Circulating share of total supply",
    yard: "fixed",
    src: "CoinGecko",
    // Without a max cap, circulating ÷ today's total is ~100% by construction and says nothing
    // about future dilution, so the metric is shown as "Uncapped supply" and never rated.
    unrated: (t) => (!t.maxSupply && t.totalSupply
      ? { display: "Uncapped supply", rule: "Not rated: with no maximum supply, the share of today's total that circulates is always close to 100% and says nothing about future dilution. Issuance rate matters instead." }
      : null),
    // Total supply = what exists now, locked or not (#39); the gap to max supply can be unminted or burned.
    val: (t) => { const base = t.totalSupply || t.maxSupply; return t.circulatingSupply && base ? Math.min(100, (t.circulatingSupply / base) * 100) : null; },
    show: (v) => fmt.pct(v, 1),
    extra: (t) => (!t.maxSupply ? (t.totalSupply ? `${fmt.num(t.totalSupply)} in existence today, no max cap` : "")
      : `of ${fmt.num(t.totalSupply || t.maxSupply)} total supply${maxGap(t.maxSupply, t.totalSupply) ? `; max supply ${fmt.num(t.maxSupply)} (the difference may be unminted or already burned)` : ""}`),
  },
  {
    id: "fdvToMcap",
    area: "dilution",
    label: "FDV ÷ market cap",
    yard: "fixed",
    src: "CoinGecko",
    val: (t) => (t.fdv && t.marketCap ? t.fdv / t.marketCap : null),
    show: (v) => fmt.x(v),
    extra: (t) => (!t.fdv ? "" : `FDV ${fmt.usd(t.fdv)} vs market cap ${fmt.usd(t.marketCap)}` +
      (maxGap(t.maxSupply, t.totalSupply) && t.price ? `. At max supply it would be ${fmt.usd(t.price * t.maxSupply)} (the difference may be unminted or already burned)` : "") +
      (t.fdvCoinGecko && Math.abs(t.fdv / t.fdvCoinGecko - 1) > 0.03 ? `. CoinGecko shows ${fmt.usd(t.fdvCoinGecko)}` : "") +
      (t.maxSupply ? "" : ". No max cap: FDV only counts tokens that exist today, not future issuance")),
  },
];

// ---------------------------------------------------------------- unlock metrics (issue #5)
// t.unlocks comes from the daily job (DefiLlama unlock pages): { circ, max, perDay, next:{ts,amount,type},
// detail:{ cats, monthly:[[ts, ...cumulative per category]], upcoming } }. Missing when not tracked.
const YEAR = 365 * 86400;
const nowSec = () => Date.now() / 1000;
const fmtDay = (ts) => new Date(ts * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export function unlockedAt(monthly, ts) {
  if (!monthly?.length) return null;
  const total = (r) => r.slice(1).reduce((a, b) => a + b, 0);
  if (ts <= monthly[0][0]) return total(monthly[0]);
  for (let i = 1; i < monthly.length; i++) {
    if (ts <= monthly[i][0]) {
      const a = monthly[i - 1], b = monthly[i];
      return total(a) + (total(b) - total(a)) * ((ts - a[0]) / (b[0] - a[0] || 1));
    }
  }
  return total(monthly[monthly.length - 1]);
}

// Supply due in the next 12 months: from the full schedule when we have it, otherwise null.
export function unlocks12mAmount(u, now = nowSec()) {
  const m = u?.detail?.monthly;
  if (!m?.length) return null;
  const a = unlockedAt(m, now), b = unlockedAt(m, now + YEAR);
  return a == null || b == null ? null : Math.max(0, b - a);
}

const nextEvent = (u) => (u?.next && u.next.ts > nowSec() ? u.next : null);
const noSchedule = (t) => (!t.unlocks ? { missing: true, display: "Not tracked", rule: "DefiLlama does not track an unlock schedule for this token, so there is nothing to rate." } : null);
const continuous = (u) => !nextEvent(u) && u?.perDay > 0;
const uncapped = (t) => !t.maxSupply && t.totalSupply;
// Which circulating figure the unlock percentages use, when the two sources disagree by more than 5%.
const circNote = (t) => {
  const a = t.unlocks?.circ, b = t.circulatingSupply;
  return a && b && Math.abs(a / b - 1) > 0.05 ? ` · % of DefiLlama's circulating ${fmt.num(a)} (CoinGecko counts ${fmt.num(b)})` : "";
};
const noneScheduled = (t) => {
  const u = t.unlocks, n = nextEvent(u);
  if (noSchedule(t)) return noSchedule(t);
  if (n && !(n.amount > 0)) return { missing: true, display: "Amount not published",
    rule: `DefiLlama lists a ${n.type || ""} unlock on ${fmtDay(n.ts)} but publishes no amount for it, so there is nothing to rate.`.replace("a  unlock", "an unlock") };
  if (continuous(u)) return { display: "Continuous",
    rule: "Not rated: supply unlocks a little every day rather than in separate events, so there is no single next unlock. The 12-month figure counts it." };
  if (!n) return { display: "None scheduled", rule: "Not rated: no unlock is scheduled. That alone is not good news when supply is still locked; see \"Locked supply not unlocking within 12 months\"." };
  return null;
};
// Uncapped tokens: new supply mostly comes from issuance, which DefiLlama's vesting schedule doesn't cover,
// and its "max supply" is a modelled figure. The schedule is shown for what it is, never rated.
const UNCAPPED_RULE = "Not rated: this token has no maximum supply, so new coins mainly come from issuance (inflation), which DefiLlama's unlock schedule doesn't cover. What is shown is its documented vesting only.";

const UNLOCK_METRICS = [
  {
    id: "nextUnlockShare", area: "dilution", label: "Next unlock, % of circulating", yard: "fixed", src: "DefiLlama unlock page",
    unrated: noneScheduled,
    val: (t) => { const n = nextEvent(t.unlocks); const c = t.unlocks?.circ; return n && c ? (n.amount / c) * 100 : null; },
    show: (v) => fmt.pct(v, 2),
    extra: (t) => {
      const u = t.unlocks, n = nextEvent(u);
      if (n) return n.amount > 0 ? `${fmt.num(n.amount)} ${t.sym} on ${fmtDay(n.ts)} (${n.type})${circNote(t)}` : `${n.type ? n.type[0].toUpperCase() + n.type.slice(1) + " unlock" : "Unlock"} on ${fmtDay(n.ts)}`;
      return continuous(u) ? `About ${fmt.num(u.perDay)} ${t.sym} a day${u.circ ? `, ${fmt.pct((u.perDay / u.circ) * 100, 3)} of circulating` : ""}${circNote(t)}` : "";
    },
  },
  {
    id: "nextUnlockVsVolume", area: "dilution", label: "Next unlock vs daily volume", yard: "fixed", src: "DefiLlama unlock page, CoinGecko",
    unrated: noneScheduled,
    val: (t) => { const n = nextEvent(t.unlocks); return n && t.volume24h && t.price ? (n.amount * t.price) / t.volume24h : null; },
    show: (v) => fmt.x(v),
    extra: (t) => {
      const u = t.unlocks, n = nextEvent(u);
      if (n && n.amount > 0 && t.price) return `${fmt.usd(n.amount * t.price)} unlocking vs ${fmt.usd(t.volume24h)} traded in 24h`;
      return continuous(u) && t.price && t.volume24h ? `About ${fmt.usd(u.perDay * t.price)} a day unlocking vs ${fmt.usd(t.volume24h)} traded in 24h` : "";
    },
  },
  {
    id: "unlocks12m", area: "dilution", label: "Unlocks due in the next 12 months", yard: "fixed", src: "DefiLlama unlock page",
    unrated: (t) => {
      if (noSchedule(t) || !uncapped(t)) return noSchedule(t);
      const a = unlocks12mAmount(t.unlocks), c = t.unlocks?.circ;
      return { display: a != null && c ? `${fmt.pct((a / c) * 100, 1)} of circulating (vesting only)` : "Uncapped supply", rule: UNCAPPED_RULE };
    },
    val: (t) => { const a = unlocks12mAmount(t.unlocks); const c = t.unlocks?.circ; return a != null && c ? (a / c) * 100 : null; },
    show: (v) => fmt.pct(v, 1) + " of circulating",
    extra: (t) => { const a = unlocks12mAmount(t.unlocks); return a != null ? `${fmt.num(a)} ${t.sym} on the published schedule${circNote(t)}` : t.unlocks ? "Full schedule not fetched yet" : ""; },
  },
  {
    id: "lockedBeyond12m", area: "dilution", label: "Locked supply not unlocking within 12 months", yard: "fixed", src: "DefiLlama unlock page",
    unrated: (t) => noSchedule(t) || (uncapped(t) ? { display: "Uncapped supply", rule: UNCAPPED_RULE } : null),
    val: (t) => {
      const u = t.unlocks, a = unlocks12mAmount(u), max = u?.max || u?.detail?.maxSupply;
      return a != null && max && u.circ != null ? Math.max(0, ((max - u.circ - a) / max) * 100) : null;
    },
    show: (v) => fmt.pct(v, 1) + " of max supply",
    hint: "Neither circulating nor scheduled within a year: either unlocks later, or has no published schedule",
  },
];
METRICS.push(...UNLOCK_METRICS);

// ---------------------------------------------------------------- traction, value accrual, treasury (issue #6)
// t.llama comes from site/llama.js: { fees, revenue, holders, accrualFees: {d30, prev, monthly}, tvl: {now, prev},
// chain: {dex30, stables, stables90}, treasury: {own, other} }; any piece may be null.
// DefiLlama publishes some series in batches (#41): say which day the 30 days run to when it's not yesterday.
const throughNote = (series) => (series?.through ? `30 days to ${fmtDay(series.through)} (DefiLlama's latest figures)` : "");

// For "Chain + DeFi" tokens TVL is the protocol's, like their fees (#40); the chain's own TVL is named.
const tvlFrom = (t) => (t.llama?.tvl?.from === "protocol"
  ? `; from the protocol, the business behind the token${t.llama.chainTvl?.now != null ? `; the chain itself holds ${fmt.usd(t.llama.chainTvl.now)}` : ""}` : "");

// A chain whose public DeFi deposits are a sliver of its market cap (#38): TVL likely misses what the
// chain is mainly used for (payments, enterprise or real-world-asset settlement), so it is shown, not rated.
// DeFi protocols are always rated: for them, TVL is the business.
function thinChainTvl(t, display) {
  const tvl = t.llama?.tvl;
  if (!tvl?.chain || !(t.marketCap > 0) || tvl.now == null) return null;
  if (tvl.now > 0 && (tvl.now / t.marketCap) * 100 >= HOUSE_RULES.chainTvlMinSharePct) return null;
  return { display: display(t), rule: `Not rated: public DeFi deposits on this chain are under ${HOUSE_RULES.chainTvlMinSharePct}% of its market cap, so TVL likely misses what the chain is mainly used for (payments, enterprise or real-world-asset settlement). Chains are rated on TVL only when DeFi is a meaningful part of them.` };
}

export const pctChange = (now, before) => (now != null && before ? (now / before - 1) * 100 : null);

const BUSINESS_METRICS = [
  { id: "fees30", area: "traction", label: "Fees, last 30 days", yard: "shown", src: "DefiLlama fees",
    val: (t) => t.llama?.fees?.d30 ?? null, show: (v) => fmt.usd(v),
    extra: (t) => [t.llama?.feesFrom === "protocol"
      ? `From the protocol, the business behind the token${t.llama.chainFees?.d30 != null ? `; the chain itself earned ${fmt.usd(t.llama.chainFees.d30)} in gas fees` : ""}` : "",
      throughNote(t.llama?.fees)].filter(Boolean).join("; ") },
  { id: "revenue30", area: "traction", label: "Revenue, last 30 days", yard: "shown", src: "DefiLlama revenue",
    val: (t) => t.llama?.revenue?.d30 ?? null, show: (v) => fmt.usd(v), extra: (t) => throughNote(t.llama?.revenue),
    hint: "The part of fees the protocol or chain keeps, rather than paying out to liquidity providers or validators" },
  { id: "feesTrend", precision: 1, area: "traction", label: "Fees trend", yard: "fixed", src: "DefiLlama fees",
    val: (t) => pctChange(t.llama?.fees?.d30, t.llama?.fees?.prev), show: (v) => fmt.chg(v),
    hint: "Last 30 days against the 30 days ending 90 days earlier" },
  { id: "revenueTrend", precision: 1, area: "traction", label: "Revenue trend", yard: "fixed", src: "DefiLlama revenue",
    val: (t) => pctChange(t.llama?.revenue?.d30, t.llama?.revenue?.prev), show: (v) => fmt.chg(v),
    hint: "Last 30 days against the 30 days ending 90 days earlier" },
  { id: "tvlTrend", precision: 1, area: "traction", label: "TVL trend (30 days)", yard: "fixed", src: "DefiLlama TVL",
    unrated: (t) => thinChainTvl(t, (x) => { const v = pctChange(x.llama.tvl.now, x.llama.tvl.prev); return v == null ? "No data" : fmt.chg(v); }),
    val: (t) => pctChange(t.llama?.tvl?.now, t.llama?.tvl?.prev), show: (v) => fmt.chg(v),
    extra: (t) => (t.llama?.tvl?.now ? `${fmt.usd(t.llama.tvl.now)} locked today${tvlFrom(t)}${t.llama.tvl.estimated ? "; last month's figure is estimated (DefiLlama publishes no history for this group)" : ""}` : "") },
  { id: "dex30", area: "traction", label: "DEX volume on the chain, 30 days", yard: "shown", types: ["chain"], src: "DefiLlama DEX volumes",
    val: (t) => t.llama?.chain?.dex30 ?? null, show: (v) => fmt.usd(v) },
  { id: "stablesTrend", precision: 1, area: "traction", label: "Stablecoins on the chain, 90-day trend", yard: "fixed", types: ["chain"], src: "DefiLlama stablecoins",
    val: (t) => pctChange(t.llama?.chain?.stables, t.llama?.chain?.stables90), show: (v) => fmt.chg(v),
    extra: (t) => (t.llama?.chain?.stables ? `${fmt.usd(t.llama.chain.stables)} in stablecoins today` : "") },
  { id: "holdersShare", precision: 1, area: "accrual", label: "Share of fees reaching token holders", yard: "fixed", src: "DefiLlama holders revenue",
    val: (t) => { const h = t.llama?.holders?.d30, f = t.llama?.accrualFees?.d30; return h != null && f ? (h / f) * 100 : null; },
    show: (v) => fmt.pct(v, 1),
    extra: (t) => (t.llama?.holders?.d30 != null ? `${fmt.usd(t.llama.holders.d30)} to holders in 30 days (buybacks, burns, staking payouts)` : ""),
    note: "DefiLlama's holders revenue can miss value returned outside the protocol, such as buybacks run by a foundation. A zero here deserves a check of the project's own docs." },
  { id: "treasuryYears", area: "treasury", label: "Treasury outside its own token, in years of revenue", yard: "fixed", src: "DefiLlama treasury",
    val: (t) => { const tr = t.llama?.treasury, r = t.llama?.revenue?.d30; return tr && r ? tr.other / (r * 12) : null; },
    show: (v) => (v >= 100 ? "100+ years" : v.toFixed(1) + " years"),
    extra: (t) => (t.llama?.treasury ? `${fmt.usd(t.llama.treasury.other)} in other assets` : "") },
  { id: "treasuryOwnShare", area: "treasury", label: "Treasury held in its own token", yard: "fixed", src: "DefiLlama treasury",
    val: (t) => { const tr = t.llama?.treasury; return tr && tr.own + tr.other > 0 ? (tr.own / (tr.own + tr.other)) * 100 : null; },
    show: (v) => fmt.pct(v, 0),
    extra: (t) => (t.llama?.treasury ? `${fmt.usd(t.llama.treasury.own)} in ${t.sym}` : ""),
    note: "A treasury mostly in its own token loses value exactly when the project needs it most." },
];
METRICS.push(...BUSINESS_METRICS);

// ---------------------------------------------------------------- valuation against peers (issue #7)
// t.peers = { group, groups } from data/peers.json; FDV is live from CoinGecko, fees and revenue live from DefiLlama.
const VALUATION_METRICS = [
  { id: "feeMultiple", area: "valuation", label: "FDV ÷ yearly fees", yard: "peer", peerKey: "pf", src: "CoinGecko FDV, DefiLlama fees",
    val: (t) => (t.fdv && t.llama?.fees?.d30 ? t.fdv / (t.llama.fees.d30 * 12) : null), show: (v) => fmt.x(v),
    extra: (t) => (t.llama?.fees?.d30 ? `${fmt.usd(t.fdv)} valuation on ${fmt.usd(t.llama.fees.d30 * 12)} of yearly fees` : "") },
  { id: "revenueMultiple", area: "valuation", label: "FDV ÷ yearly revenue", yard: "peer", peerKey: "pr", src: "CoinGecko FDV, DefiLlama revenue",
    val: (t) => (t.fdv && t.llama?.revenue?.d30 ? t.fdv / (t.llama.revenue.d30 * 12) : null), show: (v) => fmt.x(v),
    extra: (t) => (t.llama?.revenue?.d30 ? `${fmt.usd(t.fdv)} valuation on ${fmt.usd(t.llama.revenue.d30 * 12)} of yearly revenue` : "") },
  { id: "mcapToTvl", area: "valuation", label: "Market cap ÷ TVL", yard: "fixed", src: "CoinGecko, DefiLlama TVL",
    unrated: (t) => thinChainTvl(t, () => `Over ${Math.round(100 / HOUSE_RULES.chainTvlMinSharePct)}×`),
    val: (t) => (t.marketCap && t.llama?.tvl?.now ? t.marketCap / t.llama.tvl.now : null), show: (v) => fmt.x(v),
    extra: (t) => (thinChainTvl(t, () => "") ? `Public DeFi deposits ${fmt.usd(t.llama.tvl.now)} vs market cap ${fmt.usd(t.marketCap)}` : tvlFrom(t).replace(/^; /, "")),
    hint: "How much the market pays for each dollar locked in it" },
];
METRICS.push(...VALUATION_METRICS);

// ---------------------------------------------------------------- holders, market health, security (issue #8)
// t.security from site/goplus.js: { chain, home, holderCount, holders: [{percent, contract, locked, tag}], flags: [...] }
// t.defiExtra from data/defi.json: { hacks: [...], audits: { count, links } }
const nativeAsset = (t) => (!Object.keys(t.contracts || {}).length
  ? { display: "Native asset", notApplicable: true, rule: "Not rated: a chain's native coin has no token contract to inspect." } : null);
const notChecked = (t) => nativeAsset(t) || (t.security === undefined ? null
  : !t.security ? { missing: true, display: "Not checked", rule: "GoPlus could not check this token's contract (unsupported chain or no answer)." } : null);
const top10 = (t) => (t.security?.holders?.length ? t.security.holders.reduce((a, h) => a + (h.percent || 0), 0) : null);
const fmtDate = (ts) => new Date(ts * 1000).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });

// "No record" is never "none". When a lookup source has nothing on file for a project, that is
// missing data, not a finding: shown as unknown, never rated, counted as missing for coverage, and
// the page links to free places to check. (A scan that ran and found nothing, like GoPlus, is a finding.)
const notOnRecord = (what) => ({ missing: true, notOnRecord: true, display: "Not in DefiLlama's records",
  rule: `DefiLlama has no ${what} on file for this project. That does not mean there were none: its lists are incomplete, and some entries are filed under the company behind a project. Use the links to check elsewhere.` });
const nameOf = (t) => t.name || t.symbol || t.id || "";
const webSearch = (label, q) => ({ label, url: `https://www.google.com/search?q=${encodeURIComponent(q)}` });

const HOLDER_MARKET_SECURITY = [
  { id: "top10Share", precision: 1, area: "holders", label: "Held by the 10 largest wallets", yard: "fixed", src: "GoPlus",
    unrated: notChecked, val: (t) => top10(t), show: (v) => fmt.pct(v, 1),
    extra: (t) => (t.security?.holders?.length ? `${t.security.chain === "solana" ? "Wallet types not identified on Solana" : `${t.security.holders.filter((h) => h.contract).length} of the 10 are contracts (exchanges, bridges, staking or treasuries)`}${t.security.holderCount ? `; ${fmt.num(t.security.holderCount)} holders in total` : ""}${t.security.home ? "" : " · checked on a bridged copy"}` : ""),
    note: "Large wallets include exchanges, bridges, staking contracts and treasuries, which are not single owners." },
  { id: "volumeToMcap", precision: 1, area: "market", label: "Daily volume ÷ market cap", yard: "fixed", src: "CoinGecko",
    val: (t) => (t.volume24h && t.marketCap ? (t.volume24h / t.marketCap) * 100 : null), show: (v) => fmt.pct(v, 1),
    extra: (t) => (t.volume24h ? `${fmt.usd(t.volume24h)} traded in 24 hours` : "") },
  { id: "athDistance", precision: 0, area: "market", label: "Distance from all-time high", yard: "fixed", src: "CoinGecko",
    val: (t) => t.athChange ?? null, show: (v) => fmt.pct(v, 0),
    note: "Context only, shown in a neutral colour: a big drawdown can mean opportunity or decline." },
  { id: "contractFlags", area: "security", label: "Contract risk flags", yard: "fixed", src: "GoPlus",
    unrated: notChecked, val: (t) => (t.security ? t.security.flags.length : null), show: (v) => (v === 0 ? "None" : `${v} flag${v > 1 ? "s" : ""}`),
    extra: (t) => (t.security?.flags?.length ? t.security.flags.join(" · ") : t.security ? "No owner powers, taxes or honeypot behaviour found" : "") },
  { id: "exploitLoss", area: "security", label: "Past exploits, net loss", yard: "fixed", types: ["defi", "chain"], src: "DefiLlama hacks",
    unrated: (t) => (t.defiExtra && !(t.defiExtra.hacks || []).length ? notOnRecord("exploits") : null),
    val: (t) => (t.defiExtra?.hacks?.length ? t.defiExtra.hacks.reduce((a, h) => a + Math.max(0, h.amount - h.returned), 0) / 1e6 : null),
    show: (v) => (v === 0 ? "$0 net" : fmt.usd(v * 1e6)),
    extra: (t) => { const h = t.defiExtra?.hacks || []; return h.length ? h.slice(0, 3).map((x) => `${x.name}, ${fmtDate(x.date)}${x.cls ? ` (${x.cls})` : ""}${x.returned ? `, ${fmt.usd(x.returned)} returned` : ""}`).join(" · ") : ""; },
    check: (t) => [webSearch("Web search", `${nameOf(t)} crypto exploit hack`), webSearch("Rekt News", `site:rekt.news ${nameOf(t)}`)],
    note: "Rated only when an exploit is on record. An empty record is shown as unknown, not as \"none\": DefiLlama's list misses incidents." },
  { id: "audits", area: "security", label: "Audit reports linked", yard: "shown", types: ["defi", "chain"], src: "DefiLlama",
    unrated: (t) => (t.defiExtra && !t.defiExtra.audits?.count ? notOnRecord("audit reports") : null),
    val: (t) => t.defiExtra?.audits?.count ?? null, show: (v) => String(v),
    check: (t) => [webSearch("Web search", `${nameOf(t)} smart contract audit report`)],
    note: "Shown, never rated: DefiLlama's audit data is patchy (often only on sub-protocols)." },
];
METRICS.push(...HOLDER_MARKET_SECURITY);

// ---------------------------------------------------------------- development, backers and age (issue #9)
// t.meta from data/meta.json: { orgs, dev: { repos, contributors90, commits90, commitsPrev90, bots90 } | null, devAt, raises: [...] }
// t.firstPriceTs from DefiLlama coins /prices/first (live).
const noRepo = (t) => (!t.meta?.orgs?.length
  ? { missing: true, notOnRecord: true, display: "No GitHub link on file", rule: "Neither DefiLlama nor CoinGecko (checked weekly) links a GitHub organisation for this project. It may still have one; use the link to check." }
  : t.meta.devAt && !t.meta.dev ? { missing: true, display: "No public repositories", rule: "Its GitHub organisations have no live public repositories." }
  : !t.meta.devAt ? { missing: true, display: "Not measured yet", rule: "The daily job measures development activity on a weekly rotation; this project is still queued." } : null);

const DEV_BACKERS = [
  { id: "contributors90", area: "dev", label: "Human contributors, last 90 days", yard: "fixed", src: "GitHub",
    unrated: noRepo, val: (t) => t.meta?.dev?.contributors90 ?? null, show: (v) => String(v),
    check: (t) => [{ label: "GitHub search", url: `https://github.com/search?q=${encodeURIComponent(nameOf(t))}&type=users` }],
    extra: (t) => (t.meta?.dev ? `${t.meta.dev.repos.join(", ")}${t.meta.dev.bots90 ? ` · ${t.meta.dev.bots90} bot commits excluded` : ""}` : "") },
  { id: "commitTrend", precision: 1, area: "dev", label: "Commit trend (90 days vs the 90 before)", yard: "fixed", src: "GitHub",
    unrated: noRepo, val: (t) => pctChange(t.meta?.dev?.commits90, t.meta?.dev?.commitsPrev90), show: (v) => fmt.chg(v),
    extra: (t) => (t.meta?.dev ? `${t.meta.dev.commits90} human commits, against ${t.meta.dev.commitsPrev90} before` : "") },
  { id: "raised", area: "backers", label: "Total raised", yard: "shown", types: ["defi", "chain", "narrative"], src: "DefiLlama raises",
    unrated: (t) => (t.meta?.raisesAt && !(t.meta.raises || []).length ? notOnRecord("funding rounds") : null),
    val: (t) => (t.meta?.raises?.length ? t.meta.raises.reduce((a, r) => a + r.amount, 0) : null),
    show: (v) => (v ? fmt.usd(v * 1e6) : "Amount undisclosed"),
    extra: (t) => { const r = t.meta?.raises || []; if (!r.length) return ""; const leads = [...new Set(r.flatMap((x) => x.leads))].slice(0, 4);
      return `${r.length} recorded round${r.length > 1 ? "s" : ""}${leads.length ? ` · Lead investors: ${leads.join(", ")}` : ""}`; },
    check: (t) => [webSearch("Web search", `${nameOf(t)} crypto funding round raised`), webSearch("CryptoRank", `site:cryptorank.io ${nameOf(t)} funding rounds`)],
    note: "Shown, never rated: judging whether an investor is good would be opinion dressed up as a rule." },
  { id: "age", area: "backers", label: "Token age (first traded price)", yard: "shown", types: ["defi", "chain", "narrative"], src: "DefiLlama coins",
    val: (t) => (t.firstPriceTs ? (Date.now() / 1000 - t.firstPriceTs) / (365 * 86400) : null),
    show: (v) => (v < 1 ? `${Math.max(1, Math.round(v * 12))} months` : `${v.toFixed(1)} years`),
    note: "The age of the current token, not the project: a migrated token (LEND → AAVE) restarts the clock." },
];
METRICS.push(...DEV_BACKERS);

// ---------------------------------------------------------------- attention (issue #24)
// t.attention = { trending: { days, of } | null, watch: watchlist users now (live CoinGecko), change: { pct, from, since, days } | null }
// A proxy for social interest, not Twitter data. Only the trend is rated: big coins always win on level.
const noHistory = (what) => ({ missing: true, display: "Not enough history yet",
  rule: `The daily job started recording ${what} in October 2026; this appears once enough days are recorded.` });

const ATTENTION = [
  { id: "trendingDays", area: "attention", label: "Days in CoinGecko's trending searches (last 30)", yard: "shown", src: "CoinGecko trending",
    unrated: (t) => (!t.attention?.trending ? noHistory("trending searches") : null),
    val: (t) => t.attention?.trending?.days ?? null,
    show: (v) => (v === 1 ? "1 day" : `${v} days`),
    extra: (t) => { const x = t.attention?.trending; return x ? `out of ${x.of} recorded day${x.of > 1 ? "s" : ""}; the list is checked once a day` : ""; },
    note: "A spike in searches often comes with hype; it is shown, not rated." },
  { id: "watchlist", area: "attention", label: "CoinGecko watchlist users", yard: "shown", src: "CoinGecko",
    val: (t) => t.attention?.watch ?? null, show: (v) => fmt.num(v),
    note: "The level mostly reflects how big and old a coin is, so it is shown, not rated." },
  { id: "watchTrend", precision: 1, area: "attention", label: "Watchlist users, change over ~30 days", yard: "fixed", src: "CoinGecko",
    unrated: (t) => (t.attention?.watch && !t.attention?.change ? noHistory("watchlist counts") : null),
    val: (t) => t.attention?.change?.pct ?? null, show: (v) => fmt.chg(v),
    extra: (t) => { const c = t.attention?.change; return c ? `${fmt.num(c.from)} → ${fmt.num(t.attention.watch)} since ${c.since}` : ""; } },
];
METRICS.push(...ATTENTION);

// ---------------------------------------------------------------- stale DefiLlama series (issue #32)
// A fee or revenue series that stopped updating more than 3 days ago is unknown, not current: every
// metric built on it says since when, unrated and counted as missing.
const STALE_SERIES = { fees30: ["fees"], revenue30: ["revenue"], feesTrend: ["fees"], revenueTrend: ["revenue"],
  holdersShare: ["holders", "accrualFees"], treasuryYears: ["revenue"], feeMultiple: ["fees"], revenueMultiple: ["revenue"] };
const SERIES_NAME = { fees: "fees", revenue: "revenue", holders: "holders revenue", accrualFees: "fees" };
function staleSkip(t, keys) {
  const k = keys.find((key) => t.llama?.[key]?.stale);
  if (!k) return null;
  const since = fmtDay(t.llama[k].stale);
  return { missing: true, display: `Not updated since ${since}`,
    rule: `DefiLlama's ${SERIES_NAME[k]} figures for this project stopped updating on ${since}, so older figures aren't shown as current.` };
}
for (const m of METRICS) {
  const keys = STALE_SERIES[m.id];
  if (!keys) continue;
  const own = m.unrated;
  m.unrated = (t) => staleSkip(t, keys) || (own ? own(t) : null);
}

// ---------------------------------------------------------------- rating
export function levelFromBands(v, bands) {
  let i = 0;
  while (i < bands.length && v >= bands[i]) i++;
  return i + 1; // 1..5
}

// favour: -2..+2. Magnitude (the word) and favourability (the colour) are separate:
// a "very high" FDV ÷ market cap is bad, a "very high" circulating share is good.
export function favourOf(level, dir) {
  return dir === "up" ? level - 3 : dir === "down" ? 3 - level : 0;
}

export function ruleText(m, rule) {
  const b = rule.bands.map((x) => m.show(x));
  const good = rule.dir === "up" ? "higher is better" : rule.dir === "down" ? "lower is better" : "context only";
  return `House rule (${good}): very low < ${b[0]} ≤ low < ${b[1]} ≤ neutral < ${b[2]} ≤ high < ${b[3]} ≤ very high`;
}

export function rate(m, token, rules) {
  const skip = m.unrated ? m.unrated(token) : null;
  const raw = skip ? null : m.val(token);
  // Rate at the precision shown, so a value can never display on one side of a band edge and rate on the other.
  const v = raw != null && m.precision != null ? Number(raw.toFixed(m.precision)) : raw;
  const out = { id: m.id, area: m.area, label: m.label, src: m.src, value: v,
    display: skip ? skip.display : v == null ? "No data" : m.show(v), extra: m.extra ? m.extra(token) : "", hint: m.hint || "", // hint: a fixed definition, shown in the tooltip
    level: null, word: null, favour: 0, rule: "", unrated: !!skip, missing: Boolean(skip?.missing), notOnRecord: Boolean(skip?.notOnRecord), notApplicable: Boolean(skip?.notApplicable), check: [] };
  // Free places to check by hand, offered only where the source has nothing.
  if ((skip?.notOnRecord || (!skip && v == null)) && m.check) out.check = m.check(token);
  if (skip) { out.rule = skip.rule; return out; }
  if (v == null) { out.rule = "The source returned no data for this token."; return out; }
  if (m.yard === "shown") { out.rule = "Shown for context, deliberately not rated."; return out; }
  const rule = rules.metrics[m.id];
  if (!rule) throw new Error(`No house rule for metric "${m.id}"`);
  if (m.yard === "peer") {
    const p = peerPercentile(v, token.peers?.group, token.peers?.groups || {}, m.peerKey, token.peers?.secondary);
    if (!p) { out.rule = "No peer benchmarks available for this token yet."; return out; }
    out.level = p.level;
    out.word = LEVELS[p.level - 1];
    out.favour = favourOf(p.level, rule.dir);
    out.peer = { ...p, key: m.peerKey };
    out.rule = `Peer rule: percentile among ${p.n} ${p.group}${p.fellBack ? ` (its own category, ${token.peers?.group || "unknown"}, has fewer than 8 peers)` : " peers"}. Cheaper than ${p.cheaperThan}% of them. Bottom 20% of the group = very low … top 20% = very high; lower is cheaper.`;
    return out;
  }
  out.level = levelFromBands(v, rule.bands);
  out.word = LEVELS[out.level - 1];
  out.favour = favourOf(out.level, rule.dir);
  out.rule = ruleText(m, rule);
  out.scale = { dir: rule.dir, cuts: rule.bands.map((x) => m.show(x)) }; // drawn as a five-step scale on the page
  return out;
}

// Coverage badge: share of the applicable metrics that have data (decision 10).
// Memecoins are always "Market data only": fundamentals do not apply to them.
export function coverageOf(rows, type) {
  // "Not tracked" (missing) counts as no data; "Uncapped" or "None scheduled" are real answers.
  // Attention is a proxy, not a fundamental, so it doesn't count towards coverage.
  rows = rows.filter((r) => r.area !== "attention");
  const share = rows.length ? rows.filter((r) => r.value != null || (r.unrated && !r.missing)).length / rows.length : 0;
  const level = type === "meme" ? "Market data only" : share >= 0.8 ? "Full" : share >= 0.45 ? "Partial" : "Market data only";
  return { level, share: Math.round(share * 100) };
}

export function analyse(token, rules, { type = "narrative", alsoDefi = false } = {}) {
  const areas = areasFor(type, alsoDefi);
  const rows = METRICS.filter((m) => areas.includes(m.area) && (!m.types || m.types.includes(type) || (alsoDefi && m.types.includes("defi"))))
    .map((m) => rate(m, token, rules));
  const byArea = {};
  for (const a of AREAS.filter((x) => areas.includes(x.id))) {
    const rs = rows.filter((r) => r.area === a.id);
    if (!rs.length) continue; // area applies but has no metrics yet
    const rated = rs.filter((r) => r.level != null);
    const avg = rated.length ? rated.reduce((s, r) => s + r.favour, 0) / rated.length : null;
    byArea[a.id] = { id: a.id, name: a.name, rows: rs, avg, word: areaWord(avg, rs) };
  }
  return { rows, byArea, areas, coverage: coverageOf(rows, type) };
}

export function areaWord(avg, rows = []) {
  if (avg == null) return rows.some((r) => r.value != null || (r.unrated && !r.missing)) ? "Shown only" : "No data";
  return avg >= 1 ? "Strong" : avg >= 0.34 ? "Good" : avg > -0.34 ? "Mixed" : avg > -1 ? "Weak" : "Poor";
}

// Tone class for colour: g2/g1 good, n neutral, b1/b2 bad.
export const tone = (f) => (f >= 2 ? "g2" : f >= 1 ? "g1" : f <= -2 ? "b2" : f <= -1 ? "b1" : "n");
// Tone for an area verdict from its average favour (same cut-offs as areaWord).
export const areaTone = (avg) => (avg == null ? "n" : avg >= 1 ? "g2" : avg >= 0.34 ? "g1" : avg > -0.34 ? "n" : avg > -1 ? "b1" : "b2");
