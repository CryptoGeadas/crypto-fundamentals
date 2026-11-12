// Token assembly (site/assemble.js, #78): the page and the checks build the token the ratings read
// through one module. Proves the assembly runs with no page loaded, that the ratings read nothing
// it does not set, and that a failed source stays unknown.
// Run: node build/check-assemble.mjs   (exit code 1 on any failure)

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assembleToken, setLlama, setPeg, setSecurity } from "../site/assemble.js";
import { normalise } from "../site/coingecko.js";
import { analyse, unlockedAt } from "../site/rating.js";
import { HOUSE_RULES } from "../site/house-rules.js";
import { LEADS } from "../site/leads.js";
import * as unlocksLib from "./unlocks-lib.mjs";

const results = [];
const check = (name, fn) => { try { fn(); results.push(["PASS", name]); } catch (e) { results.push(["FAIL", `${name} — ${e.message}`]); } };

const AT = Date.parse("2026-11-12T12:00:00Z");
const coin = (over = {}) => ({ id: "aave", symbol: "aave", name: "Aave", categories: ["Decentralized Finance (DeFi)"], watchlist_portfolio_users: 100_000,
  market_data: { current_price: { usd: 115 }, market_cap: { usd: 1.76e9 }, total_volume: { usd: 2e8 }, circulating_supply: 15.3e6, total_supply: 16e6, max_supply: 16e6,
    ath_change_percentage: { usd: -80 } }, ...over });
const daily = {
  unlocks: { aave: { circ: 15e6, next: null } },
  supply: { aave: [["2026-10-01", 15.0e6], ["2026-11-12", 15.3e6]] },
  meta: { aave: { raises: [], dev: null } },
  attention: { trending: [], watch: { aave: [] } },
  defi: { aave: { tvl: 30e9, hacks: [{ lost: 1 }], audits: 5 } },
  peers: { byToken: { aave: { group: "Lending" } }, groups: { Lending: [] } },
};
const llama = { value: { fees: { d30: 64.5e6 }, revenue: { d30: 8.2e6 }, tvl: { now: 30e9 } }, at: AT - 3_600_000 };
const security = { value: { chain: "ethereum", holders: [], flags: [] }, at: AT - 7_200_000 };
const build = (cls = { type: "defi" }, sources = {}, market = normalise(coin())) =>
  assembleToken(market, cls, { marketAt: AT, entry: { p: "aave" }, detail: { monthly: [] }, llama, security, firstPrice: { value: 1601510400, at: AT }, ...sources }, daily);

check("the assembly runs with no page loaded and returns a new token, leaving the market data untouched", () => {
  const market = normalise(coin());
  const before = JSON.stringify(market);
  const t = build({ type: "defi" }, {}, market);
  assert.equal(JSON.stringify(market), before, "the cached market object is not changed");
  assert.equal(t.id, "aave");
  assert.equal(t.llama.fees.d30, 64.5e6);
  assert.deepEqual(t.unlocks, { circ: 15e6, next: null, detail: { monthly: [] } });
  assert.equal(t.meta, daily.meta.aave);
  assert.deepEqual(t.defiExtra, { hacks: [{ lost: 1 }], audits: 5 });
  assert.deepEqual(t.peers, { group: "Lending", groups: daily.peers.groups, secondary: null });
  assert.equal(t.firstPriceTs, 1601510400);
  assert.deepEqual(t.sourceFailed, { defillama: false, goplus: false });
  assert.deepEqual(t.dataAt, { market: AT, slow: AT - 7_200_000 }, "the oldest slow lookup");
});
check("the ratings read nothing the assembly (or CoinGecko's normalised token) does not set", () => {
  const market = normalise(coin());
  for (const type of ["chain", "defi", "meme", "narrative", "pegged"]) {
    const t = build({ type }, {}, market);
    const read = new Set();
    const spy = new Proxy(t, { get: (o, k) => { if (typeof k === "string") read.add(k); return o[k]; } });
    const a = analyse(spy, HOUSE_RULES, { type });
    for (const id of Object.keys(a.byArea)) LEADS[id]?.(spy, a);
    const unknown = [...read].filter((k) => !(k in t));
    assert.deepEqual(unknown, [], `${type}: the ratings read fields no source sets`);
  }
});
check("a token built by the assembly rates end to end (a Lending protocol)", () => {
  const a = analyse(build(), HOUSE_RULES, { type: "defi" });
  const row = (id) => a.rows.find((r) => r.id === id);
  assert.ok(row("circulatingShare").value > 95);
  assert.ok(row("feeMultiple").value > 0, "FDV ÷ yearly fees is computed from the assembled token");
  assert.ok(row("volumeToMcap").value > 0);
  assert.ok(row("mcapToTvl").value > 0, "market cap against the TVL the assembly put on the token");
});
check("a token the daily files do not know: unknown, never invented", () => {
  const t = assembleToken(normalise(coin({ id: "newcoin" })), { type: "narrative" }, { marketAt: AT }, daily);
  assert.equal(t.unlocks, null);
  assert.equal(t.meta, null);
  assert.equal(t.defiExtra, null);
  assert.equal(t.llama, null);
  assert.equal(t.security, null);
  assert.equal(t.firstPriceTs, null);
  assert.equal(t.peers.group, undefined);
  assert.deepEqual(t.dataAt, { market: AT, slow: AT });
  assert.equal(assembleToken(normalise(coin()), { type: "defi" }, { marketAt: AT }, {}).peers, null, "no daily files at all");
});
check("a failed source is marked failed and left unknown", () => {
  const t = build({ type: "defi" }, { llama: { value: { failed: true }, at: null }, security: { value: null, at: null, failed: true } });
  assert.deepEqual(t.sourceFailed, { defillama: true, goplus: true });
  assert.equal(t.security, null);
  assert.deepEqual(t.dataAt, { market: AT, slow: AT }, "a failed lookup has no time; the first-price lookup is the only slow one left");
});
check("a pegged token reads only its peg; a failed stablecoin list keeps the peg from its categories", () => {
  const usd = normalise(coin({ id: "usdc", symbol: "usdc", categories: ["Stablecoins", "USD Stablecoin"] }));
  const ok = assembleToken(usd, { type: "pegged" }, { marketAt: AT, peg: { value: { pegType: "peggedUSD", circulating: 5e10 }, at: AT } }, daily);
  assert.equal(ok.llama, null);
  assert.equal(ok.sourceFailed.defillama, false);
  assert.ok(ok.peg, "peg set from the stablecoin list");
  const down = assembleToken(usd, { type: "pegged" }, { marketAt: AT, peg: { value: null, at: null, failed: true } }, daily);
  assert.equal(down.sourceFailed.defillama, true);
  assert.deepEqual(down.peg, assembleToken(usd, { type: "pegged" }, { marketAt: AT, peg: { value: { listed: false }, at: AT } }, daily).peg, "same as a token the list does not carry");
});
check("Retry lands exactly as a first load would", () => {
  const first = build();
  const failed = build({ type: "defi" }, { llama: { value: { failed: true }, at: null }, security: { value: null, at: null, failed: true } });
  setLlama(failed, llama.value);
  setSecurity(failed, security.value);
  assert.deepEqual(failed.llama, first.llama);
  assert.deepEqual(failed.security, first.security);
  assert.deepEqual(failed.sourceFailed, first.sourceFailed);
  setSecurity(failed, null, true);
  assert.deepEqual([failed.security, failed.sourceFailed.goplus], [null, true]);
  // a retried peg that fails again keeps the peg on screen
  const usd = normalise(coin({ id: "usdc", categories: ["Stablecoins", "USD Stablecoin"] }));
  const p = assembleToken(usd, { type: "pegged" }, { marketAt: AT, peg: { value: { pegType: "peggedUSD", circulating: 5e10 }, at: AT } }, daily);
  const kept = p.peg;
  setPeg(p, null, true);
  assert.equal(p.peg, kept);
  assert.equal(p.sourceFailed.defillama, true);
});
check("the page builds its token only through the assembly, on first load and on Retry", () => {
  const app = readFileSync(new URL("../site/app.js", import.meta.url), "utf8");
  assert.match(app, /assembleToken\(market\.value, cls,/);
  for (const field of ["llama", "security", "peg", "unlocks", "supplyGrowthNow", "meta", "attention", "defiExtra", "peers", "firstPriceTs", "dataAt"])
    assert.doesNotMatch(app, new RegExp(`\\bt\\.${field} = `), `app.js still sets t.${field} itself`);
});
check("one unlock date helper is shared by the page and the build", () => {
  assert.equal(unlocksLib.unlockedAt, unlockedAt);
  assert.doesNotMatch(readFileSync(new URL("./unlocks-lib.mjs", import.meta.url), "utf8"), /export function unlockedAt/);
});

for (const [s, n] of results) console.log(`${s}  ${n}`);
const failed = results.filter(([s]) => s === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
