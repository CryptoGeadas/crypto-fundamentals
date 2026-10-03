// Daily job: builds the curated search universe and the CoinGecko ↔ DefiLlama identifier map.
// Keyless public APIs only. Writes site/data/universe.json and site/data/idmap.json.
//
// Run: node build/build-universe.mjs   (takes ~1 minute; CoinGecko calls are paced)

import { writeFile, mkdir } from "node:fs/promises";
import { llamaIndex, buildUniverse, TOP_N, MAX_RANK } from "./universe-lib.mjs";

const UA = "Mozilla/5.0 (compatible; crypto-fundamentals daily build; +https://github.com/CryptoGeadas/crypto-fundamentals)";
const CG = "https://api.coingecko.com/api/v3";
const CG_GAP_MS = 8000;          // the keyless tier throttles even at one call per ~7s
const MIN_TOKENS = TOP_N;        // never publish a universe smaller than the always-included top 300

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastCg = 0;

async function getJson(url, { coingecko = false, tries = 4 } = {}) {
  for (let attempt = 1; attempt <= tries; attempt++) {
    if (coingecko) {
      const wait = lastCg + CG_GAP_MS - Date.now();
      if (wait > 0) await sleep(wait);
      lastCg = Date.now();
    }
    const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" } });
    if (res.ok) return res.json();
    if ((res.status === 429 || res.status >= 500) && attempt < tries) {
      const backoff = res.status === 429 ? 60_000 : 10_000;
      console.log(`  ${res.status} from ${new URL(url).host}, retrying in ${backoff / 1000}s (attempt ${attempt}/${tries})`);
      await sleep(backoff);
      continue;
    }
    throw new Error(`${url} → HTTP ${res.status}`);
  }
}

async function main() {
  console.log("DefiLlama protocols, parents and chains ...");
  const [protocols, lite, chains] = await Promise.all([
    getJson("https://api.llama.fi/protocols"),
    getJson("https://api.llama.fi/lite/protocols2"),
    getJson("https://api.llama.fi/v2/chains"),
  ]);
  const llama = llamaIndex({ protocols, parents: lite.parentProtocols || [], chains });

  console.log(`CoinGecko markets, top ${MAX_RANK} ...`);
  const markets = [];
  for (let page = 1; page <= Math.ceil(MAX_RANK / 250); page++) {
    markets.push(...(await getJson(`${CG}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=${page}`, { coingecko: true })));
  }

  console.log("CoinGecko contract addresses ...");
  const list = await getJson(`${CG}/coins/list?include_platform=true`, { coingecko: true });
  const platformsById = Object.fromEntries(list.map((c) => [c.id, c.platforms]));

  const tokens = buildUniverse(markets, llama, platformsById);
  if (tokens.length < MIN_TOKENS) throw new Error(`Universe has only ${tokens.length} tokens (< ${MIN_TOKENS}); refusing to publish it.`);

  const generated = new Date().toISOString();
  await mkdir(new URL("../site/data/", import.meta.url), { recursive: true });
  await writeFile(new URL("../site/data/universe.json", import.meta.url),
    JSON.stringify({ generated, rule: `CoinGecko top ${TOP_N}, plus ranks ${TOP_N + 1}-${MAX_RANK} with any DefiLlama entry`, count: tokens.length, tokens }));
  await writeFile(new URL("../site/data/idmap.json", import.meta.url),
    JSON.stringify({ generated, count: Object.keys(llama).length, map: llama }));

  const withLlama = tokens.filter((t) => t.llama).length;
  console.log(`Universe: ${tokens.length} tokens (${withLlama} with DefiLlama data). Identifier map: ${Object.keys(llama).length} DefiLlama tokens.`);
}

main().catch((e) => { console.error(`FAILED: ${e.message}`); process.exit(1); });
