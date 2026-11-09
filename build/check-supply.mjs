// Checks for circulating supply growth per year (issue #55, decision D3): the daily supply record,
// the growth figure and how it is rated. Run: node build/check-supply.mjs   (exit code 1 on any failure)

import assert from "node:assert/strict";
import { recordSupply, supplyGrowth, supplyRecord, KEEP_DAYS } from "../site/supply.js";
import { analyse } from "../site/rating.js";
import { HOUSE_RULES } from "../site/house-rules.js";
import { summariseOverview } from "./unlocks-lib.mjs";

const results = [];
const check = (name, fn) => { try { fn(); results.push(["PASS", name]); } catch (e) { results.push(["FAIL", `${name} — ${e.message}`]); } };
const dayN = (n) => new Date(Date.UTC(2026, 9, 1) + n * 86400e3).toISOString().slice(0, 10);   // day 0 = 1 Oct 2026
const row = (t, id) => analyse(t, HOUSE_RULES, { type: "chain" }).rows.find((r) => r.id === id);

check("the daily record keeps one point per token per day, the last 45 days, and skips missing supply", () => {
  let h = {};
  for (let n = 0; n < 60; n++) h = recordSupply(h, { solana: 600e6 + n * 1e5, gone: n < 40 ? 1 : null, zero: 0 }, dayN(n));
  assert.equal(h.solana.length, KEEP_DAYS);
  assert.equal(h.solana[0][0], dayN(60 - KEEP_DAYS));
  assert.equal(h.solana.at(-1)[1], 600e6 + 59 * 1e5);
  assert.ok(!h.zero, "a zero or missing supply is never recorded");
  h = recordSupply(h, { solana: 1 }, dayN(59));
  assert.equal(h.solana.filter(([d]) => d === dayN(59)).length, 1, "a second run on the same day replaces the point");
  assert.ok(h.gone, "a token missing from today's list keeps its history (it may be back tomorrow)");
  assert.ok(h.gone.every(([d]) => d >= dayN(60 - KEEP_DAYS)), "…until its points age past 45 days");
  let late = { old: [[dayN(0), 5]] };
  late = recordSupply(late, { other: 1 }, dayN(50));
  assert.ok(!late.old, "a history whose points are all older than 45 days is dropped");
});
check("a one-day jump of more than 25% (a CoinGecko correction) is not rated as growth", () => {
  const history = [[dayN(0), 600e6], [dayN(10), 601e6], [dayN(11), 900e6], [dayN(30), 901e6]];
  const g = supplyGrowth({ history, now: dayN(30) });
  assert.equal(g.value, null);
  assert.equal(g.jump, true);
  const r = row({ supplyGrowthNow: g }, "supplyGrowth");
  assert.equal(r.level, null);
  assert.match(r.rule, /jumped/);
  assert.equal(r.missing, true);
  const down = supplyGrowth({ history: [[dayN(0), 600e6], [dayN(11), 300e6], [dayN(30), 300e6]], now: dayN(30) });
  assert.equal(down.value, null, "a sudden halving is not 'burning'");
});
check("a record that stopped updating (latest point over 5 days old) is not used", () => {
  const history = [[dayN(0), 600e6], [dayN(30), 605e6]];
  assert.equal(supplyGrowth({ history, now: dayN(36) }), null);
  assert.equal(supplyGrowth({ history, unlocks: { circ: 2, circ30: 1 }, now: dayN(36) }).from, "defillama", "falls back to DefiLlama");
});

check("growth per year from our own 30-day record, annualised; under 28 days of record gives nothing", () => {
  const history = [[dayN(0), 600e6], [dayN(15), 602e6], [dayN(30), 605e6]];
  const g = supplyGrowth({ history, now: dayN(30) });
  assert.equal(g.from, "coingecko");
  assert.equal(g.days, 30);
  assert.equal(Math.round(g.value * 100) / 100, Math.round(((605 / 600 - 1) * 365 / 30) * 10000) / 100);   // ≈ +10.14%
  assert.equal(supplyGrowth({ history: [[dayN(10), 600e6], [dayN(30), 605e6]], now: dayN(30) }), null);
});

check("until the record covers 30 days, DefiLlama's 30-day circulating figure is used; otherwise unknown", () => {
  const g = supplyGrowth({ history: [[dayN(25), 1]], unlocks: { circ: 652.05e6, circ30: 650.38e6 }, now: dayN(30) });
  assert.equal(g.from, "defillama");
  assert.equal(Math.round(g.value * 10) / 10, 3.1);
  assert.equal(supplyGrowth({ history: null, unlocks: { circ: 1, circ30: null }, now: dayN(30) }), null);
  assert.equal(supplyGrowth({}), null);
});

check("the unlock overview keeps DefiLlama's 30-day circulating supply", () => {
  const s = summariseOverview([{ gecko_id: "solana", protocolSlug: "solana", circSupply: 652e6, circSupply30d: 650e6, maxSupply: 723e6 }], new Set(["solana"]));
  assert.equal(s.solana.circ30, 650e6);
});

check("the rating: lower is better, above 5% a year is in the warning bands, burning is good", () => {
  const rule = HOUSE_RULES.metrics.supplyGrowth;
  assert.equal(rule.dir, "down");
  assert.ok(rule.reason && rule.reason.length > 20, "the house rule has a written reason");
  const at = (pct) => row({ supplyGrowthNow: { value: pct, from: "defillama", days: 30 } }, "supplyGrowth");
  assert.ok(at(-2).favour > 0, "a burning token rates as good");
  assert.ok(at(1).favour > 0);
  assert.ok(at(6).favour < 0, "above 5% a year is a warning");
  assert.ok(at(12).favour < 0);
  assert.equal(at(4.2).display, "+4.2% a year");
});

check("too little supply history is unknown, never 0%", () => {
  const r = row({}, "supplyGrowth");
  assert.equal(r.value, null);
  assert.equal(r.level, null);
  assert.notEqual(r.display, "+0.0% a year");
});

check("uncapped tokens: 'No maximum supply' shown under Dilution, FDV ÷ market cap shown without a rating", () => {
  const t = { circulatingSupply: 120e6, totalSupply: 120.5e6, maxSupply: null, marketCap: 400e9, fdv: 401e9, price: 3300 };
  const c = row(t, "circulatingShare"), f = row(t, "fdvToMcap");
  assert.equal(c.display, "No maximum supply");
  assert.equal(c.level, null);
  assert.equal(f.level, null);
  assert.equal(f.display, "1.00×", "the multiple is still shown");
  assert.match(f.rule, /no maximum supply/i);
  const capped = row({ ...t, maxSupply: 200e6 }, "fdvToMcap");
  assert.ok(capped.level != null, "a capped token is still rated");
});

check("the daily job's record: CoinGecko's circulating_supply for universe tokens only, 'started' kept", () => {
  const markets = [{ id: "solana", circulating_supply: 591e6 }, { id: "not-listed", circulating_supply: 5 }, { id: "ethereum", circulating_supply: null }];
  const tokens = [{ id: "solana" }, { id: "ethereum" }];
  const first = supplyRecord({ markets, tokens, prev: null, generated: "2026-11-09T06:20:00Z" });
  assert.deepEqual(first.tokens, { solana: [["2026-11-09", 591e6]] });
  assert.equal(first.started, "2026-11-09");
  assert.equal(first.count, 1);
  const next = supplyRecord({ markets: [{ id: "solana", circulating_supply: 592e6 }], tokens, prev: first, generated: "2026-11-10T06:20:00Z" });
  assert.equal(next.started, "2026-11-09");
  assert.deepEqual(next.tokens.solana, [["2026-11-09", 591e6], ["2026-11-10", 592e6]]);
});
check("band edges: exactly 0% a year rates good; exactly 5% is already a warning", () => {
  const at = (pct) => row({ supplyGrowthNow: { value: pct, from: "defillama", days: 30 } }, "supplyGrowth");
  assert.ok(at(-0.1).favour > 0);
  assert.ok(at(0).favour > 0);
  assert.equal(at(2).favour, 0);
  assert.ok(at(5).favour < 0);
});
check("the Dilution verdict: ETH-like (uncapped, 0% growth) is not flagged; a capped token at 12% a year is", () => {
  const area = (t) => analyse(t, HOUSE_RULES, { type: "chain" }).byArea.dilution.word;
  const eth = { circulatingSupply: 120.7e6, totalSupply: 120.7e6, maxSupply: null, marketCap: 400e9, fdv: 400e9, supplyGrowthNow: { value: 0.1, days: 30, from: "coingecko" } };
  assert.ok(!["Weak", "Poor"].includes(area(eth)), area(eth));
  const capped = { circulatingSupply: 700e6, totalSupply: 1e9, maxSupply: 1e9, marketCap: 7e8, fdv: 1e9, supplyGrowthNow: { value: 12, days: 30, from: "coingecko" } };
  assert.equal(row(capped, "supplyGrowth").word, "Very high");
  assert.ok(row(capped, "supplyGrowth").favour < 0);
});
check("an uncapped token without a total supply figure still gets no FDV ÷ market cap rating", () => {
  const r = row({ circulatingSupply: 1e9, totalSupply: null, maxSupply: null, marketCap: 1e9, fdv: 1e9 }, "fdvToMcap");
  assert.equal(r.level, null);
});

for (const [s, n] of results) console.log(`${s}  ${n}`);
const failed = results.filter(([s]) => s === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
