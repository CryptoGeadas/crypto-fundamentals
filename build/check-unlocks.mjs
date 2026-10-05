// Fixture checks for unlock parsing, schedule maths and refresh rotation (no network).
// Run: node build/check-unlocks.mjs   (exit code 1 on any failure)

import assert from "node:assert/strict";
import { summariseOverview, summariseDataset, unlockedAt, detailsToRefresh } from "./unlocks-lib.mjs";

const results = [];
const check = (name, fn) => { try { fn(); results.push(["PASS", name]); } catch (e) { results.push(["FAIL", `${name} — ${e.message}`]); } };
const NOW = Date.UTC(2026, 9, 3) / 1000;
const DAY = 86400;

// Shapes copied from the live pages (3 Oct 2026), trimmed.
const OVERVIEW_ARB = { gecko_id: "arbitrum", protocolSlug: "arbitrum-foundation", circSupply: 7039454056.6, maxSupply: 1e10, totalLocked: 2960545943.4,
  unlocksPerDay: 513285.71, nextEventV2: { date: 1792072833, unlockType: "cliff", amount: 56125000 } };
const OVERVIEW_JUP = { gecko_id: "jupiter-exchange-solana", protocolSlug: "jupiter", circSupply: 3457074114.26, maxSupply: 7e9, totalLocked: 3542925885.74, unlocksPerDay: 0 };

check("overview keeps only universe tokens, with next event and linear rate", () => {
  const s = summariseOverview([OVERVIEW_ARB, OVERVIEW_JUP, { gecko_id: "not-ours", protocolSlug: "x" }], new Set(["arbitrum", "jupiter-exchange-solana"]));
  assert.deepEqual(Object.keys(s).sort(), ["arbitrum", "jupiter-exchange-solana"]);
  assert.deepEqual(s.arbitrum.next, { ts: 1792072833, amount: 56125000, type: "cliff" });
  assert.equal(s.arbitrum.perDay, 513285.71);
  assert.equal(s["jupiter-exchange-solana"].next, null);
});
check("dataset: daily series merged per category, thinned to monthly, only future events kept", () => {
  const day = (d) => Date.UTC(2026, 0, d) / 1000; // datasets use second timestamps
  const e = { supplyMetrics: { maxSupply: 1000 },
    documentedData: { data: [
      { label: "Team", data: [{ timestamp: day(1), unlocked: 0 }, { timestamp: day(15), unlocked: 50 }, { timestamp: day(32), unlocked: 100 }, { timestamp: day(61), unlocked: 160 }] },
      { label: "Investors", data: [{ timestamp: day(1), unlocked: 0 }, { timestamp: day(32), unlocked: 20 }, { timestamp: day(61), unlocked: 40 }] } ] },
    metadata: { events: [{ timestamp: NOW - DAY, noOfTokens: [5], category: "insiders", unlockType: "cliff" },
      { timestamp: NOW + 30 * DAY, noOfTokens: [10, 5], category: "privateSale", unlockType: "cliff" }] } };
  const d = summariseDataset(e, NOW);
  assert.deepEqual(d.cats, ["Team", "Investors"]);
  assert.deepEqual(d.monthly.map((r) => r[0]), [day(1), day(32), day(61)]);   // Jan 15 dropped (same month)
  assert.deepEqual(d.monthly[1], [day(32), 100, 20]);
  assert.deepEqual(d.upcoming, [{ ts: NOW + 30 * DAY, amount: 15, cat: "privateSale", type: "cliff" }]);
  assert.equal(d.maxSupply, 1000);
  assert.equal(d.tbd, 0);
  assert.equal(summariseDataset({ ...e, supplyMetrics: { maxSupply: 1000, tbdAmount: 612 } }, NOW).tbd, 612);   // HYPE-like (#42)
  assert.equal(summariseDataset({ documentedData: { data: [] } }, NOW), null);
});
check("dataset: a category with no point on a date carries its last value forward", () => {
  const e = { documentedData: { data: [
    { label: "A", data: [{ timestamp: 100, unlocked: 10 }, { timestamp: 200, unlocked: 20 }] },
    { label: "B", data: [{ timestamp: 100, unlocked: 5 }] } ] }, metadata: {} };
  const d = summariseDataset(e, 0);
  assert.deepEqual(d.monthly[d.monthly.length - 1], [200, 20, 5]);
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
