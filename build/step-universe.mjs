// Daily step 1: the curated search universe and the CoinGecko ↔ DefiLlama identifier map.

import { llamaIndex, buildUniverse, feeEarners, TOP_N, MAX_RANK } from "./universe-lib.mjs";

const CG = "https://api.coingecko.com/api/v3";

export async function universeStep({ report, net, data }) {
  const prev = { universe: await data.read("universe.json"), idmap: await data.read("idmap.json") };

  console.log("DefiLlama protocols, parents, chains and fees ...");
  let llama;
  try {
    const [protocols, lite, chains, feeOverview] = await Promise.all([
      net.getJson("https://api.llama.fi/protocols", "defillama"),
      net.getJson("https://api.llama.fi/lite/protocols2", "defillama"),
      net.getJson("https://api.llama.fi/v2/chains", "defillama"),
      net.getJson("https://api.llama.fi/overview/fees?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true", "defillama"),
    ]);
    const parents = lite.parentProtocols || [];
    const fees = feeEarners({ feeRows: feeOverview.protocols || [], protocols, parents, chains });
    llama = llamaIndex({ protocols, parents, chains, fees });
  } catch (e) {
    report.error("defillama", `${e.message}; token list and identifier map kept from the last good run.`);
    report.datasets.universe = { status: "kept" };
    report.datasets.idmap = { status: "kept" };
    return;
  }

  console.log(`CoinGecko markets, top ${MAX_RANK}, and contract addresses ...`);
  let markets = [], list;
  try {
    for (let page = 1; page <= Math.ceil(MAX_RANK / 250); page++) {
      markets.push(...(await net.getJson(`${CG}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=${page}`, "coingecko", { coingecko: true })));
    }
    list = await net.getJson(`${CG}/coins/list?include_platform=true`, "coingecko", { coingecko: true });
  } catch (e) {
    report.error("coingecko", `${e.message}; token list kept from the last good run.`);
    report.datasets.universe = { status: "kept" };
    markets = null;
  }

  const generated = new Date().toISOString();
  await data.publish("idmap", "idmap.json", { generated, count: Object.keys(llama).length, map: llama },
    Object.keys(llama).length, prev.idmap?.count, 1000);

  if (markets) {
    const platformsById = Object.fromEntries(list.map((c) => [c.id, c.platforms]));
    const tokens = buildUniverse(markets, llama, platformsById);
    await data.publish("universe", "universe.json",
      { generated, rule: `CoinGecko top ${TOP_N}, plus ranks ${TOP_N + 1}-${MAX_RANK} with any DefiLlama entry`, count: tokens.length, tokens },
      tokens.length, prev.universe?.count, TOP_N);
    console.log(`Built universe: ${tokens.length} tokens (${tokens.filter((t) => t.llama).length} with DefiLlama data); identifier map: ${Object.keys(llama).length}.`);
  }
}
