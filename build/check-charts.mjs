// The fees chart must survive months where DefiLlama reports negative fees or revenue (issue #61).
// A negative month must never produce a negative bar height or a bar outside the chart,
// and its tooltip must still show the real negative amount.
// Run: node build/check-charts.mjs   (exit code 1 on any failure)

import assert from "node:assert/strict";
import { feesChart } from "../site/charts.js";
import { readdirSync, readFileSync } from "node:fs";
import { esc, fmt } from "../site/format.js";
import { fmt as ratingFmt } from "../site/rating.js";

const results = [];
const check = (name, fn) => { try { fn(); results.push(["PASS", name]); } catch (e) { results.push(["FAIL", `${name} — ${e.message}`]); } };

const H = 190;
const rects = (svg) => [...svg.matchAll(/<rect x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)" class="([^"]+)"><title>([^<]*)<\/title>/g)]
  .map((m) => ({ x: +m[1], y: +m[2], width: +m[3], height: +m[4], cls: m[5], title: m[6] }));
const inside = (r) => r.height >= 0 && r.y >= 0 && r.y + r.height <= H;

const fees = [{ m: "2026-08", v: 5_000_000 }, { m: "2026-09", v: 4_000_000 }, { m: "2026-10", v: 6_000_000 }];

check("a month with negative revenue draws no negative height and stays inside the chart", () => {
  const svg = feesChart(fees, [{ m: "2026-08", v: 1_000_000 }, { m: "2026-09", v: -1_700_000 }, { m: "2026-10", v: 2_000_000 }], { h: H });
  const all = rects(svg);
  assert.equal(all.length, 6);
  assert.deepEqual(all.filter((r) => !inside(r)), []);
});
check("a month with negative fees draws no negative height and stays inside the chart", () => {
  const svg = feesChart([{ m: "2026-08", v: 5_000_000 }, { m: "2026-09", v: -300_000 }], [{ m: "2026-08", v: 1_000_000 }, { m: "2026-09", v: -900_000 }], { h: H });
  const all = rects(svg);
  assert.equal(all.length, 4);
  assert.deepEqual(all.filter((r) => !inside(r)), []);
});
check("every month negative: still no negative height, no NaN", () => {
  const svg = feesChart([{ m: "2026-08", v: -5 }, { m: "2026-09", v: -7 }], [{ m: "2026-08", v: -1 }], { h: H });
  assert.ok(!/NaN|Infinity/.test(svg));
  assert.deepEqual(rects(svg).filter((r) => !inside(r)), []);
});
check("the tooltip shows the real negative revenue", () => {
  const svg = feesChart(fees, [{ m: "2026-09", v: -1_700_000 }], { h: H });
  const bar = rects(svg).find((r) => r.title.startsWith("2026-09 revenue"));
  assert.equal(bar.title, "2026-09 revenue -$1.7M");
});
check("the tooltip shows the real negative fees", () => {
  const svg = feesChart([{ m: "2026-08", v: 5_000_000 }, { m: "2026-09", v: -300_000 }], [], { h: H });
  const bar = rects(svg).find((r) => r.title.startsWith("2026-09 fees"));
  assert.equal(bar.title, "2026-09 fees -$300.0K");
});
check("a negative month can be hovered: its bar has a small visible height at the axis", () => {
  const svg = feesChart(fees, [{ m: "2026-09", v: -1_700_000 }], { h: H });
  const bar = rects(svg).find((r) => r.title.startsWith("2026-09 revenue"));
  assert.ok(bar.height > 0 && bar.height <= 3, `height ${bar.height}`);
  assert.equal(bar.y + bar.height, H - 22);
});
check("positive months are drawn exactly as before", () => {
  const svg = feesChart(fees, [{ m: "2026-10", v: 3_000_000 }], { h: H });
  const all = rects(svg);
  const top = all.find((r) => r.title === "2026-10 fees $6.0M");
  assert.equal(top.height, 150); // tallest bar fills the plot: 190 - 22 - 18
  assert.equal(top.y, 18);
  assert.equal(all.find((r) => r.title === "2026-10 revenue $3.0M").height, 75);
  assert.equal(all.find((r) => r.title === "2026-08 revenue $0").height, 0);
});

// #75: one HTML escape and one money formatter for the whole page.
check("the HTML escape and the money formatter are each defined once, in format.js", () => {
  const dir = new URL("../site/", import.meta.url);
  const copies = readdirSync(dir).filter((f) => f.endsWith(".js") && f !== "format.js").filter((f) => {
    const text = readFileSync(new URL(f, dir), "utf8");
    return /const esc\s*=|function esc\(|"&amp;"/.test(text) || /const fmtUsd|const fmtNum|\/ 1e9\)\.toFixed/.test(text);
  });
  assert.deepEqual(copies, []);
  assert.equal(ratingFmt, fmt, "rating.js hands on the same formatter object");
  assert.equal(esc(`<a href="x">Tom & 'Jerry'</a>`), "&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;");
  assert.equal(esc(null), "");
});
check("money totals: abbreviated, a negative carries its sign in front, unknown is a dash", () => {
  assert.deepEqual([2.5e12, 1.234e9, 5.67e6, 4321, 12.5, -1.7e6, -300_000, null, NaN].map(fmt.usd),
    ["$2.50T", "$1.23B", "$5.7M", "$4.3K", "$12.50", "-$1.7M", "-$300.0K", "—", "—"]);
});

for (const [s, n] of results) console.log(`${s}  ${n}`);
const failed = results.filter(([s]) => s === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
