// Fixture checks for token identity: type rule, areas per type, coverage badge, fee earners.
// Run: node build/check-identity.mjs   (exit code 1 on any failure)

import assert from "node:assert/strict";
import { classify, isMemeCategory } from "../site/classify.js";
import { areasFor, analyse, coverageOf } from "../site/rating.js";
import { HOUSE_RULES } from "../site/house-rules.js";
import { feeEarners, llamaIndex } from "./universe-lib.mjs";

const results = [];
const check = (name, fn) => { try { fn(); results.push(["PASS", name]); } catch (e) { results.push(["FAIL", `${name} — ${e.message}`]); } };

// Shapes taken from the live idmap (3 Oct 2026).
check("type rule order: chain → DeFi → memecoin → narrative", () => {
  assert.equal(classify({ p: "arbitrum-foundation", c: "Arbitrum" }).type, "chain");          // ARB
  assert.equal(classify({ p: "aave", f: 1 }).type, "defi");                                   // AAVE
  assert.equal(classify({ p: "jupiter", f: 1 }).type, "defi");                                // JUP
  assert.equal(classify(null, ["Meme", "Ethereum Ecosystem"]).type, "meme");                  // PEPE
  assert.equal(classify(null, ["Gaming (GameFi)", "Layer 2 (L2)"]).type, "narrative");        // IMX
});
check("a protocol that earns no fees is not DeFi", () => {
  assert.equal(classify({ p: "some-dao" }, []).type, "narrative");
  assert.equal(classify({ p: "dog-dao" }, ["Meme"]).type, "meme");
});
check("a chain whose protocol side earns fees is flagged alsoDefi (Hyperliquid)", () => {
  const r = classify({ p: "hyperliquid", c: "Hyperliquid L1", f: 1 });
  assert.equal(r.type, "chain");
  assert.equal(r.alsoDefi, true);
  assert.ok(areasFor("chain", true).includes("accrual"));
  assert.ok(!areasFor("chain", false).includes("accrual"));
});
check("meme category detection is word-based", () => {
  assert.ok(isMemeCategory(["Solana Meme"]));
  assert.ok(!isMemeCategory(["Memento Protocol"]));
});
check("areas per type match the PRD", () => {
  assert.equal(areasFor("defi").length, 10);
  assert.deepEqual(areasFor("meme"), ["dilution", "holders", "market", "security"]);
  assert.ok(!areasFor("narrative").includes("valuation"));
});
check("coverage: memecoins are always 'Market data only'; others by share of metrics with data", () => {
  const rows = [{ value: 1 }, { value: 2 }, { value: null }, { value: 3 }, { value: 4 }];
  assert.equal(coverageOf(rows, "defi").level, "Full");          // 80%
  assert.equal(coverageOf(rows, "meme").level, "Market data only");
  assert.equal(coverageOf([{ value: 1 }, { value: null }], "defi").level, "Partial");
  assert.equal(coverageOf([{ value: null }, { value: null }, { value: 1 }], "defi").level, "Market data only");
});
check("analyse only rates the areas that apply to the type", () => {
  const t = { circulatingSupply: 5, maxSupply: 10, totalSupply: 10, marketCap: 1, fdv: 2 };
  const a = analyse(t, HOUSE_RULES, { type: "meme" });
  assert.ok(Object.keys(a.byArea).every((k) => ["dilution", "holders", "market", "security"].includes(k)));
});
check("fee earners map child protocols, parents and chains back to the token", () => {
  const parents = [{ id: "parent#aave", gecko_id: "aave" }];
  const protocols = [{ id: "1599", gecko_id: null, parentProtocol: "parent#aave" }, { id: "182", gecko_id: "lido-dao" }];
  const chains = [{ name: "Solana", gecko_id: "solana" }];
  const fees = feeEarners({ feeRows: [{ defillamaId: "1599", total30d: 5e7 }, { defillamaId: "182", total30d: 0 },
    { defillamaId: "chain#solana", total30d: 2.5e7 }], protocols, parents, chains });
  assert.deepEqual([...fees.protocol], ["aave"]);
  assert.deepEqual([...fees.chain], ["solana"]);
  const idx = llamaIndex({ protocols, parents, chains, fees });
  assert.equal(idx.aave.f, 1);
  assert.equal(idx["lido-dao"].f, undefined);
  assert.equal(idx.solana.fc, 1);
  assert.equal(idx.solana.f, undefined);
});
check("chain fees alone never make a chain '+ DeFi' (ETH, SOL); protocol fees do (Hyperliquid)", () => {
  assert.equal(classify({ p: "ethereum-foundation", c: "Ethereum", fc: 1 }).alsoDefi, false);
  assert.equal(classify({ p: "hyperliquid", c: "Hyperliquid L1", f: 1, fc: 1 }).alsoDefi, true);
});

for (const [s, n] of results) console.log(`${s}  ${n}`);
const failed = results.filter(([s]) => s === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
