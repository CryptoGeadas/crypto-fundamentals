// The methodology page must explain everything the dashboard shows (issue #11).
// Fails when a metric, area or referenced glossary term has no explanation.
// Run: node build/check-docs.mjs   (exit code 1 on any failure)

import assert from "node:assert/strict";
import { METRICS, AREAS } from "../site/rating.js";
import { METRIC_EXPLAIN, AREA_INTROS, GLOSSARY, PRINCIPLES, METRIC_PRINCIPLES, principlesFor } from "../site/explain.js";
import { HOUSE_RULES } from "../site/house-rules.js";
import { fdvOf } from "../site/fdv.js";

const results = [];
const check = (name, fn) => { try { fn(); results.push(["PASS", name]); } catch (e) { results.push(["FAIL", `${name} — ${e.message}`]); } };

check("every metric on the dashboard has a plain-language explanation", () => {
  const missing = METRICS.filter((m) => !METRIC_EXPLAIN[m.id]?.what || !METRIC_EXPLAIN[m.id]?.why).map((m) => m.id);
  assert.deepEqual(missing, []);
});
check("no explanation for a metric that does not exist", () => {
  const ids = new Set(METRICS.map((m) => m.id));
  assert.deepEqual(Object.keys(METRIC_EXPLAIN).filter((k) => !ids.has(k)), []);
});
check("every area has an introduction", () => {
  assert.deepEqual(AREAS.filter((a) => !AREA_INTROS[a.id]).map((a) => a.id), []);
});
check("every glossary term a metric links to exists", () => {
  const bad = Object.entries(METRIC_EXPLAIN).flatMap(([id, e]) => (e.terms || []).filter((t) => !GLOSSARY[t]).map((t) => `${id}→${t}`));
  assert.deepEqual(bad, []);
});
check("every glossary entry has a name and a definition", () => {
  assert.deepEqual(Object.entries(GLOSSARY).filter(([, g]) => !g.name || !g.text).map(([k]) => k), []);
});

// #60: the nine rating principles, and proof that the code follows each one that can be checked here.
check("there are nine principles, each with a name and a short text", () => {
  assert.equal(PRINCIPLES.length, 9);
  assert.deepEqual(PRINCIPLES.map((p) => p.n), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(PRINCIPLES.filter((p) => !p.name || !p.text || p.text.length > 320).map((p) => p.n), []);
});
check("metrics link only to principles that exist, and every principle is linked from at least one metric", () => {
  const ids = new Set(METRICS.map((m) => m.id));
  assert.deepEqual(Object.keys(METRIC_PRINCIPLES).filter((k) => !ids.has(k)), [], "unknown metric");
  const used = new Set(METRICS.flatMap((m) => principlesFor(m)));
  assert.deepEqual([...used].filter((n) => !PRINCIPLES.some((p) => p.n === n)), [], "unknown principle");
  assert.deepEqual(PRINCIPLES.map((p) => p.n).filter((n) => !used.has(n)), [], "principle nobody links to");
});
check("principle 3: valuation uses total supply; a higher maximum is not the base", () => {
  assert.equal(fdvOf(2, 1000, 400), 800);
});
check("principle 7: watchlist size and distance from the all-time high are shown, not rated", () => {
  for (const id of ["watchlist", "athDistance"]) {
    assert.equal(METRICS.find((m) => m.id === id).yard, "shown", id);
    assert.equal(HOUSE_RULES.metrics[id], undefined, `${id} has no thresholds`);
    assert.ok(principlesFor(METRICS.find((m) => m.id === id)).includes(7), id);
  }
});
check("principle 8: every threshold is a house rule with a written reason", () => {
  const rated = METRICS.filter((m) => m.yard !== "shown").map((m) => m.id);
  assert.deepEqual(rated.filter((id) => !HOUSE_RULES.metrics[id]), [], "rated metric without a house rule");
  assert.deepEqual(Object.entries(HOUSE_RULES.metrics).filter(([, r]) => !r.reason || r.reason.length < 30).map(([k]) => k), [], "house rule without a reason");
  assert.deepEqual(Object.keys(HOUSE_RULES.metrics).filter((id) => !rated.includes(id)), [], "house rule for a metric that is not rated");
  for (const m of METRICS.filter((x) => x.yard !== "shown")) assert.ok(principlesFor(m).includes(8), m.id);
});
check("principle 9: every rated trend has a minimum base", () => {
  const trends = METRICS.filter((m) => m.yard !== "shown" && /Trend$/.test(m.id));
  assert.ok(trends.length >= 6);
  assert.deepEqual(trends.filter((m) => !m.base || !(HOUSE_RULES.trendFloors[m.id] > 0)).map((m) => m.id), []);
  for (const m of trends) assert.ok(principlesFor(m).includes(9), m.id);
});

for (const [s, n] of results) console.log(`${s}  ${n}`);
const failed = results.filter(([s]) => s === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
