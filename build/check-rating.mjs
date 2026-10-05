// Proves the shared rating module (site/rating.js) runs in Node and gives the expected
// ratings. The browser imports the very same file, so a pass here means the page and
// any Node consumer (AI Insights, later) agree on every number.
//
// Run: node build/check-rating.mjs   (exit code 1 on any failure)

import assert from "node:assert/strict";
import { analyse, rate, levelFromBands, favourOf, METRICS, fmt } from "../site/rating.js";
import { HOUSE_RULES } from "../site/house-rules.js";

// Fixtures use real values from the 1 Oct 2026 prototype snapshot, rounded.
const FIXTURES = {
  arbitrum: { circulatingSupply: 7_038_427_362, maxSupply: 10e9, totalSupply: 10e9, marketCap: 1.36e9, fdv: 2.01e9 },
  jupiter: { circulatingSupply: 3.3e9, maxSupply: 10e9, totalSupply: 7e9, marketCap: 1.09e9, fdv: 2.26e9 },
  pepe: { circulatingSupply: 420_690e9, maxSupply: 420_690e9, totalSupply: 420_690e9, marketCap: 1.87e9, fdv: 1.87e9 },
  uncapped: { circulatingSupply: 120.7e6, maxSupply: null, totalSupply: 120.7e6, marketCap: 400e9, fdv: 400e9 },
  missing: { circulatingSupply: null, maxSupply: null, totalSupply: null, marketCap: 1e9, fdv: null },
};

const results = [];
function check(name, fn) {
  try { fn(); results.push(["PASS", name]); } catch (e) { results.push(["FAIL", name + " — " + e.message]); }
}
// DeFi has every area, so every metric is reachable from this helper.
const row = (token, id, type = "defi") => analyse(token, HOUSE_RULES, { type }).rows.find((r) => r.id === id);

check("band edges: a value equal to a cut-off moves up a level", () => {
  assert.equal(levelFromBands(29.9, [30, 50, 70, 90]), 1);
  assert.equal(levelFromBands(30, [30, 50, 70, 90]), 2);
  assert.equal(levelFromBands(50, [30, 50, 70, 90]), 3);
  assert.equal(levelFromBands(95, [30, 50, 70, 90]), 5);
});
check("favour: direction flips colour, not magnitude", () => {
  assert.equal(favourOf(5, "up"), 2);
  assert.equal(favourOf(5, "down"), -2);
  assert.equal(favourOf(5, "none"), 0);
});
check("ARB: 70% circulating = High (good), FDV/MCap 1.48× = Low (good)", () => {
  assert.equal(row(FIXTURES.arbitrum, "circulatingShare").word, "High");
  assert.equal(row(FIXTURES.arbitrum, "circulatingShare").favour, 1);
  assert.equal(row(FIXTURES.arbitrum, "fdvToMcap").word, "Low");
  assert.equal(row(FIXTURES.arbitrum, "fdvToMcap").favour, 1);
  assert.equal(analyse(FIXTURES.arbitrum, HOUSE_RULES).byArea.dilution.word, "Strong");
});
check("JUP: 33% circulating = Low (bad), FDV/MCap 2.07× = High (bad), area Poor", () => {
  assert.equal(row(FIXTURES.jupiter, "circulatingShare").word, "Low");
  assert.equal(row(FIXTURES.jupiter, "fdvToMcap").word, "High");
  assert.equal(row(FIXTURES.jupiter, "fdvToMcap").favour, -1);
  assert.equal(analyse(FIXTURES.jupiter, HOUSE_RULES).byArea.dilution.word, "Poor");
});
check("PEPE: fully circulating, FDV = MCap → both very good", () => {
  assert.equal(row(FIXTURES.pepe, "circulatingShare").word, "Very high");
  assert.equal(row(FIXTURES.pepe, "fdvToMcap").word, "Very low");
  assert.equal(analyse(FIXTURES.pepe, HOUSE_RULES).byArea.dilution.word, "Strong");
});
check("uncapped token: circulating share is shown as 'Uncapped supply', never rated", () => {
  const r = row(FIXTURES.uncapped, "circulatingShare");
  assert.equal(r.display, "Uncapped supply");
  assert.equal(r.level, null);
  assert.equal(r.unrated, true);
  assert.match(r.extra, /no max cap/);
  assert.match(r.rule, /Not rated/);
});
check("prices keep their digits; totals are abbreviated", () => {
  assert.equal(fmt.price(2734.125), "$2,734.13");
  assert.equal(fmt.price(0.2011), "$0.201");
  assert.equal(fmt.price(1.16e-7), "$0.000000116");
  assert.equal(fmt.price(4.45e-6), "$0.00000445");
  assert.equal(fmt.usd(0.5), "$0.500");
  assert.equal(fmt.usd(327.93e9), "$327.93B");
});
check("missing data renders 'No data', never a rating", () => {
  for (const id of ["circulatingShare", "fdvToMcap"]) {
    const r = row(FIXTURES.missing, id);
    assert.equal(r.display, "No data");
    assert.equal(r.level, null);
    assert.equal(r.word, null);
  }
  assert.equal(analyse(FIXTURES.missing, HOUSE_RULES).byArea.dilution.word, "No data");
});
check("display never rounds a value onto the band edge it sits below", () => {
  const r = row({ ...FIXTURES.arbitrum, fdv: 1.47 * 1.36e9 }, "fdvToMcap");
  assert.equal(r.word, "Low");
  assert.equal(r.display, "1.47×");
  const c = row({ ...FIXTURES.arbitrum, circulatingSupply: 6.96e9 }, "circulatingShare");
  assert.equal(c.word, "Neutral");
  assert.equal(c.display, "69.6%");
});
// Unlock fixtures shaped like the live DefiLlama data (3 Oct 2026).
const NOW = Date.now() / 1000, Y = 365 * 86400;
const ARB_U = { circ: 7.04e9, max: 1e10, perDay: 513285, next: { ts: NOW + 12 * 86400, amount: 56.125e6, type: "cliff" },
  detail: { cats: ["Team", "Investors"], monthly: [[NOW - Y, 6.0e9, 0.8e9], [NOW, 6.2e9, 0.84e9], [NOW + Y, 6.8e9, 1.2e9]] } };
const JUP_U = { circ: 3.457e9, max: 7e9, perDay: 0, next: null,
  detail: { cats: ["Airdrop"], monthly: [[NOW - 2 * Y, 3.0e9], [NOW - 0.2 * Y, 3.457e9]] } };
const withU = (base, u, extra = {}) => ({ ...base, unlocks: u, sym: "X", price: 0.2, volume24h: 2.3e8, ...extra });

check("unlocks (#12 spot-check): unpublished amounts, continuous emissions, uncapped tokens, two circulating figures", () => {
  // Solana-like: uncapped, next event has no amount, schedule built on a modelled max.
  const sol = withU({ circulatingSupply: 588e6, totalSupply: 635e6, maxSupply: null, marketCap: 7e10, fdv: 7.7e10 },
    { circ: 650e6, max: 722.7e6, perDay: 0, next: { ts: NOW + 7 * 86400, amount: null, type: "linear" },
      detail: { monthly: [[NOW - Y, 630e6], [NOW, 650e6], [NOW + Y, 669.3e6]] } });
  const ns = row(sol, "nextUnlockShare");
  assert.equal(ns.display, "Amount not published");
  assert.equal(ns.level, null);
  assert.equal(ns.missing, true);
  assert.match(ns.extra, /^Linear unlock on /);
  assert.equal(row(sol, "nextUnlockVsVolume").display, "Amount not published");
  assert.equal(row(sol, "lockedBeyond12m").display, "Uncapped supply");
  assert.equal(row(sol, "lockedBeyond12m").level, null);
  assert.match(row(sol, "unlocks12m").display, /of circulating \(vesting only\)$/);
  assert.equal(row(sol, "unlocks12m").level, null);
  // Spark-like: no discrete event, ~821K a day; DefiLlama circulating 18% above CoinGecko's.
  const spk = withU({ circulatingSupply: 3.42e9, totalSupply: 1e10, maxSupply: 1e10, marketCap: 8.4e7, fdv: 2.47e8 },
    { circ: 4.03e9, max: 1e10, perDay: 821142, next: null, detail: { monthly: [[NOW, 4.03e9], [NOW + Y, 4.33e9]] } }, { price: 0.0247, volume24h: 7.2e6 });
  const c = row(spk, "nextUnlockShare");
  assert.equal(c.display, "Continuous");
  assert.equal(c.level, null);
  assert.equal(c.missing, false);
  assert.match(c.extra, /^About 821\.1K X a day, 0\.020% of circulating/);
  assert.match(row(spk, "nextUnlockVsVolume").extra, /^About \$20\.3K a day unlocking/);
  assert.match(row(spk, "unlocks12m").extra, /DefiLlama's circulating 4\.03B \(CoinGecko counts 3\.42B\)/);
  assert.ok(row(spk, "unlocks12m").level != null, "capped tokens keep their 12-month rating");
});
check("unlocks (ARB-like): next unlock 0.80% = Low, vs volume Very low, 12m 13.6% = High (bad), locked beyond 20% = Low", () => {
  const t = withU(FIXTURES.arbitrum, ARB_U);
  assert.equal(row(t, "nextUnlockShare").word, "Low");
  assert.equal(row(t, "nextUnlockVsVolume").word, "Very low");
  assert.equal(row(t, "unlocks12m").display, "13.6% of circulating");
  assert.equal(row(t, "unlocks12m").word, "High");
  assert.equal(row(t, "unlocks12m").favour, -1);
  assert.equal(row(t, "lockedBeyond12m").word, "Low");
});
check("unlocks (JUP-like): nothing scheduled is NOT rated as good; locked-beyond-12m catches the risk; area no better than Mixed", () => {
  const t = withU(FIXTURES.jupiter, JUP_U);
  assert.equal(row(t, "nextUnlockShare").display, "None scheduled");
  assert.equal(row(t, "nextUnlockShare").level, null);
  assert.equal(row(t, "unlocks12m").value, 0);
  assert.equal(row(t, "lockedBeyond12m").display, "50.6% of max supply");
  assert.equal(row(t, "lockedBeyond12m").word, "High");
  assert.ok(["Mixed", "Weak", "Poor"].includes(analyse(t, HOUSE_RULES).byArea.dilution.word));
});
check("unlocks: a token DefiLlama does not track says 'Not tracked' and counts as missing for coverage", () => {
  const t = withU(FIXTURES.pepe, null);
  for (const id of ["nextUnlockShare", "nextUnlockVsVolume", "unlocks12m", "lockedBeyond12m"]) assert.equal(row(t, id).display, "Not tracked");
  const a = analyse(t, HOUSE_RULES, { type: "defi" });
  assert.ok(a.coverage.share < 100);
});
// Business fixtures shaped like live DefiLlama numbers (3 Oct 2026), rounded.
const LLAMA_AAVE = { fees: { d30: 37.2e6, prev: 38.7e6, monthly: [] }, revenue: { d30: 5.06e6, prev: 4.9e6 }, holders: { d30: 0, prev: 0 },
  accrualFees: { d30: 37.2e6 }, tvl: { now: 19.3e9, prev: 15.0e9 }, chain: null, treasury: { own: 97.9e6, other: 34.6e6 } };
const LLAMA_HYPE = { fees: null, revenue: null, holders: { d30: 56.4e6 }, accrualFees: { d30: 62.0e6 }, tvl: null, chain: null, treasury: null };
const SECURITY = { chain: "ethereum", home: true, holderCount: 189239, holders: Array.from({ length: 10 }, (_, i) => ({ percent: [15.6, 5.1, 4, 3, 2, 2, 1.5, 1.2, 1, 1][i], contract: i < 6 })), flags: ["Upgradeable (proxy) contract"] };
const full = (extra) => withU(FIXTURES.arbitrum, ARB_U, { llama: { ...LLAMA_AAVE, chain: { dex30: 6.09e9, stables: 3.2e9, stables90: 3.0e9 } },
  contracts: { ethereum: "0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9" }, security: SECURITY, volume24h: 2.3e8, athChange: -74,
  meta: { orgs: ["aave", "aave-dao"], dev: { repos: ["aave-dao/seatbelt-gov-v3"], contributors90: 11, commits90: 120, commitsPrev90: 80, bots90: 2580 }, devAt: "2026-10-03T00:00:00Z",
    raises: [{ date: 1594771200, round: "Private", amount: 3, leads: ["Framework Ventures", "3AC"] }, { date: 1600000000, round: "Seed", amount: 4.5, leads: ["ParaFi"] }], raisesAt: "2026-10-03T00:00:00Z" },
  firstPriceTs: Date.now() / 1000 - 6 * 365 * 86400,
  attention: { trending: { days: 3, of: 30 }, watch: 12000, change: { pct: 2.4, from: 11720, since: "2026-09-04", days: 30 } },
  defiExtra: { hacks: [{ date: 1773273600, name: "Aave V3", amount: 862000, returned: 862000 }, { date: 1724803200, name: "Aave", amount: 56000, returned: 0 }], audits: { count: 3 } }, ...extra });

check("traction: trends are rated at display precision; fees and revenue are shown, not rated", () => {
  const t = withU(FIXTURES.arbitrum, null, { llama: LLAMA_AAVE });
  assert.equal(row(t, "feesTrend").display, "-3.9%");
  assert.equal(row(t, "feesTrend").word, "Neutral");
  assert.equal(row(t, "tvlTrend").word, "Very high");
  assert.equal(row(t, "fees30").level, null);
  const edge = withU(FIXTURES.arbitrum, null, { llama: { ...LLAMA_AAVE, fees: { d30: 109.96, prev: 100 } } });
  assert.equal(row(edge, "feesTrend").display, "+10.0%");
  assert.equal(row(edge, "feesTrend").word, "High");   // rated as the +10.0% it shows, not 9.96%
});
check("value accrual: Aave's 0% is rated very low with the buyback caveat; Hyperliquid's 91% is very high", () => {
  const a = row(withU(FIXTURES.arbitrum, null, { llama: LLAMA_AAVE }), "holdersShare");
  assert.equal(a.word, "Very low");
  assert.equal(a.favour, -2);
  const h = row(withU(FIXTURES.arbitrum, null, { llama: LLAMA_HYPE }), "holdersShare");
  assert.equal(h.display, "91.0%");
  assert.equal(h.word, "Very high");
});
check("treasury: years of revenue outside its own token, and own-token share", () => {
  const t = withU(FIXTURES.arbitrum, null, { llama: LLAMA_AAVE });
  assert.equal(row(t, "treasuryYears").display, "0.6 years");
  assert.equal(row(t, "treasuryYears").word, "Low");
  assert.equal(row(t, "treasuryOwnShare").display, "74%");
  assert.equal(row(t, "treasuryOwnShare").word, "High");
  assert.equal(row(t, "treasuryOwnShare").favour, -1);
});
check("value accrual only applies to DeFi, or to a chain whose protocol earns fees", () => {
  const ids = (o) => analyse(full(), HOUSE_RULES, o).rows.map((r) => r.id);
  assert.ok(ids({ type: "defi" }).includes("holdersShare"));
  assert.ok(!ids({ type: "chain" }).includes("holdersShare"));
  assert.ok(ids({ type: "chain", alsoDefi: true }).includes("holdersShare"));
  assert.ok(ids({ type: "chain" }).includes("stablesTrend") && !ids({ type: "defi" }).includes("stablesTrend"));
});
check("holders: top-10 share rated (36.4% = Neutral); native assets and unchecked tokens are not rated", () => {
  assert.equal(row(full(), "top10Share").display, "36.4%");
  assert.equal(row(full(), "top10Share").word, "Neutral");
  const native = row(full({ contracts: {} }), "top10Share");
  assert.equal(native.display, "Native asset");
  assert.equal(native.missing, false);
  const failed = row(full({ security: null }), "top10Share");
  assert.equal(failed.display, "Not checked");
  assert.equal(failed.missing, true);
});
check("security: flags counted (1 = Low), exploit loss is net of returned funds", () => {
  assert.equal(row(full(), "contractFlags").word, "Low");
  assert.equal(row(full({ security: { ...SECURITY, flags: [] } }), "contractFlags").display, "None");
  const ex = row(full(), "exploitLoss");
  assert.equal(row(full({ defiExtra: { hacks: [{ date: 1, name: "X", amount: 5, returned: 5 }], audits: null } }), "exploitLoss").display, "$0 net");
  assert.equal(ex.value, 0.056);                 // $862K returned in full; $56K not
  assert.equal(ex.word, "Low");
  assert.equal(row(full(), "audits").level, null);
});
check("market: distance from ATH uses the neutral colour whatever its level", () => {
  const r = row(full(), "athDistance");
  assert.equal(r.word, "Low");
  assert.equal(r.favour, 0);
  assert.equal(row(full(), "volumeToMcap").display, "16.9%");
});
check("development: human contributors and commit trend; queued or repo-less projects are missing, not rated", () => {
  assert.equal(row(full(), "contributors90").word, "High");
  assert.match(row(full(), "contributors90").extra, /2580 bot commits excluded/);
  assert.equal(row(full(), "commitTrend").display, "+50.0%");
  assert.equal(row(full(), "commitTrend").word, "Very high");
  const queued = row(full({ meta: { orgs: ["x"] } }), "contributors90");
  assert.equal(queued.display, "Not measured yet");
  assert.equal(queued.missing, true);
  assert.equal(row(full({ meta: { orgs: [] } }), "contributors90").display, "No GitHub link on file");
});
check("backers and age are shown, never rated", () => {
  const r = row(full(), "raised");
  assert.equal(r.display, "$7.5M");
  assert.equal(r.level, null);
  assert.match(r.extra, /Framework Ventures/);
  assert.equal(row(full(), "age").display, "6.0 years");
  assert.equal(row(full({ firstPriceTs: Date.now() / 1000 - 0.4 * 365 * 86400 }), "age").display, "5 months");
});
check("no record is never 'none': empty lookups are unknown, unrated, missing, and offer links to check", () => {
  const empty = full({ name: "Canton", meta: { orgs: [], raises: [], raisesAt: "2026-10-03T00:00:00Z" }, defiExtra: { hacks: [], audits: null } });
  for (const id of ["raised", "exploitLoss", "audits", "contributors90"]) {
    const r = row(empty, id);
    assert.equal(r.notOnRecord, true, id);
    assert.equal(r.missing, true, id);
    assert.equal(r.level, null, id);
    assert.doesNotMatch(r.display, /^(None|0$)/, id);
    assert.ok(r.check.length && r.check.every((c) => c.url.startsWith("https://") && c.url.includes("Canton")), id);
  }
  // Rows that do have a value never carry the links.
  assert.deepEqual(row(full(), "raised").check, []);
  // Across every metric, "None…" is only allowed where a check actually ran (GoPlus scan) or a tracked schedule is empty.
  const allowed = new Set(["contractFlags"]);
  for (const r of analyse(full({ meta: { orgs: [], raises: [], raisesAt: "x" }, defiExtra: { hacks: [], audits: null }, security: { ...SECURITY, flags: [] } }), HOUSE_RULES, { type: "defi" }).rows)
    if (/^None/.test(r.display) && r.display !== "None scheduled") assert.ok(allowed.has(r.id), `${r.id} shows "${r.display}"`);
  // Rounds on record with no disclosed amount are a real record, not "none".
  assert.equal(row(full({ meta: { orgs: [], raises: [{ date: 1, round: "Seed", amount: 0, leads: [] }], raisesAt: "x" } }), "raised").display, "Amount undisclosed");
});
check("attention: only the watchlist trend is rated; levels are shown; missing history is unknown, not zero", () => {
  assert.equal(row(full(), "watchTrend").display, "+2.4%");
  assert.equal(row(full(), "watchTrend").word, "High");
  assert.equal(row(full(), "watchlist").level, null);
  assert.equal(row(full(), "trendingDays").display, "3 days");
  assert.equal(row(full(), "trendingDays").level, null);
  const fresh = full({ attention: { trending: null, watch: 12000, change: null } });
  for (const id of ["trendingDays", "watchTrend"]) {
    assert.equal(row(fresh, id).display, "Not enough history yet", id);
    assert.equal(row(fresh, id).missing, true, id);
  }
  // A memecoin gets the attention area too, and attention never moves the coverage badge.
  assert.ok(analyse(full(), HOUSE_RULES, { type: "meme" }).byArea.attention);
  const a = analyse(full(), HOUSE_RULES, { type: "defi" }), b = analyse(fresh, HOUSE_RULES, { type: "defi" });
  assert.equal(a.coverage.share, b.coverage.share);
});
check("FDV ÷ market cap uses the page's own FDV and names CoinGecko's figure when they differ (#29, #31)", () => {
  const stg = { circulatingSupply: 120.7e6, totalSupply: 120.8e6, maxSupply: 1e9, marketCap: 21e6, fdv: 174e6, fdvCoinGecko: 21.02e6 };
  const r = row(stg, "fdvToMcap");
  assert.equal(r.display, "8.29×");
  assert.match(r.extra, /FDV here = price × max supply; CoinGecko shows \$21\.0M$/);
  assert.doesNotMatch(row({ ...stg, fdvCoinGecko: 174e6 }, "fdvToMcap").extra, /CoinGecko shows/);
  // Uncapped with a junk CoinGecko FDV (Snowbank-like): the page's price × total supply is used and named.
  const junk = row({ circulatingSupply: 15e9, totalSupply: 15e9, maxSupply: null, marketCap: 34.5e6, fdv: 34.5e6, fdvCoinGecko: 3.45e22 }, "fdvToMcap");
  assert.equal(junk.display, "1.00×");
  assert.match(junk.extra, /price × total supply; CoinGecko shows/);
});
check("stale DefiLlama series: every metric built on it says since when, unrated and missing (#32)", () => {
  const sep6 = Date.UTC(2026, 8, 6) / 1000;
  const t = full({ llama: { ...LLAMA_AAVE, fees: { d30: null, prev: null, stale: sep6 }, accrualFees: { d30: null, prev: null, stale: sep6 } } });
  for (const id of ["fees30", "feesTrend", "feeMultiple", "holdersShare"]) {
    const r = row(t, id);
    assert.equal(r.display, "Not updated since 6 Sept 2026", id);
    assert.equal(r.level, null, id);
    assert.equal(r.missing, true, id);
  }
  assert.equal(row(t, "revenue30").display, "$5.1M", "revenue is its own series and stays current");
});
check("chain TVL is rated only when public DeFi is at least 1% of market cap; DeFi protocols always (#38)", () => {
  const chain = (tvl, mcap) => full({ marketCap: mcap, llama: { ...LLAMA_AAVE, tvl: { now: tvl, prev: tvl / 1.037, chain: true } } });
  const canton = chain(8.4e6, 4.96e9);                               // 591×: public DeFi misses Canton's settlement business
  assert.equal(row(canton, "mcapToTvl").display, "Over 100×");
  assert.equal(row(canton, "mcapToTvl").level, null);
  assert.equal(row(canton, "mcapToTvl").missing, false);
  assert.match(row(canton, "mcapToTvl").extra, /Public DeFi deposits \$8\.4M vs market cap \$4\.96B/);
  assert.equal(row(canton, "tvlTrend").display, "+3.7%");
  assert.equal(row(canton, "tvlTrend").level, null);
  assert.equal(row(chain(0, 1e9), "mcapToTvl").display, "Over 100×", "a chain with no DeFi at all");
  const eth = chain(53.4e9, 328e9);                                    // 6.1×: rated as before
  assert.ok(row(eth, "mcapToTvl").level != null);
  assert.ok(row(eth, "tvlTrend").level != null);
  const protocol = full({ marketCap: 4.96e9, llama: { ...LLAMA_AAVE, tvl: { now: 8.4e6, prev: 8.1e6 } } });   // same ratio, but a protocol
  assert.ok(row(protocol, "mcapToTvl").level != null);
});
check("every rated metric has a house rule, and rules carry the bands", () => {
  for (const m of METRICS.filter((m) => m.yard === "fixed")) {
    const rule = HOUSE_RULES.metrics[m.id];
    assert.ok(rule, `missing rule for ${m.id}`);
    assert.equal(rule.bands.length, 4);
    assert.ok(rate(m, full(), HOUSE_RULES).rule.includes("House rule"), m.id);
  }
});

for (const [s, n] of results) console.log(`${s}  ${n}`);
const failed = results.filter(([s]) => s === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
