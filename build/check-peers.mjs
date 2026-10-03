// Fixture checks for peer valuation: fee aggregation, grouping, percentiles and the rated metric.
// Run: node build/check-peers.mjs   (exit code 1 on any failure)

import assert from "node:assert/strict";
import { feesByToken, buildPeers } from "./peers-lib.mjs";
import { peerPercentile, MIN_PEERS } from "../site/peers.js";
import { analyse } from "../site/rating.js";
import { HOUSE_RULES } from "../site/house-rules.js";

const results = [];
const check = (name, fn) => { try { fn(); results.push(["PASS", name]); } catch (e) { results.push(["FAIL", `${name} — ${e.message}`]); } };

const parents = [{ id: "parent#aave", gecko_id: "aave" }, { id: "parent#hyperliquid", gecko_id: "hyperliquid" }];
const protocols = [
  { id: "1599", gecko_id: null, parentProtocol: "parent#aave", category: "Lending" },
  { id: "5507", gecko_id: null, parentProtocol: "parent#hyperliquid", category: "Derivatives" },
];
const chains = [{ name: "Solana", gecko_id: "solana" }, { name: "Hyperliquid L1", gecko_id: "hyperliquid" }];
const FEES = feesByToken({ protocols, parents, chains, feeRows: [
  { defillamaId: "1599", total30d: 37e6, category: "Lending" },
  { defillamaId: "5507", total30d: 69e6, category: "Derivatives" },
  { defillamaId: "chain#solana", total30d: 25e6 },
  { defillamaId: "chain#hyperliquid l1", total30d: 0.6e6 },
  { defillamaId: "1599", total30d: 0 },
] });

check("fees are grouped per token: protocol fees with their category, chain fees apart", () => {
  assert.deepEqual(FEES.aave.protocol.v, 37e6);
  assert.equal(FEES.aave.protocol.cat, "Lending");
  assert.equal(FEES.solana.chain, 25e6);
  assert.equal(FEES.hyperliquid.protocol.cat, "Derivatives");
  assert.equal(FEES.hyperliquid.chain, 0.6e6);
});
check("plain chains compare on chain fees; Chain + DeFi in its protocol category; no FDV = skipped", () => {
  const universe = [{ id: "aave", fdv: 2.7e9 }, { id: "solana", fdv: 80e9 }, { id: "hyperliquid", fdv: 40e9 }, { id: "nofdv" }];
  const idmap = { aave: { p: "aave", f: 1 }, solana: { p: "solana", c: "Solana", fc: 1 }, hyperliquid: { p: "hyperliquid", c: "Hyperliquid L1", f: 1 }, nofdv: { p: "x", f: 1 } };
  const { groups, byToken } = buildPeers(universe, idmap, FEES, FEES);
  assert.equal(byToken.solana.group, "Chain");
  assert.equal(byToken.solana.pf, Math.round((80e9 / (25e6 * 12)) * 100) / 100);
  assert.equal(byToken.hyperliquid.group, "Derivatives");      // not "Chain"
  assert.equal(byToken.aave.pf, 6.08);
  assert.ok(!byToken.nofdv);
  assert.deepEqual(Object.keys(groups).sort(), ["Chain", "Derivatives", "Lending"]);
});
const lending = { Lending: [3, 5, 8, 10, 12, 15, 20, 30, 45, 60].map((pf, i) => ({ id: "l" + i, pf })), Dexs: [{ id: "d", pf: 9 }] };
check("percentile: cheapest 20% = very low, dearest 20% = very high, 'cheaper than' is the share above", () => {
  assert.equal(peerPercentile(2, "Lending", lending, "pf").level, 1);
  assert.equal(peerPercentile(2, "Lending", lending, "pf").cheaperThan, 100);
  assert.equal(peerPercentile(11, "Lending", lending, "pf").level, 3);    // 4 of 10 cheaper → 40%
  assert.equal(peerPercentile(100, "Lending", lending, "pf").level, 5);
  assert.equal(peerPercentile(null, "Lending", lending, "pf"), null);
});
check(`a category with fewer than ${MIN_PEERS} peers falls back to all fee-earning tokens, and says so`, () => {
  const p = peerPercentile(9, "Dexs", lending, "pf");
  assert.equal(p.group, "all fee-earning tokens");
  assert.equal(p.n, 11);
  assert.equal(p.fellBack, true);
});
check("a chain token in a tiny protocol category is compared with other chains before the catch-all", () => {
  const groups = { Foundation: [{ id: "arbitrum", pf: 60 }], Chain: Array.from({ length: 9 }, (_, i) => ({ id: "c" + i, pf: (i + 1) * 100 })), Lending: lending.Lending };
  const p = peerPercentile(60, "Foundation", groups, "pf", "Chain");
  assert.equal(p.group, "Chain");
  assert.equal(p.n, 9);
  assert.equal(p.level, 1);
  assert.equal(peerPercentile(60, "Foundation", groups, "pf").group, "all fee-earning tokens");
});
check("rated metric: FDV ÷ yearly fees uses live fees and FDV against the group, colour = cheap is good", () => {
  const t = { fdv: 2.7e9, marketCap: 2.6e9, llama: { fees: { d30: 37e6 }, revenue: { d30: 5e6 }, tvl: { now: 19e9 } }, peers: { group: "Lending", groups: lending } };
  const r = analyse(t, HOUSE_RULES, { type: "defi" }).rows.find((x) => x.id === "feeMultiple");
  assert.equal(r.display, "6.08×");
  assert.equal(r.word, "Low");             // 2 of 10 lending peers are cheaper
  assert.equal(r.favour, 1);
  assert.match(r.rule, /cheaper than 80%/i);
  const noPeers = analyse({ ...t, peers: null }, HOUSE_RULES, { type: "defi" }).rows.find((x) => x.id === "feeMultiple");
  assert.equal(noPeers.level, null);
});

for (const [s, n] of results) console.log(`${s}  ${n}`);
const failed = results.filter(([s]) => s === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
