// Fixture checks for the universe build and the page's search helpers (no network).
// Run: node build/check-universe.mjs   (exit code 1 on any failure)

import assert from "node:assert/strict";
import { llamaIndex, buildUniverse, cleanPlatforms, TOP_N } from "./universe-lib.mjs";
import { addressKind, buildAddressIndex, lookupAddress, searchUniverse, tickerClashes } from "../site/search.js";

const results = [];
const check = (name, fn) => { try { fn(); results.push(["PASS", name]); } catch (e) { results.push(["FAIL", `${name} — ${e.message}`]); } };

const LLAMA = llamaIndex({
  protocols: [
    { slug: "aave-v3", gecko_id: null, parentProtocol: "parent#aave" },
    { slug: "jupiter-perpetual-exchange", gecko_id: "jupiter-exchange-solana", parentProtocol: "parent#jupiter" },
    { slug: "smallfi", gecko_id: "smallfi-token" },
  ],
  parents: [{ id: "parent#aave", gecko_id: "aave" }, { id: "parent#jupiter", gecko_id: "jupiter-exchange-solana" }],
  chains: [{ name: "Arbitrum", gecko_id: "arbitrum" }],
});

const m = (id, sym, rank) => ({ id, symbol: sym, name: id, market_cap_rank: rank, image: `https://img/${id}.png` });
const MARKETS = [
  m("aave", "aave", 40), m("uniswap", "uni", 23), m("arbitrum", "arb", 68), m("fake-uni", "uni", 1210),
  m("smallfi-token", "sfi", 900), m("random-gamefi", "rgf", 450), m("unranked", "unr", null), m("way-down", "wd", 2000),
  m("jupiter-exchange-solana", "jup", 120), m("other-uni", "uni", 280),
];
const PLATFORMS = {
  aave: { ethereum: "0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9", hydration: "asset_registry%2F1000624" },
  "jupiter-exchange-solana": { solana: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN" },
};
const U = buildUniverse(MARKETS, LLAMA, PLATFORMS);
const ids = U.map((t) => t.id);

check("parent protocol slug wins; chains map by name", () => {
  assert.deepEqual(LLAMA.aave, { p: "aave" });
  assert.equal(LLAMA["jupiter-exchange-solana"].p, "jupiter");
  assert.deepEqual(LLAMA.arbitrum, { c: "Arbitrum" });
});
check(`top ${TOP_N} always included, with or without DefiLlama`, () => {
  assert.ok(ids.includes("uniswap") && ids.includes("other-uni"));
});
check("ranks 301–1,500 need a DefiLlama entry", () => {
  assert.ok(ids.includes("smallfi-token"));
  assert.ok(!ids.includes("random-gamefi"));
  assert.ok(!ids.includes("fake-uni"));
});
check("unranked and beyond-1,500 tokens are excluded", () => {
  assert.ok(!ids.includes("unranked") && !ids.includes("way-down"));
});
check("universe is sorted by rank and keeps only real contract addresses", () => {
  assert.deepEqual(U.map((t) => t.rank), [...U.map((t) => t.rank)].sort((a, b) => a - b));
  assert.deepEqual(U.find((t) => t.id === "aave").addr, { ethereum: "0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9" });
  assert.deepEqual(cleanPlatforms({ x: "", y: null }), {});
});
check("search 'uni': real Uniswap first by rank, fakes never appear", () => {
  const hits = searchUniverse(U, "uni");
  assert.equal(hits[0].id, "uniswap");
  assert.ok(!hits.some((h) => h.id === "fake-uni"));
});
check("an exact ticker match beats a higher-ranked partial name match", () => {
  const hits = searchUniverse([{ id: "a", sym: "ARBX", name: "arbx", rank: 5 }, { id: "b", sym: "ARB", name: "b", rank: 60 }], "arb");
  assert.equal(hits[0].id, "b");
});
check("real ticker clashes are detected so both show full names", () => {
  const clash = tickerClashes(searchUniverse(U, "uni"));
  assert.ok(clash.has("uniswap") && clash.has("other-uni"));
});
check("addresses: kind detection, EVM case-insensitive, Solana exact", () => {
  assert.equal(addressKind("0x7FC66500C84A76AD7E9C93437BFC5AC33E2DDAE9"), "evm");
  assert.equal(addressKind("JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN"), "solana");
  assert.equal(addressKind("uniswap"), null);
  const idx = buildAddressIndex(U);
  assert.equal(lookupAddress(idx, "0x7FC66500C84A76AD7E9C93437BFC5AC33E2DDAE9"), "aave");
  assert.equal(lookupAddress(idx, "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN"), "jupiter-exchange-solana");
  assert.equal(lookupAddress(idx, "jupyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN"), null);
});

for (const [s, n] of results) console.log(`${s}  ${n}`);
const failed = results.filter(([s]) => s === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
