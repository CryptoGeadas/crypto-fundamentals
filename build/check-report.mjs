// Fixture checks for the run report: sanity checks, status merging and alert decisions.
// Run: node build/check-report.mjs   (exit code 1 on any failure)

import assert from "node:assert/strict";
import { Report, sanityCheck, decideAlert, alertBody } from "./report.mjs";

const results = [];
const check = (name, fn) => { try { fn(); results.push(["PASS", name]); } catch (e) { results.push(["FAIL", `${name} — ${e.message}`]); } };

check("sanity: a normal day passes", () => {
  assert.equal(sanityCheck("universe", 640, 639, 300), null);
  assert.equal(sanityCheck("universe", 600, 640, 300), null); // −6% is within the 10% allowed
});
check("sanity: below the minimum is refused", () => {
  assert.match(sanityCheck("universe", 120, 640, 300), /only 120 entries/);
  assert.match(sanityCheck("universe", NaN, 640, 300), /kept the previous data/);
});
check("sanity: a drop of more than 10% is refused", () => {
  assert.match(sanityCheck("idmap", 2500, 2980), /shrank by 16%/);
});
check("sanity: first ever run (no previous data) only needs the minimum", () => {
  assert.equal(sanityCheck("universe", 640, null, 300), null);
});
check("report: warnings degrade a source, errors fail it, and either makes the run unhealthy", () => {
  const r = new Report();
  r.ok("defillama"); r.warn("coingecko", "429, retried"); r.ok("coingecko");
  assert.equal(r.status().sources.coingecko, "degraded");
  assert.equal(r.status().healthy, false);
  r.error("coingecko", "down");
  assert.equal(r.status().sources.coingecko, "failed");
  const clean = new Report(); clean.ok("defillama");
  assert.equal(clean.status().healthy, true);
});
check("report: a kept dataset keeps its last success time from the previous status", () => {
  const r = new Report();
  r.datasets.universe = { status: "kept" };
  const s = r.status({ datasets: { universe: { status: "updated", count: 639, lastSuccess: "2026-10-02T06:00:00Z" } } });
  assert.equal(s.datasets.universe.status, "kept");
  assert.equal(s.datasets.universe.lastSuccess, "2026-10-02T06:00:00Z");
  assert.equal(s.datasets.universe.count, 639);
});
check("alert: problems open an issue, repeat problems comment, a clean run closes", () => {
  assert.equal(decideAlert({ healthy: false }, null), "create");
  assert.equal(decideAlert({ healthy: false }, { number: 9 }), "comment");
  assert.equal(decideAlert({ healthy: true }, { number: 9 }), "close");
  assert.equal(decideAlert({ healthy: true }, null), "none");
});
check("alert body lists every problem and the kept data", () => {
  const body = alertBody({ startedAt: "2026-10-04T06:00:00Z", problems: [
    { level: "error", source: "universe", message: "shrank by 40%" }, { level: "warning", source: "coingecko", message: "429, retried" }],
    datasets: { universe: { status: "kept", lastSuccess: "2026-10-03T06:00:00Z" } } }, "https://example/run/1");
  assert.match(body, /2 problem\(s\)/);
  assert.match(body, /\*\*Error\*\* · universe: shrank by 40%/);
  assert.match(body, /\*\*Warning\*\* · coingecko: 429, retried/);
  assert.match(body, /`universe` kept from/);
  assert.match(body, /Run log: https:\/\/example\/run\/1/);
});

for (const [s, n] of results) console.log(`${s}  ${n}`);
const failed = results.filter(([s]) => s === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
