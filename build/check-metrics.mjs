// One record per metric (#77). A metric's rule, explanation, principles and stale series live on
// its record in site/rating.js. Its thresholds stay in site/house-rules.js, the one file where the
// house rules are tuned (owner's choice); these checks keep the two in step.
// Run: node build/check-metrics.mjs   (exit code 1 on any failure)

import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { METRICS } from "../site/rating.js";
import { HOUSE_RULES } from "../site/house-rules.js";

const results = [];
const check = async (name, fn) => { try { await fn(); results.push(["PASS", name]); } catch (e) { results.push(["FAIL", `${name} — ${e.message}`]); } };

const SERIES = new Set(["fees", "revenue", "holders", "accrualFees"]);
const PRINCIPLE_NS = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]);

// Every missing or wrong part of a metric record, and of its thresholds.
export function metricProblems(metrics, rules) {
  const out = [];
  for (const m of metrics) {
    const id = m.id ?? "?";
    if (!m.explain?.what || !m.explain?.why) out.push(`${id}: no explanation (explain.what and explain.why)`);
    if (!Array.isArray(m.principles) || m.principles.some((n) => !PRINCIPLE_NS.has(n))) out.push(`${id}: principles must be a list of principle numbers`);
    if (m.stale && (!Array.isArray(m.stale) || m.stale.some((s) => !SERIES.has(s)))) out.push(`${id}: stale names an unknown series`);
    const r = rules.metrics?.[id];
    if (m.yard === "fixed" && !(Array.isArray(r?.bands) && r.bands.length === 4 && r.bands.every((b, i) => i === 0 || b > r.bands[i - 1]))) out.push(`${id}: no four rising thresholds in house-rules.js`);
    if (m.yard === "peer" && r?.peer !== true) out.push(`${id}: no peer rule in house-rules.js`);
    if ((m.yard === "fixed" || m.yard === "peer") && !r?.reason) out.push(`${id}: its house rule has no reason`);
  }
  const ids = new Set(metrics.map((m) => m.id));
  for (const k of Object.keys(rules.metrics ?? {})) if (!ids.has(k)) out.push(`${k}: house-rules.js has thresholds for a metric that does not exist (renamed?)`);
  return out;
}

await check("every metric record is complete, with its thresholds in house-rules.js", () => {
  assert.deepEqual(metricProblems(METRICS, HOUSE_RULES), []);
});

await check("a record without thresholds, explanation or principles fails", () => {
  const ok = { id: "x", yard: "fixed", explain: { what: "w", why: "y" }, principles: [1] };
  const rules = { metrics: { x: { bands: [1, 2, 3, 4], dir: "up", reason: "r" } } };
  assert.deepEqual(metricProblems([ok], rules), []);
  assert.match(metricProblems([ok], { metrics: {} }).join(), /no four rising thresholds/);
  assert.match(metricProblems([{ ...ok, explain: { what: "w" } }], rules).join(), /no explanation/);
  assert.match(metricProblems([{ ...ok, principles: undefined }], rules).join(), /principles must be/);
  assert.match(metricProblems([{ ...ok, id: "y" }], rules).join(), /x: house-rules.js has thresholds for a metric that does not exist/);
  assert.match(metricProblems([{ ...ok, stale: ["feez"] }], rules).join(), /unknown series/);
});

await check("adding or renaming a metric means editing its one record (and its thresholds, when rated)", async () => {
  // no other page file keeps its own per-metric table keyed by metric id
  const ids = METRICS.map((m) => m.id);
  // a table = two or more metric ids used as keys in one file (one shared word, such as a
  // glossary term or a data field named like a metric, is not a table)
  const keyed = new RegExp(`(?:^|[{,])\\s*(${ids.join("|")})\\s*:`, "gm");
  const dir = new URL("../site/", import.meta.url);
  const found = [];
  for (const f of await readdir(dir)) {
    if (!f.endsWith(".js") || f === "rating.js" || f === "house-rules.js") continue;
    const keys = new Set([...(await readFile(new URL(f, dir), "utf8")).matchAll(keyed)].map((m) => m[1]));
    if (keys.size >= 2) found.push(`${f}: ${[...keys].join(", ")}`);
  }
  assert.deepEqual(found, []);
  const rating = await readFile(new URL("rating.js", dir), "utf8");
  assert.ok(!/STALE_SERIES\s*=/.test(rating), "the stale series sit on the records");
});

for (const [s, n] of results) console.log(`${s}  ${n}`);
const failed = results.filter(([s]) => s === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
