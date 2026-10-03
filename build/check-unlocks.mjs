// Fixture checks for unlock parsing, schedule maths and refresh rotation (no network).
// Run: node build/check-unlocks.mjs   (exit code 1 on any failure)

import assert from "node:assert/strict";
import { nextData, summariseOverview, summariseDetail, unlockedAt, detailsToRefresh } from "./unlocks-lib.mjs";

const results = [];
const check = (name, fn) => { try { fn(); results.push(["PASS", name]); } catch (e) { results.push(["FAIL", `${name} — ${e.message}`]); } };
const NOW = Date.UTC(2026, 9, 3) / 1000;
const DAY = 86400;

// Shapes copied from the live pages (3 Oct 2026), trimmed.
const OVERVIEW_ARB = { gecko_id: "arbitrum", protocolSlug: "arbitrum-foundation", circSupply: 7039454056.6, maxSupply: 1e10, totalLocked: 2960545943.4,
  unlocksPerDay: 513285.71, nextEventV2: { date: 1792072833, unlockType: "cliff", amount: 56125000 } };
const OVERVIEW_JUP = { gecko_id: "jupiter-exchange-solana", protocolSlug: "jupiter", circSupply: 3457074114.26, maxSupply: 7e9, totalLocked: 3542925885.74, unlocksPerDay: 0 };

check("nextData extracts the page props, and returns null on a challenge page", () => {
  assert.deepEqual(nextData('<script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"a":1}}}</script>'), { a: 1 });
  assert.equal(nextData("<title>Just a moment...</title>"), null);
});
check("overview keeps only universe tokens, with next event and linear rate", () => {
  const s = summariseOverview([OVERVIEW_ARB, OVERVIEW_JUP, { gecko_id: "not-ours", protocolSlug: "x" }], new Set(["arbitrum", "jupiter-exchange-solana"]));
  assert.deepEqual(Object.keys(s).sort(), ["arbitrum", "jupiter-exchange-solana"]);
  assert.deepEqual(s.arbitrum.next, { ts: 1792072833, amount: 56125000, type: "cliff" });
  assert.equal(s.arbitrum.perDay, 513285.71);
  assert.equal(s["jupiter-exchange-solana"].next, null);
});
check("detail: cumulative schedule kept monthly, upcoming events only in the future", () => {
  const ms = (d) => Date.UTC(2026, 0, d); // DefiLlama rows use millisecond timestamps
  const pp = { emissions: { meta: { maxSupply: 1000 }, datasets: { documented: { dimensions: ["timestamp", "Team", "Investors"],
    source: [[ms(1), 0, 0], [ms(15), 50, 0], [ms(32), 100, 20], [ms(60), 150, 40], [ms(61), 160, 40]] } },
    events: [{ timestamp: NOW - DAY, noOfTokens: [5], category: "insiders", unlockType: "cliff" },
      { timestamp: NOW + 30 * DAY, noOfTokens: [10, 5], category: "privateSale", unlockType: "cliff" }] } };
  const d = summariseDetail(pp, NOW);
  assert.deepEqual(d.cats, ["Team", "Investors"]);
  assert.ok(d.monthly.length < 5, "rows thinned to one per month plus the last");
  assert.deepEqual(d.upcoming, [{ ts: NOW + 30 * DAY, amount: 15, cat: "privateSale", type: "cliff" }]);
  assert.equal(d.maxSupply, 1000);
  assert.equal(summariseDetail({ emissions: {} }, NOW), null);
});
check("unlockedAt interpolates between rows and clamps at both ends", () => {
  const m = [[100, 10, 0], [200, 30, 10], [300, 50, 10]];
  assert.equal(unlockedAt(m, 50), 10);
  assert.equal(unlockedAt(m, 150), 25);       // halfway from 10 to 40
  assert.equal(unlockedAt(m, 999), 60);
  assert.equal(unlockedAt([], 1), null);
});
check("refresh rotation: missing, week-old or passed schedules are due, oldest first, capped", () => {
  const summary = { a: { locked: 1 }, b: { locked: 1 }, c: { locked: 1 }, d: { locked: 0 }, e: { locked: 1 } };
  const iso = (daysAgo) => new Date((NOW - daysAgo * DAY) * 1000).toISOString();
  const stored = {
    b: { generatedAt: iso(8) },                                         // week old → due
    c: { generatedAt: iso(1), upcoming: [{ ts: NOW - 3600 }] },         // next unlock passed → due
    e: { generatedAt: iso(2), upcoming: [{ ts: NOW + DAY }] },          // fresh → not due
  };
  const due = detailsToRefresh(summary, stored, NOW, 10);
  assert.deepEqual(due, ["a", "b", "c"]);                               // a (never fetched) first; d is fully unlocked
  assert.deepEqual(detailsToRefresh(summary, stored, NOW, 2), ["a", "b"]);
});

for (const [s, n] of results) console.log(`${s}  ${n}`);
const failed = results.filter(([s]) => s === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
