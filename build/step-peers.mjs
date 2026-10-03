// Daily step 4: peer valuation benchmarks.
//   site/data/peers.json  { groups: { <category>: [{ id, pf, pr }] }, byToken: { <id>: { group, pf, pr } } }
// pf = FDV ÷ yearly fees, pr = FDV ÷ yearly revenue (30-day totals × 12).

import { feesByToken, buildPeers } from "./peers-lib.mjs";

const API = "https://api.llama.fi";
const MIN_TOKENS = 100;   // fee-earning universe tokens today: ~300

export async function peersStep({ report, net, data }) {
  const [universe, idmap, prev] = [await data.read("universe.json"), await data.read("idmap.json"), await data.read("peers.json")];
  if (!universe || !idmap) { report.error("peers", "No token list or identifier map; peer benchmarks kept."); report.datasets.peers = { status: "kept" }; return; }

  console.log("DefiLlama fees and revenue for peer benchmarks ...");
  let fees, revenue;
  try {
    const q = "excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true";
    const [protocols, lite, chains, f, r] = await Promise.all([
      net.getJson(`${API}/protocols`, "defillama"),
      net.getJson(`${API}/lite/protocols2`, "defillama"),
      net.getJson(`${API}/v2/chains`, "defillama"),
      net.getJson(`${API}/overview/fees?${q}&dataType=dailyFees`, "defillama"),
      net.getJson(`${API}/overview/fees?${q}&dataType=dailyRevenue`, "defillama"),
    ]);
    const ctx = { protocols, parents: lite.parentProtocols || [], chains };
    fees = feesByToken({ ...ctx, feeRows: f.protocols || [] });
    revenue = feesByToken({ ...ctx, feeRows: r.protocols || [] });
  } catch (e) {
    report.error("defillama", `${e.message}; peer benchmarks kept from the last good run.`);
    report.datasets.peers = { status: "kept" };
    return;
  }

  const { groups, byToken } = buildPeers(universe.tokens, idmap.map, fees, revenue);
  const count = Object.keys(byToken).length;
  await data.publish("peers", "peers.json", { generated: new Date().toISOString(), count, groups, byToken }, count, prev?.count, MIN_TOKENS);
  const big = Object.entries(groups).sort((a, b) => b[1].length - a[1].length).slice(0, 6).map(([g, l]) => `${g} ${l.length}`).join(", ");
  console.log(`Peers: ${count} fee-earning tokens in ${Object.keys(groups).length} groups (largest: ${big}).`);
}
