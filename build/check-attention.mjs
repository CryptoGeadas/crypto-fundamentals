// Proves the attention history logic (site/attention.js) used by the daily job and the page:
// trending days, weekly watchlist rotation, and the ~30-day watchlist change.
//
// Run: node build/check-attention.mjs   (exit code 1 on any failure)

import assert from "node:assert/strict";
import { recordTrending, trendingDays, recordWatch, watchDue, watchChange, dayKey, TRENDING_KEEP_DAYS } from "../site/attention.js";

const results = [];
function check(name, fn) {
  try { fn(); results.push(["PASS", name]); } catch (e) { results.push(["FAIL", name + " — " + e.message]); }
}
const DAY = 86_400_000;
const NOW = Date.parse("2026-10-04T06:00:00Z");
const ago = (d) => NOW - d * DAY;

check("trending: one entry per day, re-recording a day replaces it, old days are dropped", () => {
  let h = {};
  h = recordTrending(h, ["sui", "pengu"], ago(1));
  h = recordTrending(h, ["sui"], NOW);
  h = recordTrending(h, ["tao", "tao"], NOW);
  assert.deepEqual(h[dayKey(NOW)], ["tao"]);
  assert.equal(Object.keys(h).length, 2);
  const old = recordTrending({ "2026-08-01": ["x"] }, ["y"], NOW);
  assert.ok(!("2026-08-01" in old), `kept beyond ${TRENDING_KEEP_DAYS} days`);
});
check("trending days count only the last 30 recorded days; no history is unknown, not zero", () => {
  const h = { [dayKey(ago(40))]: ["sui"], [dayKey(ago(10))]: ["sui"], [dayKey(ago(5))]: ["pengu"], [dayKey(NOW)]: ["sui"] };
  assert.deepEqual(trendingDays("sui", h, NOW), { days: 2, of: 3 });
  assert.deepEqual(trendingDays("btc", h, NOW), { days: 0, of: 3 });
  assert.equal(trendingDays("sui", {}, NOW), null);
});
check("watchlist rotation: never-recorded first, then oldest; recent ones wait a week", () => {
  const w = { a: [[dayKey(ago(8)), 10]], b: [[dayKey(ago(20)), 10]], c: [[dayKey(ago(2)), 10]] };
  assert.deepEqual(watchDue(["a", "b", "c", "d"], w, NOW, 10), ["d", "b", "a"]);
  assert.deepEqual(watchDue(["a", "b", "c", "d"], w, NOW, 2), ["d", "b"]);
});
check("watchlist series: one snapshot per day, very old ones dropped", () => {
  let s = recordWatch([], 100, ago(200));
  s = recordWatch(s, 110, ago(7));
  s = recordWatch(s, 120, NOW);
  s = recordWatch(s, 121, NOW);
  assert.deepEqual(s.map(([, v]) => v), [110, 121]);
});
check("watchlist change uses the snapshot closest to 30 days old, and needs one at least 21 days old", () => {
  const s = [[dayKey(ago(44)), 900], [dayKey(ago(29)), 1000], [dayKey(ago(14)), 1050]];
  const c = watchChange(s, 1100, NOW);
  assert.equal(c.from, 1000);
  assert.equal(Math.round(c.pct), 10);
  assert.equal(watchChange([[dayKey(ago(14)), 1000]], 1100, NOW), null);
  assert.equal(watchChange(s, null, NOW), null);
});

for (const [s, n] of results) console.log(`${s}  ${n}`);
const failed = results.filter(([s]) => s === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
