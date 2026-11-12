// The opening sentence of each area (site/leads.js, #77): every metric id a sentence looks up is a
// real metric, every area that is shown has a sentence, and the sentences say the right thing for
// known, unknown and "not on record" data.
// Run: node build/check-leads.mjs   (exit code 1 on any failure)

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LEADS, row, peerLabel } from "../site/leads.js";
import { METRICS, AREAS, analyse } from "../site/rating.js";
import { HOUSE_RULES } from "../site/house-rules.js";

const results = [];
const check = (name, fn) => { try { fn(); results.push(["PASS", name]); } catch (e) { results.push(["FAIL", `${name} — ${e.message}`]); } };
const metricIds = new Set((Array.isArray(METRICS) ? METRICS : Object.values(METRICS).flat()).map((m) => m.id));
const src = (f) => readFileSync(new URL(`../site/${f}`, import.meta.url), "utf8");
const rows = (...list) => ({ rows: list });

check("every metric id a lead sentence or the page looks up is a real metric", () => {
  assert.ok(metricIds.size > 20, `metric list read (${metricIds.size})`);
  for (const f of ["leads.js", "app.js"]) {
    const used = [...src(f).matchAll(/\brow\(a, "(\w+)"\)/g)].map((m) => m[1]);
    if (f === "leads.js") assert.ok(used.length >= 20, `lookups found in ${f} (${used.length})`);
    for (const id of used) assert.ok(metricIds.has(id), `${f} looks up "${id}", which is not a metric`);
  }
});
check("no row is looked up by a literal id outside row(a, id)", () => {
  for (const f of ["leads.js", "app.js"]) assert.doesNotMatch(src(f), /\.id === "/, f);
});
check("every area has a lead sentence, and every lead belongs to an area", () => {
  const areaIds = AREAS.map((a) => a.id);
  const NO_LEAD = ["attention"]; // shown as rows only, by design: a new area must be added here on purpose
  for (const id of areaIds) assert.equal(typeof LEADS[id], NO_LEAD.includes(id) ? "undefined" : "function", `lead for area "${id}"`);
  for (const id of Object.keys(LEADS)) assert.ok(areaIds.includes(id), `lead "${id}" has no area`);
});
check("every lead survives a token with no data at all: a plain sentence, never a crash or 'undefined'", () => {
  const empty = { sym: "XYZ", name: "Xyz", security: { holders: [], flags: [] }, peg: {} };
  for (const [id, lead] of Object.entries(LEADS)) {
    const text = lead(empty, rows());
    assert.equal(typeof text, "string", id);
    assert.ok(text.length > 10 && text.endsWith("."), `${id}: ${text}`);
    assert.doesNotMatch(text, /undefined|NaN|null/, `${id}: ${text}`);
  }
});
check("leads run on a really analysed token of each type without 'undefined'", () => {
  const t = { id: "x", sym: "XYZ", name: "Xyz", price: 2, marketCap: 1e9, fdv: 2e9, circulatingSupply: 5e8, totalSupply: 1e9, maxSupply: 1e9, volume24h: 5e7, athChange: -60,
    security: { holders: [], flags: [] }, peg: { target: 1 }, meta: {} };
  for (const type of ["chain", "defi", "meme", "narrative", "pegged"]) {
    const a = analyse(t, HOUSE_RULES, { type });
    for (const areaId of Object.keys(a.byArea)) {
      const text = LEADS[areaId]?.(t, a) ?? "";
      assert.doesNotMatch(text, /undefined|NaN/, `${type}/${areaId}: ${text}`);
    }
  }
});

check("dilution: capped, uncapped, and no data", () => {
  const t = { sym: "AAA", unlocks: null };
  assert.equal(LEADS.dilution(t, rows({ id: "circulatingShare", value: 62, display: "62%" }, { id: "fdvToMcap", value: 1.6, display: "1.60×" })),
    "62% of AAA's eventual supply is already circulating; its fully diluted value is 1.60× its market cap. DefiLlama does not track an unlock schedule for it.");
  assert.match(LEADS.dilution(t, rows({ id: "circulatingShare", unrated: true }, { id: "fdvToMcap", value: null })), /^AAA has no maximum supply, so its dilution depends on how fast new tokens are issued\./);
  assert.match(LEADS.dilution(t, rows()), /^CoinGecko has no supply data for this token\./);
  const u = LEADS.dilution({ sym: "AAA", unlocks: {} }, rows({ id: "circulatingShare", value: 62, display: "62%" }, { id: "fdvToMcap", value: 1.6, display: "1.60×" },
    { id: "nextUnlockShare", value: 2, extra: "2% on 1 Dec" }, { id: "unlocks12m", value: 12, display: "12% of circulating" }));
  assert.match(u, /Next unlock: 2% on 1 Dec\. 12% of circulating supply is due to unlock in the next 12 months\.$/);
});
check("traction and value accrual: figures when known, a plain 'no data' when not", () => {
  const t = { name: "Aave", sym: "AAVE", llama: { fees: { d30: 64.5e6 }, revenue: { d30: 8.2e6 }, tvl: { now: 30e9 } } };
  const text = LEADS.traction(t, rows({ id: "feesTrend", value: 12, display: "+12.0%" }, { id: "tvlTrend", value: null }));
  assert.match(text, /^Aave earned \$64\.5M in fees over the last 30 days \(\+12\.0% against the same window three months earlier\), of which \$8\.2M/);
  assert.match(text, /\$30\.00B is locked in it\.$/);
  assert.equal(LEADS.traction({ name: "X" }, rows()), "DefiLlama returned no fee or TVL data for it.");
  assert.match(LEADS.accrual(t, rows({ id: "holdersShare", value: 0 })), /^None of Aave's revenue reached token holders/);
  assert.match(LEADS.accrual(t, rows({ id: "holdersShare", value: 40, display: "40%" }, { id: "holdersShareFees", value: 5, display: "5%" })), /^40% of what Aave keeps reached token holders.*\(5% of all fees/);
  assert.match(LEADS.accrual(t, rows()), /unclear whether what it earns reaches token holders\.$/);
});
check("valuation names the multiple the token is rated on, and the peer group", () => {
  const t = { sym: "AAVE" };
  const rev = { id: "revenueMultiple", value: 20, display: "20.0×", level: 3, peer: { cheaperThan: 70, n: 12, group: "Lending" } };
  const fee = { id: "feeMultiple", value: 4, display: "4.00×" };
  assert.equal(LEADS.valuation(t, rows(fee, rev, { id: "mcapToTvl", value: 0.06, display: "0.06×" })),
    "AAVE is valued at 20.0× its yearly revenue, cheaper than 70% of 12 Lending peers; its market cap is 0.06× the value locked in it.");
  assert.match(LEADS.valuation(t, rows({ ...fee, level: 2 })), /^AAVE is valued at 4\.00× its yearly fees\.$/);
  assert.equal(LEADS.valuation(t, rows()), "There are no fees or TVL to value it against.");
  assert.equal(peerLabel({ n: 40, group: "all fee-earning tokens" }), "40 all fee-earning tokens");
});
check("unknown is not none: security and backers say 'nothing on file', never 'none'", () => {
  const t = { sym: "X", name: "X", security: { flags: [], holders: [] }, defiExtra: {}, meta: {} };
  const sec = LEADS.security(t, rows({ id: "contractFlags", value: 0 }, { id: "exploitLoss", value: null, notOnRecord: true }));
  assert.match(sec, /nothing on file for it, which is not proof that none happened\.$/);
  assert.equal(LEADS.security(t, rows()), "The contract could not be checked.");
  assert.match(LEADS.backers(t, rows({ id: "raised", value: null, notOnRecord: true })), /no funding rounds on file for it, which does not mean it raised nothing\.$/);
  assert.match(LEADS.dev(t, rows({ id: "contributors90", value: null, notOnRecord: true })), /development activity is unknown\.$/);
  assert.equal(LEADS.holders(t, rows({ id: "top10Share", value: null })), "The holder list could not be checked.");
});
check("row(a, id) returns the row, or undefined when the area does not carry it", () => {
  const a = rows({ id: "age", value: 3 });
  assert.equal(row(a, "age").value, 3);
  assert.equal(row(a, "raised"), undefined);
});

for (const [s, n] of results) console.log(`${s}  ${n}`);
const failed = results.filter(([s]) => s === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
