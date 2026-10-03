// Daily job: builds the curated search universe and the CoinGecko ↔ DefiLlama identifier map.
// Keyless public APIs only. Writes site/data/universe.json and site/data/idmap.json, but only
// when they pass their sanity checks; otherwise the previous good files are kept. Always
// writes site/data/status.json, which the page footer and the alert step read.
//
// Run: node build/build-universe.mjs   (≈1 minute; CoinGecko calls are paced)
// Test the alert flow: SIMULATE_PROBLEM=1 node build/build-universe.mjs

import { writeFile, readFile, mkdir } from "node:fs/promises";
import { llamaIndex, buildUniverse, feeEarners, TOP_N, MAX_RANK } from "./universe-lib.mjs";
import { Report, sanityCheck } from "./report.mjs";

const UA = "Mozilla/5.0 (compatible; crypto-fundamentals daily build; +https://github.com/CryptoGeadas/crypto-fundamentals)";
const CG = "https://api.coingecko.com/api/v3";
const CG_GAP_MS = 8000;      // the keyless tier throttles even at one call per ~7s
const DATA = new URL("../site/data/", import.meta.url);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const report = new Report();
let lastCg = 0;

async function getJson(url, source, { coingecko = false, tries = 4 } = {}) {
  const host = new URL(url).host;
  for (let attempt = 1; attempt <= tries; attempt++) {
    if (coingecko) {
      const wait = lastCg + CG_GAP_MS - Date.now();
      if (wait > 0) await sleep(wait);
      lastCg = Date.now();
    }
    let res;
    try {
      res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" } });
    } catch (e) {
      if (attempt < tries) { report.warn(source, `${host} unreachable (${e.cause?.code || e.message}), retried`); await sleep(10_000); continue; }
      throw new Error(`${host} unreachable after ${tries} attempts`);
    }
    if (res.ok) { report.ok(source); return res.json(); }
    if ((res.status === 429 || res.status >= 500) && attempt < tries) {
      const backoff = res.status === 429 ? 60_000 : 10_000;
      report.warn(source, `HTTP ${res.status} from ${host}${res.status === 429 ? " (rate limited)" : ""}, retried after ${backoff / 1000}s`);
      console.log(`  ${res.status} from ${host}, retrying in ${backoff / 1000}s (attempt ${attempt}/${tries})`);
      await sleep(backoff);
      continue;
    }
    throw new Error(`${host} answered HTTP ${res.status} for ${new URL(url).pathname}`);
  }
}

async function readJson(name) {
  try { return JSON.parse(await readFile(new URL(name, DATA), "utf8")); } catch { return null; }
}

// Writes a dataset only if it passes its sanity check against the last good version.
async function publish(name, file, payload, count, previous, minCount) {
  const problem = sanityCheck(name, count, previous?.count, minCount);
  if (problem) {
    report.error(name, problem);
    report.datasets[name] = { status: "kept", count: previous?.count ?? null };
    return;
  }
  await writeFile(new URL(file, DATA), JSON.stringify(payload));
  report.datasets[name] = { status: "updated", count, lastSuccess: payload.generated };
}

async function build(prev) {
  console.log("DefiLlama protocols, parents and chains ...");
  let llama;
  try {
    const [protocols, lite, chains, feeOverview] = await Promise.all([
      getJson("https://api.llama.fi/protocols", "defillama"),
      getJson("https://api.llama.fi/lite/protocols2", "defillama"),
      getJson("https://api.llama.fi/v2/chains", "defillama"),
      getJson("https://api.llama.fi/overview/fees?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true", "defillama"),
    ]);
    const parents = lite.parentProtocols || [];
    const fees = feeEarners({ feeRows: feeOverview.protocols || [], protocols, parents, chains });
    llama = llamaIndex({ protocols, parents, chains, fees });
  } catch (e) {
    report.error("defillama", `${e.message}; universe and identifier map kept from the last good run.`);
    report.datasets.universe = { status: "kept" };
    report.datasets.idmap = { status: "kept" };
    return;
  }

  console.log(`CoinGecko markets, top ${MAX_RANK} ...`);
  let markets = [], list;
  try {
    for (let page = 1; page <= Math.ceil(MAX_RANK / 250); page++) {
      markets.push(...(await getJson(`${CG}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=${page}`, "coingecko", { coingecko: true })));
    }
    console.log("CoinGecko contract addresses ...");
    list = await getJson(`${CG}/coins/list?include_platform=true`, "coingecko", { coingecko: true });
  } catch (e) {
    report.error("coingecko", `${e.message}; universe kept from the last good run.`);
    report.datasets.universe = { status: "kept" };
    markets = null;
  }

  const generated = new Date().toISOString();
  await publish("idmap", "idmap.json", { generated, count: Object.keys(llama).length, map: llama },
    Object.keys(llama).length, prev.idmap, 1000);

  if (markets) {
    const platformsById = Object.fromEntries(list.map((c) => [c.id, c.platforms]));
    const tokens = buildUniverse(markets, llama, platformsById);
    await publish("universe", "universe.json",
      { generated, rule: `CoinGecko top ${TOP_N}, plus ranks ${TOP_N + 1}-${MAX_RANK} with any DefiLlama entry`, count: tokens.length, tokens },
      tokens.length, prev.universe, TOP_N);
    console.log(`Built universe: ${tokens.length} tokens (${tokens.filter((t) => t.llama).length} with DefiLlama data). Identifier map: ${Object.keys(llama).length} DefiLlama tokens.`);
  }
}

async function main() {
  await mkdir(DATA, { recursive: true });
  const prev = { universe: await readJson("universe.json"), idmap: await readJson("idmap.json") };
  const prevStatus = (await readJson("status.json")) || {};
  let crashed = null;
  try {
    if (process.env.SIMULATE_PROBLEM === "1") report.warn("test", "Simulated problem from a manual test run; no data was affected.");
    await build(prev);
  } catch (e) {
    crashed = e;
    report.error("build", `The job crashed: ${e.message}. All previous data kept.`);
  }
  const status = report.status(prevStatus);
  await writeFile(new URL("status.json", DATA), JSON.stringify(status, null, 2));
  console.log(`Status: ${status.healthy ? "healthy" : `${status.problems.length} problem(s)`}.`);
  for (const p of status.problems) console.log(`  ${p.level.toUpperCase()} ${p.source}: ${p.message}`);
  if (crashed) { console.error(crashed); process.exit(1); }
}

main();
