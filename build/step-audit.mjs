// Daily step 7 (last): self-audit (issue #28). Compares what the page computes with figures the
// sources publish themselves and writes site/data/audit.json; build/audit-issue.mjs turns it into the
// "Data drift" issue. Never changes other data and never fails the run: a failed call is only logged.
//   site/data/audit.json  { generated, cursor: { fees, tvl }, sampled: { fees, tvl }, items: [{ check, id, detail }], previousKeys }

import { coingeckoDrift, supplyDrift, feeDrift, tvlDrift, rotate, keyOf } from "./audit-lib.mjs";
import { feeWindows, feeSource } from "../site/llama.js";
import { classify } from "../site/classify.js";
import { sleep } from "./net.mjs";

const CG = "https://api.coingecko.com/api/v3";
const API = "https://api.llama.fi";
const SAMPLE = Number(process.env.AUDIT_SAMPLE) || 30;

export async function auditStep({ net, data }) {
  const [universe, idmapFile, unlocksFile, defiFile, prev] = await Promise.all(
    ["universe.json", "idmap.json", "unlocks.json", "defi.json", "audit.json"].map((f) => data.read(f)));
  if (!universe) { console.log("Audit: no token list; skipped."); return; }
  const ids = universe.tokens.map((t) => t.id);
  const idmap = idmapFile?.map || {}, unlocks = unlocksFile?.tokens || {}, defi = defiFile?.tokens || {};
  const items = [];
  let failures = 0;

  // 1. CoinGecko consistency, all tokens.
  const markets = {};
  // 100 ids per call: CoinGecko refuses (HTTP 403) URLs much over ~2,000 characters.
  for (let i = 0; i < ids.length; i += 100) {
    try {
      const rows = await net.getJson(`${CG}/coins/markets?vs_currency=usd&per_page=100&ids=${ids.slice(i, i + 100).map(encodeURIComponent).join(",")}`, "audit", { coingecko: true });
      for (const m of rows) { markets[m.id] = m; items.push(...coingeckoDrift(m)); }
    } catch (e) { failures++; console.log(`  audit: CoinGecko markets batch failed (${e.message})`); }
  }

  // 2. Circulating supply: DefiLlama (unlock data) vs CoinGecko.
  for (const [id, u] of Object.entries(unlocks)) items.push(...supplyDrift(id, u.circ, markets[id]?.circulating_supply));

  // 3. Fee windows, rotating sample: the page's own 30-day calculation vs DefiLlama's 30-day total.
  // Same series the page uses (shared rule); only tokens DefiLlama marks as fee earners.
  const feeSlug = (e) => (e?.f || e?.fc ? feeSource(e, classify(e, [])) : null);
  const feeIds = ids.filter((id) => feeSlug(idmap[id]));
  const fees = rotate(feeIds, prev?.cursor?.fees, SAMPLE);
  for (const id of fees.pick) {
    try {
      const d = await net.getJson(`${API}/summary/fees/${encodeURIComponent(feeSlug(idmap[id]))}?dataType=dailyFees`, "audit", { tries: 2 });
      const w = feeWindows(d.totalDataChart || [], undefined, { reportsLatestDay: d.total24h != null });
      if (!w.stale) items.push(...feeDrift(id, w.d30, d.total30d));   // stale series are shown as unknown, correctly (#32)
    } catch (e) { if (!/HTTP 40[04]/.test(e.message)) { failures++; console.log(`  audit: fees for ${id} failed (${e.message})`); } }
    await sleep(400);
  }

  // 4. TVL, rotating sample: the stored TVL vs DefiLlama's own protocol TVL.
  const tvlIds = ids.filter((id) => defi[id]?.tvl > 0 && idmap[id]?.p);
  const tvl = rotate(tvlIds, prev?.cursor?.tvl, SAMPLE);
  for (const id of tvl.pick) {
    try {
      const v = await net.getJson(`${API}/tvl/${encodeURIComponent(idmap[id].p)}`, "audit", { tries: 2 });
      items.push(...tvlDrift(id, defi[id].tvl, Number(v)));
    } catch (e) {
      if (!/HTTP 40[04]/.test(e.message)) { failures++; console.log(`  audit: TVL for ${id} failed (${e.message})`); }
    }
    await sleep(400);
  }

  // Sampled checks only cover today's slice, so keep yesterday's sampled items for tokens not re-checked
  // today; they leave the list once their next turn comes round and they pass.
  const checkedToday = { fees30: new Set(fees.pick), tvl: new Set(tvl.pick) };
  const carried = (prev?.items || []).filter((it) => checkedToday[it.check] && !checkedToday[it.check].has(it.id));
  const all = [...items, ...carried];
  await data.write("audit.json", {
    generated: new Date().toISOString(),
    cursor: { fees: fees.next, tvl: tvl.next },
    sampled: { fees: fees.pick.length, tvl: tvl.pick.length, feeEligible: feeIds.length, tvlEligible: tvlIds.length },
    failures,
    previousKeys: (prev?.items || []).map(keyOf),
    items: all,
  });
  console.log(`Audit: ${all.length} drift item(s); sampled ${fees.pick.length}/${feeIds.length} for fees, ${tvl.pick.length}/${tvlIds.length} for TVL; ${failures} call(s) failed.`);
}
