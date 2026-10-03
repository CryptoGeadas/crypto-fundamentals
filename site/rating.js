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
  const v = skip ? null : m.val(token);
  const out = { id: m.id, area: m.area, label: m.label, src: m.src, value: v,
    display: skip ? skip.display : v == null ? "No data" : m.show(v), extra: m.extra ? m.extra(token) : "",
    level: null, word: null, favour: 0, rule: "", unrated: !!skip };
  if (skip) { out.rule = skip.rule; return out; }
  if (v == null) { out.rule = "The source returned no data for this token."; return out; }
  if (m.yard === "shown") { out.rule = "Shown for context, deliberately not rated."; return out; }
  const rule = rules.metrics[m.id];
  if (!rule) throw new Error(`No house rule for metric "${m.id}"`);
  out.level = levelFromBands(v, rule.bands);
  out.word = LEVELS[out.level - 1];
  out.favour = favourOf(out.level, rule.dir);
  out.rule = ruleText(m, rule);
  return out;
}

// Coverage badge: share of the applicable metrics that have data (decision 10).
// Memecoins are always "Market data only": fundamentals do not apply to them.
export function coverageOf(rows, type) {
  const share = rows.length ? rows.filter((r) => r.value != null || r.unrated).length / rows.length : 0;
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
  if (avg == null) return rows.some((r) => r.value != null || r.unrated) ? "Shown only" : "No data";
  return avg >= 1 ? "Strong" : avg >= 0.34 ? "Good" : avg > -0.34 ? "Mixed" : avg > -1 ? "Weak" : "Poor";
}

// Tone class for colour: g2/g1 good, n neutral, b1/b2 bad.
export const tone = (f) => (f >= 2 ? "g2" : f >= 1 ? "g1" : f <= -2 ? "b2" : f <= -1 ? "b1" : "n");
// Tone for an area verdict from its average favour (same cut-offs as areaWord).
export const areaTone = (avg) => (avg == null ? "n" : avg >= 1 ? "g2" : avg >= 0.34 ? "g1" : avg > -0.34 ? "n" : avg > -1 ? "b1" : "b2");
