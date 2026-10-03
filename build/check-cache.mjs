// Proves the per-visitor cache (site/cache.js): prices reused for 15 minutes, slow data for 12 hours,
// failures never stored, Refresh bypasses it, and a blocked or full storage falls back to live fetches.
//
// Run: node build/check-cache.mjs   (exit code 1 on any failure)

import assert from "node:assert/strict";
import { createCache, TTL } from "../site/cache.js";

const results = [];
async function check(name, fn) {
  try { await fn(); results.push(["PASS", name]); } catch (e) { results.push(["FAIL", name + " — " + e.message]); }
}
// A minimal in-memory stand-in for localStorage (keys are enumerable, like the real one).
function memStorage({ full = false } = {}) {
  const s = {};
  Object.defineProperties(s, {
    getItem: { value: (k) => (k in s ? s[k] : null) },
    setItem: { value: (k, v) => { if (full) throw new Error("QuotaExceededError"); s[k] = String(v); } },
    removeItem: { value: (k) => { delete s[k]; } },
  });
  return s;
}
function clock(start = 1_000_000) { let t = start; const now = () => t; now.add = (ms) => { t += ms; }; return now; }
const counter = (value) => { const f = async () => { f.calls++; return typeof value === "function" ? value() : value; }; f.calls = 0; return f; };

await check("prices: reused within 15 minutes, fetched again after", async () => {
  const now = clock(), c = createCache(memStorage(), now), fetchPrice = counter({ price: 1 });
  await c.get("cg:eth", TTL.market, fetchPrice);
  now.add(14 * 60 * 1000);
  const hit = await c.get("cg:eth", TTL.market, fetchPrice);
  assert.equal(fetchPrice.calls, 1);
  assert.equal(hit.at, 1_000_000, "a cached value reports when it was fetched");
  now.add(2 * 60 * 1000);
  await c.get("cg:eth", TTL.market, fetchPrice);
  assert.equal(fetchPrice.calls, 2);
});
await check("slow data: reused for 12 hours, not longer", async () => {
  const now = clock(), c = createCache(memStorage(), now), f = counter({ fees: 1 });
  await c.get("ll:aave", TTL.slow, f);
  now.add(11.9 * 3600 * 1000);
  await c.get("ll:aave", TTL.slow, f);
  assert.equal(f.calls, 1);
  now.add(0.2 * 3600 * 1000);
  await c.get("ll:aave", TTL.slow, f);
  assert.equal(f.calls, 2);
});
await check("failures are never cached; Refresh always fetches", async () => {
  const c = createCache(memStorage(), clock()), failed = counter({ failed: true });
  await c.get("ll:x", TTL.slow, failed, { keep: (v) => !v.failed });
  await c.get("ll:x", TTL.slow, failed, { keep: (v) => !v.failed });
  assert.equal(failed.calls, 2);
  const nothing = counter(null);
  await c.get("fp:x", TTL.slow, nothing); await c.get("fp:x", TTL.slow, nothing);
  assert.equal(nothing.calls, 2, "a missing answer (null) is retried next time by default");
  const ok = counter({ v: 1 });
  await c.get("cg:x", TTL.market, ok); await c.get("cg:x", TTL.market, ok, { fresh: true });
  assert.equal(ok.calls, 2);
});
await check("blocked or full storage: everything still works, just live", async () => {
  const full = createCache(memStorage({ full: true }), clock()), f = counter({ v: 1 });
  assert.deepEqual((await full.get("a", TTL.slow, f)).value, { v: 1 });
  await full.get("a", TTL.slow, f);
  assert.equal(f.calls, 2);
  const none = createCache(null, clock()), g = counter({ v: 2 });
  assert.deepEqual((await none.get("b", TTL.slow, g)).value, { v: 2 });
});
await check("prune drops only our expired entries", async () => {
  const now = clock(), st = memStorage(), c = createCache(st, now);
  st.setItem("theme", "dark");
  await c.get("old", TTL.slow, counter(1));
  now.add(13 * 3600 * 1000);
  await c.get("new", TTL.slow, counter(2));
  c.prune();
  assert.deepEqual(Object.keys(st).sort(), ["tf-cache:v1:new", "theme"]);
});

for (const [s, n] of results) console.log(`${s}  ${n}`);
const failed = results.filter(([s]) => s === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
