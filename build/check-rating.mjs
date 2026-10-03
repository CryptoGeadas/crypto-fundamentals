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
const row = (token, id) => analyse(token, HOUSE_RULES).rows.find((r) => r.id === id);

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
check("every rated metric has a house rule, and rules carry the bands", () => {
  for (const m of METRICS.filter((m) => m.yard === "fixed")) {
    const rule = HOUSE_RULES.metrics[m.id];
    assert.ok(rule, `missing rule for ${m.id}`);
    assert.equal(rule.bands.length, 4);
    assert.ok(rate(m, FIXTURES.arbitrum, HOUSE_RULES).rule.includes("House rule"));
  }
});

for (const [s, n] of results) console.log(`${s}  ${n}`);
const failed = results.filter(([s]) => s === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
