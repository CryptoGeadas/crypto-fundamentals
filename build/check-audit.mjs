// Proves the self-audit comparisons and the "Data drift" issue rules (build/audit-lib.mjs, issue #28).
//
// Run: node build/check-audit.mjs   (exit code 1 on any failure)

import assert from "node:assert/strict";
import { coingeckoDrift, supplyDrift, feeDrift, tvlDrift, rotate, decideDrift, driftBody, keyOf, TOL } from "./audit-lib.mjs";
import { fdvOf } from "../site/fdv.js";

const results = [];
function check(name, fn) {
  try { fn(); results.push(["PASS", name]); } catch (e) { results.push(["FAIL", name + " — " + e.message]); }
}

check("CoinGecko: consistent rows pass; market cap, FDV and supply contradictions are flagged", () => {
  const ok = { id: "aave", current_price: 180, market_cap: 2.778e9, circulating_supply: 15.435e6, fully_diluted_valuation: 2.88e9, max_supply: 16e6, total_supply: 16e6 };
  assert.deepEqual(coingeckoDrift(ok), []);
  assert.deepEqual(coingeckoDrift({ ...ok, market_cap: 2.0e9 }).map((x) => x.check), ["mcap"]);
  assert.deepEqual(coingeckoDrift({ ...ok, fully_diluted_valuation: 4e9 }).map((x) => x.check), ["fdv"]);
  // Stargate-like: FDV = price × total supply while max supply is 8× higher → a definition lead, not a contradiction.
  const stg = { id: "stargate-finance", current_price: 0.174, market_cap: 21e6, circulating_supply: 120.7e6, total_supply: 120.8e6, max_supply: 1e9, fully_diluted_valuation: 21.02e6 };
  assert.deepEqual(coingeckoDrift(stg).map((x) => x.check), ["fdvTotal"]);
  assert.deepEqual(coingeckoDrift({ ...ok, circulating_supply: 17e6, market_cap: 180 * 17e6 }).map((x) => x.check), ["supply"]);
  // #36: the page's own FDV must stay plausible (junk max supply → absurd FDV).
  assert.ok(coingeckoDrift({ ...ok, total_supply: 1e15, max_supply: null, fully_diluted_valuation: 2.88e9 }).map((x) => x.check).includes("pageFdv"));
  // Uncapped: FDV is checked against total supply.
  assert.deepEqual(coingeckoDrift({ ...ok, max_supply: null, total_supply: 16e6 }), []);
  assert.deepEqual(coingeckoDrift({ id: "x", current_price: 0 }), []);
});
check("supply, fees and TVL comparisons use their own tolerances", () => {
  assert.equal(supplyDrift("spark-2", 4.03e9, 3.42e9).length, 0);           // 18% apart: within 25%
  assert.equal(supplyDrift("x", 5e9, 3e9).length, 1);
  assert.equal(feeDrift("solana", 25.987e6, 25.987e6).length, 0);
  assert.equal(feeDrift("solana", 25.456e6, 25.987e6).length, 1);           // the old 29-day window (#25) is caught
  assert.equal(tvlDrift("spark-2", 7.24e9, 7.25e9).length, 0);
  assert.equal(tvlDrift("spark-2", 9.64e9, 7.25e9).length, 1);              // the old double count (#25) is caught
  assert.equal(feeDrift("x", 5, 0).length, 0, "no published figure: nothing to compare");
  assert.ok(TOL.fees < TOL.tvl && TOL.tvl < TOL.supply);
});
check("info-only items stay in the data but never open, comment on or keep open the issue (#29)", () => {
  const info = [{ check: "circulating", id: "spark-2", detail: "d" }, { check: "fdvTotal", id: "stargate-finance", detail: "d" }];
  assert.equal(decideDrift(info, [], null), "none");
  assert.equal(decideDrift(info, [], { number: 3 }), "close");
  const body = driftBody([...info, { check: "tvl", id: "x", detail: "d" }]);
  assert.match(body, /1 item\(s\) outside tolerance/);
  assert.match(body, /2 informational item/);
  assert.doesNotMatch(body, /stargate-finance/);
});
check("FDV is price × total supply, else × max; CoinGecko's FDV never used (#31, #39)", () => {
  assert.equal(fdvOf(0.174, 1e9, 120.8e6), 0.174 * 120.8e6); // Stargate: total supply (the gap to max was burned) (#39)
  assert.equal(fdvOf(870, 200e6, 133.2e6), 870 * 133.2e6);    // BNB: burned supply never counts
  assert.equal(fdvOf(121.5, null, 635.2e6), 121.5 * 635.2e6); // Solana: uncapped → price × total
  assert.equal(fdvOf(0.0023, null, 15e9), 0.0023 * 15e9); // Snowbank-style: CoinGecko's junk FDV never enters
  assert.equal(fdvOf(null, 1e9, 5e6), null);
  assert.equal(fdvOf(1, null, null), null);
});
check("rotation continues where it stopped, wraps, and covers everything", () => {
  const ids = ["e", "a", "d", "c", "b"];
  const r1 = rotate(ids, 0, 2), r2 = rotate(ids, r1.next, 2), r3 = rotate(ids, r2.next, 2);
  assert.deepEqual([...r1.pick, ...r2.pick, ...r3.pick], ["a", "b", "c", "d", "e", "a"]);
  assert.deepEqual(rotate([], 3, 2), { pick: [], next: 0 });
  assert.deepEqual(rotate(["a"], 9, 30).pick, ["a"]);
});
check("issue: open on first drift, refresh quietly, comment only on new items, close when clean", () => {
  const a = { check: "tvl", id: "spark-2", detail: "x" }, b = { check: "fees30", id: "solana", detail: "y" };
  assert.equal(decideDrift([a], [], null), "create");
  assert.equal(decideDrift([a], [keyOf(a)], { number: 1 }), "update");
  assert.equal(decideDrift([a, b], [keyOf(a)], { number: 1 }), "update+comment");
  assert.equal(decideDrift([], [keyOf(a)], { number: 1 }), "close");
  assert.equal(decideDrift([], [], null), "none");
});
check("the issue body groups items by check and names the tolerance file", () => {
  const body = driftBody([{ check: "tvl", id: "spark-2", detail: "stored TVL 9.64B vs DefiLlama's 7.25B (33.0% apart)" }], { at: "2026-10-04T06:00:00Z", sampled: { fees: 30, tvl: 30 } });
  assert.match(body, /### TVL \(1\)/);
  assert.match(body, /`spark-2`: stored TVL/);
  assert.match(body, /build\/audit-lib\.mjs/);
  const many = Array.from({ length: 14 }, (_, i) => ({ check: "tvl", id: `t${i}`, detail: "d" }));
  const long = driftBody(many);
  assert.equal((long.match(/^- `t/gm) || []).length, 10);
  assert.match(long, /and 4 more/);
});

for (const [s, n] of results) console.log(`${s}  ${n}`);
const failed = results.filter(([s]) => s === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
