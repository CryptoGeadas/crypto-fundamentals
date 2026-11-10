// Fixture checks for token identity: type rule, areas per type, coverage badge, fee earners.
// Run: node build/check-identity.mjs   (exit code 1 on any failure)

import assert from "node:assert/strict";
import { classify, isMemeCategory, isPeggedCategory, isExchangeCategory, pegTarget, pegOf } from "../site/classify.js";
import { areasFor, analyse, coverageOf, METRICS } from "../site/rating.js";
import { HOUSE_RULES } from "../site/house-rules.js";
import { feeEarners, llamaIndex } from "./universe-lib.mjs";
import { pegFromList } from "../site/llama.js";

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
  assert.equal(areasFor("defi").length, 11);
  assert.deepEqual(areasFor("meme"), ["dilution", "holders", "market", "attention", "security"]);
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
  assert.ok(Object.keys(a.byArea).every((k) => ["dilution", "holders", "market", "attention", "security"].includes(k)));
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

// Pegged assets (#53): CoinGecko categories as listed live on 9 Nov 2026.
const USDT_CATS = ["Stablecoins", "USD Stablecoin", "Solana Ecosystem", "Fiat-backed Stablecoin", "Tether Ecosystem"];
const PAXG_CATS = ["Tokenized Assets", "Tokenized Gold", "Ethereum Ecosystem", "Real World Assets (RWA)", "Tokenized Commodities"];
const WBTC_CATS = ["Crypto-Backed Tokens", "Tokenized BTC", "Wrapped-Tokens", "Ethereum Ecosystem"];
check("pegged assets get their own type from CoinGecko categories (USDT, USDC, DAI, PAXG, WBTC)", () => {
  assert.equal(classify(null, USDT_CATS).type, "pegged");
  assert.equal(classify(null, ["Stablecoins", "Decentralized Finance (DeFi)", "USD Stablecoin", "Crypto-backed Stablecoin"]).type, "pegged"); // DAI
  assert.equal(classify(null, PAXG_CATS).type, "pegged");
  assert.equal(classify(null, WBTC_CATS).type, "pegged");
  assert.equal(classify(null, ["Liquid Staking Tokens", "Ethereum Ecosystem"]).type, "pegged");                 // stETH
  assert.equal(classify(null, ["Tokenized Treasury Bills (T-Bills)", "Real World Assets (RWA)"]).type, "pegged");
});
check("the pegged rule does not catch other tokens", () => {
  assert.equal(classify({ p: "arbitrum-foundation", c: "Arbitrum" }, USDT_CATS).type, "chain");   // a chain stays a chain
  assert.equal(classify({ p: "aave", f: 1 }, ["Decentralized Finance (DeFi)", "Lending/Borrowing Protocols"]).type, "defi");
  assert.equal(classify(null, ["Meme", "Ethereum Ecosystem"]).type, "meme");
  assert.equal(classify(null, ["Real World Assets (RWA)", "Layer 1 (L1)"]).type, "narrative");     // RWA platform token, not pegged
  assert.equal(classify(null, ["Stablecoin Protocol", "Decentralized Finance (DeFi)"]).type, "narrative"); // a protocol around stablecoins
  assert.ok(!isPeggedCategory(["Real World Assets (RWA)", "Tokenized Assets"]));
});
check("pegged assets show peg, supply, holders and contract only", () => {
  assert.deepEqual(areasFor("pegged"), ["peg", "holders", "security"]);
  const t = { id: "tether", price: 0.998, circulatingSupply: 1.76e11, totalSupply: 1.8e11, maxSupply: null, marketCap: 1.76e11, fdv: 1.8e11,
    volume24h: 9e10, athChange: -20, categories: USDT_CATS, peg: { target: 1, unit: "USD", supply: 1.7668e11, supplyPrev: 1.8402e11 },
    security: { flags: ["Owner can blacklist addresses"], holders: [], top10: 52 } };
  const a = analyse(t, HOUSE_RULES, { type: "pegged" });
  assert.deepEqual(Object.keys(a.byArea), ["peg", "holders", "security"]);
  const ids = a.rows.map((r) => r.id);
  for (const gone of ["circulatingShare", "fdvToMcap", "volumeToMcap", "athDistance", "watchTrend"]) assert.ok(!ids.includes(gone), gone);
  const peg = a.rows.find((r) => r.id === "pegDistance");
  assert.equal(Math.round(peg.value * 100) / 100, -0.2);
  assert.equal(peg.level, null, "peg distance is shown, not rated");
  const ch = a.rows.find((r) => r.id === "pegSupplyChange");
  assert.equal(Math.round(ch.value * 10) / 10, -4);
  assert.equal(a.rows.find((r) => r.id === "pegSupply").value, 1.7668e11);
});
check("a pegged token without a known target or supply history shows unknown, never 0%", () => {
  const t = { id: "pax-gold", price: 4000, circulatingSupply: 3e5, categories: PAXG_CATS, peg: { target: null, unit: null, supply: null, supplyPrev: null } };
  const a = analyse(t, HOUSE_RULES, { type: "pegged" });
  const peg = a.rows.find((r) => r.id === "pegDistance"), ch = a.rows.find((r) => r.id === "pegSupplyChange");
  assert.equal(peg.value, null);
  assert.notEqual(peg.display, "0.00%");
  assert.equal(ch.value, null);
  assert.equal(a.rows.find((r) => r.id === "pegSupply").value, 3e5, "supply falls back to CoinGecko circulating supply");
});
check("peg target: DefiLlama USD peg or CoinGecko USD categories give $1; others are unknown", () => {
  assert.deepEqual(pegTarget(USDT_CATS, { pegType: "peggedUSD" }), { target: 1, unit: "USD" });
  assert.deepEqual(pegTarget(["Stablecoins", "Synthetic Dollar"], null), { target: 1, unit: "USD" });
  assert.deepEqual(pegTarget(["Stablecoins", "EUR Stablecoin"], { pegType: "peggedEUR" }), { target: null, unit: "EUR" });
  assert.deepEqual(pegTarget(PAXG_CATS, null), { target: null, unit: null });
});
check("pegged coverage counts only its own metrics", () => {
  assert.equal(coverageOf([{ value: 1 }, { value: 2 }, { value: 3 }, { value: 4 }, { value: null }], "pegged").level, "Full");
  assert.ok(METRICS.filter((m) => m.area === "peg").every((m) => m.yard === "shown"), "peg metrics are never rated");
});

check("the stablecoin list gives supply now and a month ago in the peg's own unit; unlisted tokens get nothing", () => {
  const list = { peggedAssets: [
    { gecko_id: "tether", pegType: "peggedUSD", circulating: { peggedUSD: 1.7668e11 }, circulatingPrevMonth: { peggedUSD: 1.8402e11 } },
    { gecko_id: "stasis-eurs", pegType: "peggedEUR", circulating: { peggedEUR: 7.35e6 }, circulatingPrevMonth: {} },
  ] };
  assert.deepEqual(pegFromList(list, "tether"), { pegType: "peggedUSD", supply: 1.7668e11, supplyPrev: 1.8402e11 });
  assert.deepEqual(pegFromList(list, "stasis-eurs"), { pegType: "peggedEUR", supply: 7.35e6, supplyPrev: null }, "a missing month-ago figure is unknown, not 0");
  assert.equal(pegFromList(list, "pax-gold"), null);
  assert.equal(pegFromList(null, "tether"), null);
});

check("pegged comes before DeFi: Tether Gold is a fee-earning DefiLlama protocol but a pegged token", () => {
  assert.equal(classify({ p: "tether-gold", f: 1 }, ["Tokenized Gold", "Tokenized Commodities"]).type, "pegged"); // XAUT, live idmap
  assert.equal(classify({ p: "lido", f: 1 }, ["Liquid Staking Governance Tokens", "Decentralized Finance (DeFi)"]).type, "defi"); // LDO: governance, not the staked coin
  assert.equal(classify(null, ["Meme", "Stablecoins"]).type, "pegged");
});
check("USDC (live categories) is a pegged asset pegged to $1", () => {
  const cats = ["Stablecoins", "USD Stablecoin", "Solana Ecosystem", "Fiat-backed Stablecoin", "MiCA-Compliant Stablecoin"];
  assert.equal(classify(null, cats).type, "pegged");
  assert.deepEqual(pegTarget(cats, null), { target: 1, unit: "USD" });
});
check("DefiLlama's peggedUSD alone gives the $1 target", () => {
  assert.deepEqual(pegTarget(["Stablecoins"], { pegType: "peggedUSD" }), { target: 1, unit: "USD" });
});
check("the page's peg record: list failed + USD category = $1 with unknown supply; not listed gold = unknown; EUR = unknown target", () => {
  assert.deepEqual(pegOf(["Stablecoins", "USD Stablecoin"], null), { target: 1, unit: "USD", supply: null, supplyPrev: null });
  assert.deepEqual(pegOf(["Tokenized Gold"], null), { target: null, unit: null, supply: null, supplyPrev: null });
  assert.deepEqual(pegOf(["Stablecoins", "EUR Stablecoin"], { pegType: "peggedEUR", supply: 7.35e6, supplyPrev: 7.2e6 }),
    { target: null, unit: "EUR", supply: 7.35e6, supplyPrev: 7.2e6 });
});
check("a known target with no price shows unknown, never 0.00%", () => {
  for (const price of [undefined, 0]) {
    const a = analyse({ price, peg: pegOf(["USD Stablecoin"], null) }, HOUSE_RULES, { type: "pegged" });
    const r = a.rows.find((x) => x.id === "pegDistance");
    assert.equal(r.value, null);
    assert.notEqual(r.display, "0.00%");
  }
});

// Exchange tokens (#56): CoinGecko categories as listed live on 10 Nov 2026 for BNB, CRO, OKB, GT, KCS.
const EXCHANGE_CATS = ["Exchange-based Tokens", "Centralized Exchange (CEX) Token", "BNB Chain Ecosystem"];
check("exchange tokens are recognised from CoinGecko's exchange categories, whatever their type", () => {
  assert.ok(isExchangeCategory(EXCHANGE_CATS));
  assert.ok(!isExchangeCategory(["Decentralized Exchange (DEX)", "Decentralized Finance (DeFi)"]), "a DEX token is not an exchange-business token");
  const bnb = classify({ p: "binance", c: "BSC", f: 1 }, EXCHANGE_CATS);
  assert.equal(bnb.type, "chain");
  assert.equal(bnb.exchange, true);
  assert.equal(classify(null, ["Centralized Exchange (CEX) Token"]).exchange, true);                // OKB, no DefiLlama entry
  assert.equal(classify({ p: "aave", f: 1 }, ["Decentralized Finance (DeFi)"]).exchange, false);
});
check("exchange tokens: valuation and value-accrual numbers are shown, not rated; other areas unchanged", () => {
  const t = { fdv: 9e10, marketCap: 9e10, circulatingSupply: 1.4e8, totalSupply: 1.4e8, maxSupply: 2e8, volume24h: 2e9,
    llama: { fees: { d30: 2e7 }, revenue: { d30: 1e7 }, holders: { d30: 5e6 }, accrualFees: { d30: 2e7 }, tvl: { now: 5e9, prev: 5e9 } },
    peers: { group: "Chain", groups: { Chain: Array.from({ length: 9 }, (_, i) => ({ id: "c" + i, pf: 10 + i * 30, pr: 20 + i * 40 })) } } };
  const ex = analyse(t, HOUSE_RULES, { type: "chain", alsoDefi: true, exchange: true });
  const plain = analyse(t, HOUSE_RULES, { type: "chain", alsoDefi: true });
  for (const id of ["feeMultiple", "revenueMultiple", "mcapToTvl", "holdersShare"]) {
    const r = ex.rows.find((x) => x.id === id);
    assert.ok(r.value != null, `${id} is still shown`);
    assert.equal(r.level, null, `${id} is not rated`);
    assert.match(r.rule, /exchange business/, id);
  }
  // the peer comparison is still shown, on the multiple its type is judged on (revenue for Chain + DeFi)
  const rev = ex.rows.find((x) => x.id === "revenueMultiple"), fee = ex.rows.find((x) => x.id === "feeMultiple");
  assert.ok(rev.peer, "the peer comparison stays visible for the basis multiple");
  assert.equal(rev.level, null);
  assert.ok(!fee.peer, "only one multiple carries the peer table");
  const chainOnly = analyse(t, HOUSE_RULES, { type: "chain", exchange: true }).rows;
  assert.ok(chainOnly.find((x) => x.id === "feeMultiple").peer, "a plain exchange chain (BNB) is compared on fees");
  assert.equal(chainOnly.find((x) => x.id === "feeMultiple").level, null);
  assert.equal(ex.byArea.valuation.word, "Shown only");
  assert.equal(ex.coverage.share, plain.coverage.share, "coverage is unchanged");
  for (const id of ["circulatingShare", "fdvToMcap", "volumeToMcap"]) {
    assert.equal(ex.rows.find((x) => x.id === id).level, plain.rows.find((x) => x.id === id).level, `${id} unchanged`);
  }
});

for (const [s, n] of results) console.log(`${s}  ${n}`);
const failed = results.filter(([s]) => s === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
