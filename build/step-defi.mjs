// Daily step 3: protocol TVL (now vs a month ago) and treasury breakdowns, precomputed because the
// per-protocol endpoints are too heavy for a visitor's browser (/protocol/aave 3 MB, /treasury/aave 4 MB).
//   site/data/defi.json   { tokens: { <gecko_id>: { tvl, tvlPrevMonth, treasury: { own, other, at } | null, hacks: [...], audits: { count, links } | null } } }

import { tvlByToken, treasurySummary, treasuriesToRefresh, hacksByToken, auditsByToken } from "./defi-lib.mjs";
import { sleep } from "./net.mjs";

const API = "https://api.llama.fi";
const MIN_TOKENS = 200;   // universe tokens with a DefiLlama protocol today: ~480

export async function defiStep({ report, net, data }) {
  const [idmap, universe, prev] = [await data.read("idmap.json"), await data.read("universe.json"), await data.read("defi.json")];
  if (!idmap || !universe) { report.error("defi", "No identifier map or token list; protocol data kept."); report.datasets.defi = { status: "kept" }; return; }
  const ids = new Set(universe.tokens.map((t) => t.id));

  console.log("DefiLlama protocol TVL ...");
  let tvl, hacks, audits;
  try {
    const [protocols, lite, hackList] = await Promise.all([
      net.getJson(`${API}/protocols`, "defillama"), net.getJson(`${API}/lite/protocols2`, "defillama"), net.getJson(`${API}/hacks`, "defillama"),
    ]);
    const parents = lite.parentProtocols || [];
    tvl = tvlByToken({ protocols, lite: lite.protocols || [], parents, idmap: idmap.map, ids });
    hacks = hacksByToken({ hacks: hackList, protocols, parents });
    audits = auditsByToken({ protocols, parents });
  } catch (e) {
    report.error("defillama", `${e.message}; protocol data kept from the last good run.`);
    report.datasets.defi = { status: "kept" };
    return;
  }

  // Treasuries: weekly rotation, like unlock schedules; protocols without one are parked for 30 days.
  const stored = prev?.tokens || {};
  const candidates = Object.fromEntries([...ids].filter((id) => idmap.map[id]?.p).map((id) => [id, idmap.map[id].p]));
  const due = treasuriesToRefresh(candidates, stored, Date.now() / 1000, Number(process.env.TREASURY_CAP) || undefined);
  console.log(`Treasuries to refresh: ${due.length} of ${Object.keys(candidates).length}`);
  const treasury = Object.fromEntries(Object.entries(stored).map(([id, v]) => [id, v.treasury ?? null]));
  let fetched = 0;
  for (const id of due) {
    const res = await fetch(`${API}/treasury/${encodeURIComponent(candidates[id])}`, { headers: { accept: "application/json" } }).catch(() => null);
    if (res?.ok) {
      try { treasury[id] = treasurySummary(await res.json()); fetched++; }
      catch (e) { report.warn("defillama", `Treasury for ${id} unreadable (${e.message}); kept previous.`); }
    } else if (res && (res.status === 400 || res.status === 404)) {
      treasury[id] = { none: true, at: new Date().toISOString() };      // no treasury tracked
    } else {
      report.warn("defillama", `Treasury for ${id} not refreshed (${res ? `HTTP ${res.status}` : "unreachable"}); kept previous.`);
    }
    await sleep(400);
  }

  const tokens = {};
  for (const id of new Set([...Object.keys(tvl), ...Object.keys(treasury), ...Object.keys(hacks), ...Object.keys(audits)])) {
    if (!ids.has(id)) continue;
    tokens[id] = { ...(tvl[id] || {}), treasury: treasury[id] ?? null, hacks: hacks[id] || [], audits: audits[id] || null };
  }
  await data.publish("defi", "defi.json", { generated: new Date().toISOString(), count: Object.keys(tokens).length, tokens },
    Object.keys(tokens).length, prev?.count, MIN_TOKENS);
  console.log(`DeFi: ${Object.keys(tokens).length} tokens with TVL or treasury; treasuries refreshed ${fetched}.`);
}
