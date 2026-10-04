// Fixture checks for protocol TVL aggregation and treasury summaries (no network).
// Run: node build/check-defi.mjs   (exit code 1 on any failure)

import assert from "node:assert/strict";
import { tvlByToken, treasurySummary, treasuriesToRefresh, hacksByToken, auditsByToken } from "./defi-lib.mjs";

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

check("hacks attach through child or parent protocol ids; unattributable incidents are skipped", () => {
  const parents = [{ id: "parent#aave", gecko_id: "aave" }];
  const protocols = [{ id: "1599", parentProtocol: "parent#aave" }, { id: "1", gecko_id: "aave" }, { id: "2862", gecko_id: "hyperliquid" }];
  const h = hacksByToken({ parents, protocols, hacks: [
    { date: 1773273600, name: "Aave V3", defillamaId: "1599", parentProtocolId: "parent#aave", amount: 862000, returnedFunds: 862000, classification: "Oracle Manipulation" },
    { date: 1724803200, name: "Aave", defillamaId: "1", amount: 56000, returnedFunds: null, classification: "Access Control" },
    { date: 1786000000, name: "Hyperliquid Malaysia", defillamaId: null, amount: null },
  ] });
  assert.deepEqual(Object.keys(h), ["aave"]);
  assert.equal(h.aave.length, 2);
  assert.equal(h.aave[0].name, "Aave V3");            // newest first
  assert.equal(h.aave[1].returned, 0);
});
check("parent TVL leaves out what a child holds inside a sibling (DefiLlama's excludeParent), now and a month ago", () => {
  // Shaped like Spark on 4 Oct 2026: children sum to $9.64B, DefiLlama's parent figure is $7.24B.
  const out = tvlByToken({
    protocols: [
      { id: "1", slug: "sparklend", parentProtocolSlug: "spark", tvl: 5607e6 },
      { id: "2", slug: "spark-liquidity-layer", parentProtocolSlug: "spark", tvl: 2682e6 },
      { id: "3", slug: "spark-savings", parentProtocolSlug: "spark", tvl: 1351e6 },
    ],
    lite: [
      { defillamaId: "1", tvlPrevMonth: 5000e6 },
      { defillamaId: "2", tvlPrevMonth: 2000e6, chainTvls: { excludeParent: { tvl: 1559e6, tvlPrevMonth: 0 } } },
      { defillamaId: "3", tvlPrevMonth: 1000e6, chainTvls: { excludeParent: { tvl: 836e6, tvlPrevMonth: 700e6 } } },
    ],
    idmap: { "spark-2": { p: "spark", f: 1 } }, ids: new Set(["spark-2"]),
  });
  assert.equal(out["spark-2"].tvl, 7245e6);
  // Last month: Savings has its own split (700M); Liquidity Layer has none, so today's share (1559/2682) is applied.
  assert.equal(out["spark-2"].tvlPrevMonth, Math.round(5000e6 + (2000e6 - 2000e6 * 1559 / 2682) + (1000e6 - 700e6)));
  // A token mapped straight to the child itself keeps the child's whole TVL.
  const direct = tvlByToken({ protocols: [{ id: "2", slug: "spark-liquidity-layer", tvl: 2682e6 }],
    lite: [{ defillamaId: "2", chainTvls: { excludeParent: { tvl: 1559e6 } } }], idmap: { sll: { p: "spark-liquidity-layer" } }, ids: new Set(["sll"]) });
  assert.equal(direct.sll.tvl, 2682e6);
});
check("an incident whose DefiLlama id has left the protocols list is matched by exact name (Aave, Aug 2024)", () => {
  const h = hacksByToken({ parents: [{ id: "parent#aave", name: "Aave", gecko_id: "aave", chains: ["Ethereum", "Polygon"] }],
    protocols: [{ id: "1599", name: "Aave V3", parentProtocol: "parent#aave" }, { id: "7", name: "Rain", gecko_id: "rain", chains: ["Arbitrum"] }],
    hacks: [{ date: 1724803200, name: "Aave", defillamaId: "1", chain: ["Ethereum"], amount: 56000, returnedFunds: null, classification: "Access Control" },
            { date: 1724803200, name: "Aave Fork Finance", defillamaId: "999", chain: ["Ethereum"], amount: 1 },
            { date: 1712000000, name: "Rain", defillamaId: "998", chain: ["Bitcoin", "Ethereum"], amount: 14.8e6 }] });
  assert.equal(h.aave.length, 1);
  assert.equal(h.aave[0].amount, 56000);
  assert.equal(h.rain, undefined, "a same-named project on other chains is not the same project");
});
check("audit links are de-duplicated across child protocols", () => {
  const a = auditsByToken({ parents: [{ id: "parent#x", gecko_id: "x" }], protocols: [
    { id: "1", parentProtocol: "parent#x", audit_links: ["https://a.io/1", "https://a.io/2"] },
    { id: "2", parentProtocol: "parent#x", audit_links: ["https://a.io/2", "not a link"] } ] });
  assert.deepEqual(a, { x: { count: 2, links: ["https://a.io/1", "https://a.io/2"] } });
});

for (const [s, n] of results) console.log(`${s}  ${n}`);
const failed = results.filter(([s]) => s === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
