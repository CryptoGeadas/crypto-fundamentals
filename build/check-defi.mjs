// Fixture checks for protocol TVL aggregation and treasury summaries (no network).
// Run: node build/check-defi.mjs   (exit code 1 on any failure)

import assert from "node:assert/strict";
import { tvlByToken, treasurySummary, treasuriesToRefresh } from "./defi-lib.mjs";

const results = [];
const check = (name, fn) => { try { fn(); results.push(["PASS", name]); } catch (e) { results.push(["FAIL", `${name} — ${e.message}`]); } };
const NOW = Date.UTC(2026, 9, 3) / 1000, DAY = 86400;

check("TVL sums every child of the token's parent protocol, now and a month ago", () => {
  const out = tvlByToken({
    protocols: [
      { id: "1599", slug: "aave-v3", parentProtocolSlug: "aave", tvl: 18e9 },
      { id: "111", slug: "aave-v2", parentProtocolSlug: "aave", tvl: 1e9 },
      { id: "2", slug: "uniswap-v3", parentProtocolSlug: "uniswap", tvl: 3e9 },
      { id: "9", slug: "dead", parentProtocolSlug: "aave", tvl: 0 },
    ],
    lite: [{ defillamaId: "1599", tvlPrevMonth: 15e9 }, { defillamaId: "111", tvlPrevMonth: 1.2e9 }],
    idmap: { aave: { p: "aave", f: 1 }, uniswap: { p: "uniswap" } },
    ids: new Set(["aave"]),
  });
  assert.deepEqual(out, { aave: { tvl: 19e9, tvlPrevMonth: 16.2e9 } });   // uniswap is not in our universe
});
check("treasury splits own token from everything else (shape of /treasury/aave)", () => {
  const t = treasurySummary({ currentChainTvls: { "Ethereum-OwnTokens": 97925598.8, Ethereum: 33798447.7, Polygon: 804782.7, "OP Mainnet-OwnTokens": 488.2, OwnTokens: 97926527.6 } });
  assert.equal(t.own, 97926528);
  assert.equal(t.other, 34603230);
  assert.throws(() => treasurySummary({}));
});
check("treasury rotation: missing or week-old are due; 'none' waits 30 days", () => {
  const iso = (d) => new Date((NOW - d * DAY) * 1000).toISOString();
  const stored = { a: { treasury: { at: iso(8) } }, b: { treasury: { at: iso(2) } }, c: { treasury: { none: true, at: iso(10) } }, d: { treasury: { none: true, at: iso(31) } } };
  assert.deepEqual(treasuriesToRefresh({ a: "a", b: "b", c: "c", d: "d", e: "e" }, stored, NOW, 10), ["e", "d", "a"]);
});

for (const [s, n] of results) console.log(`${s}  ${n}`);
const failed = results.filter(([s]) => s === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
