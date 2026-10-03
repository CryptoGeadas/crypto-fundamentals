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
  { id: "treasury", name: "Treasury" },
  { id: "security", name: "Security" },
  { id: "dev", name: "Development" },
  { id: "backers", name: "Backers & age" },
];

// Which areas apply to each token type (decision 2 and the PRD metric set).
export const AREAS_BY_TYPE = {
  defi: ["valuation", "traction", "accrual", "dilution", "holders", "market", "treasury", "security", "dev", "backers"],
  chain: ["valuation", "traction", "dilution", "holders", "market", "treasury", "security", "dev", "backers"],
  narrative: ["dilution", "holders", "market", "security", "dev", "backers"],
  meme: ["dilution", "holders", "market", "security"],
};

// Areas a token actually gets: its type's areas, plus value accrual for a chain whose
// protocol side earns fees (decision 14).
export function areasFor(type, alsoDefi = false) {
  const base = AREAS_BY_TYPE[type] || AREAS_BY_TYPE.narrative;
  return alsoDefi && !base.includes("accrual") ? AREAS.map((a) => a.id).filter((id) => base.includes(id) || id === "accrual") : base;
}

import { peerPercentile } from "./peers.js";

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
  x: (v) => (v == null || !Number.isFinite(v) ? "—" : (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)) + "×"),
  chg: (v) => (v == null || !Number.isFinite(v) ? "—" : (v > 0 ? "+" : "") + v.toFixed(1) + "%"),
};

// ---------------------------------------------------------------- metric definitions
// yard: "fixed" (house-rule bands) | "shown" (context, never rated).
// val(token) returns a number, or null when the source has no data.
export const METRICS = [
  {
    id: "circulatingShare",
    area: "dilution",
    label: "Circulating share of eventual supply",
    yard: "fixed",
    src: "CoinGecko",
    // Without a max cap, circulating ÷ today's total is ~100% by construction and says nothing
    // about future dilution, so the metric is shown as "Uncapped supply" and never rated.
    unrated: (t) => (!t.maxSupply && t.totalSupply
      ? { display: "Uncapped supply", rule: "Not rated: with no maximum supply, the share of today's total that circulates is always close to 100% and says nothing about future dilution. Issuance rate matters instead." }
      : null),
    val: (t) => (t.circulatingSupply && t.maxSupply ? Math.min(100, (t.circulatingSupply / t.maxSupply) * 100) : null),
    show: (v) => fmt.pct(v, 1),
    extra: (t) => (t.maxSupply ? `of ${fmt.num(t.maxSupply)} max supply` : t.totalSupply ? `${fmt.num(t.totalSupply)} in existence today, no max cap` : ""),
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
const noneScheduled = (t) => noSchedule(t) || (!nextEvent(t.unlocks)
  ? { display: "None scheduled", rule: "Not rated: no unlock is scheduled. That alone is not good news when supply is still locked; see \"Locked supply not unlocking within 12 months\"." }
  : null);

const UNLOCK_METRICS = [
  {
    id: "nextUnlockShare", area: "dilution", label: "Next unlock, % of circulating", yard: "fixed", src: "DefiLlama unlock page",
    unrated: noneScheduled,
    val: (t) => { const n = nextEvent(t.unlocks); const c = t.unlocks?.circ; return n && c ? (n.amount / c) * 100 : null; },
    show: (v) => fmt.pct(v, 2),
    extra: (t) => { const n = nextEvent(t.unlocks); return n ? `${fmt.num(n.amount)} ${t.sym} on ${fmtDay(n.ts)} (${n.type})` : ""; },
  },
  {
    id: "nextUnlockVsVolume", area: "dilution", label: "Next unlock vs daily volume", yard: "fixed", src: "DefiLlama unlock page, CoinGecko",
    unrated: noneScheduled,
    val: (t) => { const n = nextEvent(t.unlocks); return n && t.volume24h && t.price ? (n.amount * t.price) / t.volume24h : null; },
    show: (v) => fmt.x(v),
    extra: (t) => { const n = nextEvent(t.unlocks); return n && t.price ? `${fmt.usd(n.amount * t.price)} unlocking vs ${fmt.usd(t.volume24h)} traded in 24h` : ""; },
  },
  {
    id: "unlocks12m", area: "dilution", label: "Unlocks due in the next 12 months", yard: "fixed", src: "DefiLlama unlock page",
    unrated: noSchedule,
    val: (t) => { const a = unlocks12mAmount(t.unlocks); const c = t.unlocks?.circ; return a != null && c ? (a / c) * 100 : null; },
    show: (v) => fmt.pct(v, 1) + " of circulating",
    extra: (t) => { const a = unlocks12mAmount(t.unlocks); return a != null ? `${fmt.num(a)} ${t.sym} on the published schedule` : t.unlocks ? "Full schedule not fetched yet" : ""; },
  },
  {
    id: "lockedBeyond12m", area: "dilution", label: "Locked supply not unlocking within 12 months", yard: "fixed", src: "DefiLlama unlock page",
    unrated: noSchedule,
    val: (t) => {
      const u = t.unlocks, a = unlocks12mAmount(u), max = u?.max || u?.detail?.maxSupply;
      return a != null && max && u.circ != null ? Math.max(0, ((max - u.circ - a) / max) * 100) : null;
    },
    show: (v) => fmt.pct(v, 1) + " of max supply",
    extra: () => "Neither circulating nor scheduled within a year: either unlocks later, or has no published schedule",
  },
];
METRICS.push(...UNLOCK_METRICS);

// ---------------------------------------------------------------- traction, value accrual, treasury (issue #6)
// t.llama comes from site/llama.js: { fees, revenue, holders, accrualFees: {d30, prev, monthly}, tvl: {now, prev},
// chain: {dex30, stables, stables90}, treasury: {own, other} }; any piece may be null.
export const pctChange = (now, before) => (now != null && before ? (now / before - 1) * 100 : null);

const BUSINESS_METRICS = [
  { id: "fees30", area: "traction", label: "Fees, last 30 days", yard: "shown", src: "DefiLlama fees",
    val: (t) => t.llama?.fees?.d30 ?? null, show: (v) => fmt.usd(v),
    extra: (t) => (t.llama?.feesFrom === "protocol"
      ? `From the protocol, the business behind the token${t.llama.chainFees?.d30 != null ? `; the chain itself earned ${fmt.usd(t.llama.chainFees.d30)} in gas fees` : ""}` : "") },
  { id: "revenue30", area: "traction", label: "Revenue, last 30 days", yard: "shown", src: "DefiLlama revenue",
    val: (t) => t.llama?.revenue?.d30 ?? null, show: (v) => fmt.usd(v),
    extra: () => "The part of fees the protocol or chain keeps, rather than paying out to liquidity providers or validators" },
  { id: "feesTrend", precision: 1, area: "traction", label: "Fees trend", yard: "fixed", src: "DefiLlama fees",
    val: (t) => pctChange(t.llama?.fees?.d30, t.llama?.fees?.prev), show: (v) => fmt.chg(v),
    extra: () => "Last 30 days against the 30 days ending 90 days earlier" },
  { id: "revenueTrend", precision: 1, area: "traction", label: "Revenue trend", yard: "fixed", src: "DefiLlama revenue",
    val: (t) => pctChange(t.llama?.revenue?.d30, t.llama?.revenue?.prev), show: (v) => fmt.chg(v),
    extra: () => "Last 30 days against the 30 days ending 90 days earlier" },
  { id: "tvlTrend", precision: 1, area: "traction", label: "TVL trend (30 days)", yard: "fixed", src: "DefiLlama TVL",
    val: (t) => pctChange(t.llama?.tvl?.now, t.llama?.tvl?.prev), show: (v) => fmt.chg(v),
    extra: (t) => (t.llama?.tvl?.now ? `${fmt.usd(t.llama.tvl.now)} locked today` : "") },
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
    val: (t) => (t.marketCap && t.llama?.tvl?.now ? t.marketCap / t.llama.tvl.now : null), show: (v) => fmt.x(v),
    extra: () => "How much the market pays for each dollar locked in it" },
];
METRICS.push(...VALUATION_METRICS);

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
    display: skip ? skip.display : v == null ? "No data" : m.show(v), extra: m.extra ? m.extra(token) : "",
    level: null, word: null, favour: 0, rule: "", unrated: !!skip, missing: Boolean(skip?.missing) };
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
    out.peer = p;
    out.rule = `Peer rule: percentile among ${p.n} ${p.group}${p.fellBack ? ` (its own category, ${token.peers?.group || "unknown"}, has fewer than 8 peers)` : " peers"}. Cheaper than ${p.cheaperThan}% of them. Bottom 20% of the group = very low … top 20% = very high; lower is cheaper.`;
    return out;
  }
  out.level = levelFromBands(v, rule.bands);
  out.word = LEVELS[out.level - 1];
  out.favour = favourOf(out.level, rule.dir);
  out.rule = ruleText(m, rule);
  return out;
}

// Coverage badge: share of the applicable metrics that have data (decision 10).
// Memecoins are always "Market data only": fundamentals do not apply to them.
export function coverageOf(rows, type) {
  // "Not tracked" (missing) counts as no data; "Uncapped" or "None scheduled" are real answers.
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
