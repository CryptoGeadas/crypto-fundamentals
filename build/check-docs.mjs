// The methodology page must explain everything the dashboard shows (issue #11).
// Fails when a metric, area or referenced glossary term has no explanation.
// Run: node build/check-docs.mjs   (exit code 1 on any failure)

import assert from "node:assert/strict";
import { METRICS, AREAS } from "../site/rating.js";
import { METRIC_EXPLAIN, AREA_INTROS, GLOSSARY } from "../site/explain.js";

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

for (const [s, n] of results) console.log(`${s}  ${n}`);
const failed = results.filter(([s]) => s === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
