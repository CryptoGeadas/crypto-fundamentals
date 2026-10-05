// Proves the live DefiLlama fee windows (site/llama.js): "last 30 days" is always 30 published days,
// anchored to the latest data point, whatever the clock says.
//
// Run: node build/check-llama.mjs   (exit code 1 on any failure)

import assert from "node:assert/strict";
import { feeWindows } from "../site/llama.js";

const results = [];
function check(name, fn) {
  try { fn(); results.push(["PASS", name]); } catch (e) { results.push(["FAIL", name + " — " + e.message]); }
}
const DAY = 86400;
const START = Date.UTC(2026, 4, 1) / 1000;
// 160 daily points worth 1 each, stamped at the start of each UTC day.
const chart = Array.from({ length: 160 }, (_, i) => [START + i * DAY, 1]);
const AFTER = START + 160 * DAY + 3600;             // an hour after the last point's day ended

check("last 30 days = the 30 latest published days (not 29 when today isn't out yet)", () => {
  assert.equal(feeWindows(chart, AFTER).d30, 30);
  assert.equal(feeWindows(chart, AFTER).prev, 30);
});
check("the comparison window ends 90 days before the latest window ends", () => {
  const marked = chart.map(([t, v], i) => [t, i >= 160 - 120 && i < 160 - 90 ? 2 : v]);
  assert.equal(feeWindows(marked, AFTER).prev, 60);
});
check("today's unfinished day is left out; the window ends at the last complete day", () => {
  const withToday = [...chart, [START + 160 * DAY, 0.3]];
  assert.equal(feeWindows(withToday, AFTER).d30, 30);
});
check("stale only on DefiLlama's own signal or after 14 days; batch publishers a few days behind are current (#41)", () => {
  const lastEnd = START + 160 * DAY;
  assert.equal(feeWindows(chart, lastEnd + DAY + 3600).d30, 30);                          // a day late: current, no note
  assert.equal(feeWindows(chart, lastEnd + DAY + 3600).through, undefined);
  const batch = feeWindows(chart, lastEnd + 6 * DAY);                                     // Canton-like: 6 days behind
  assert.equal(batch.d30, 30);
  assert.equal(batch.through, START + 159 * DAY);
  assert.equal(feeWindows(chart, lastEnd + 15 * DAY).stale, START + 159 * DAY);           // over 14 days: stale
  const quiet = feeWindows(chart, lastEnd + DAY + 3600, { reportsLatestDay: false });     // Chutes-like: no latest day
  assert.equal(quiet.d30, null);
  assert.equal(quiet.stale, START + 159 * DAY);
});
check("a gap in the data is summed as reported, never stretched", () => {
  const gappy = chart.filter((_, i) => i !== 150);
  assert.equal(feeWindows(gappy, AFTER).d30, 29);
});
check("no data: null, never zero", () => {
  assert.deepEqual(feeWindows([]), { d30: null, prev: null });
});

for (const [s, n] of results) console.log(`${s}  ${n}`);
const failed = results.filter(([s]) => s === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
