// Proves the live DefiLlama fee windows (site/llama.js): "last 30 days" is always 30 published days,
// anchored to the latest data point, whatever the clock says.
//
// Run: node build/check-llama.mjs   (exit code 1 on any failure)

import assert from "node:assert/strict";
import { feeWindows, hasStablecoinChart, loadLlama } from "../site/llama.js";

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

// #71: no request for a stablecoin chart DefiLlama does not have (a 404 the browser logs as an error).
check("a chain is asked for its stablecoin chart only when DefiLlama lists stablecoins on it", () => {
  const list = [{ name: "Ethereum" }, { name: "Hyperliquid L1" }];
  assert.equal(hasStablecoinChart(list, "Ethereum"), true);
  assert.equal(hasStablecoinChart(list, "hyperliquid l1"), true);
  assert.equal(hasStablecoinChart(list, "Bitcoin"), false);
  assert.equal(hasStablecoinChart(null, "Bitcoin"), true, "list unreadable: let the chart request decide");
});
async function checkAsync(name, fn) {
  try { await fn(); results.push(["PASS", name]); } catch (e) { results.push(["FAIL", name + " — " + e.message]); }
}
const withFetch = async (routes, run) => {
  const asked = [], real = globalThis.fetch;
  globalThis.fetch = async (url) => {
    asked.push(String(url));
    const hit = Object.entries(routes).find(([k]) => String(url).includes(k));
    return hit ? { ok: true, status: 200, json: async () => hit[1] } : { ok: false, status: 404, json: async () => ({}) };
  };
  try { return { out: await run(), asked }; } finally { globalThis.fetch = real; }
};
const t0 = 1_800_000_000, oneDay = 86400;
const stChart = [{ date: String(t0 - 100 * oneDay), totalCirculatingUSD: { peggedUSD: 80 } }, { date: String(t0 - oneDay), totalCirculatingUSD: { peggedUSD: 100 } }];
await checkAsync("Bitcoin: the chart is never requested, and stablecoins read as no data, never zero", async () => {
  const { out, asked } = await withFetch({ stablecoinchains: [{ name: "Ethereum" }] }, () => loadLlama("bitcoin", { c: "Bitcoin" }, null, { type: "chain" }, t0));
  assert.ok(asked.some((u) => u.includes("stablecoinchains")));
  assert.deepEqual(asked.filter((u) => u.includes("stablecoincharts")), []);
  assert.equal(out.chain.stables, null);
  assert.equal(out.chain.stables90, null);
  assert.equal(out.failed, false, "no stablecoins is not a failed source");
});
await checkAsync("Ethereum: listed, so the chart is requested and read as before", async () => {
  const { out, asked } = await withFetch({ stablecoinchains: [{ name: "Ethereum" }], "stablecoincharts/Ethereum": stChart }, () => loadLlama("ethereum", { c: "Ethereum" }, null, { type: "chain" }, t0));
  assert.equal(asked.filter((u) => u.includes("stablecoincharts/Ethereum")).length, 1);
  assert.equal(out.chain.stables, 100);
  assert.equal(out.chain.stables90, 80);
});
await checkAsync("the list cannot be read: the chart is still requested", async () => {
  const { out, asked } = await withFetch({ "stablecoincharts/Ethereum": stChart }, () => loadLlama("ethereum", { c: "Ethereum" }, null, { type: "chain" }, t0));
  assert.equal(asked.filter((u) => u.includes("stablecoincharts/Ethereum")).length, 1);
  assert.equal(out.chain.stables, 100);
});

for (const [s, n] of results) console.log(`${s}  ${n}`);
const failed = results.filter(([s]) => s === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
