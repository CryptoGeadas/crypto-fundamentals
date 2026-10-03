// Network helpers for the daily job: paced JSON API calls with retries.
// Retries are logged in the run report (not alerted); a call that fails after every retry throws.

export const UA_API = "Mozilla/5.0 (compatible; crypto-fundamentals daily build; +https://github.com/CryptoGeadas/crypto-fundamentals)";
const CG_GAP_MS = 8000; // the CoinGecko keyless tier throttles even at one call per ~7s

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createNet(report) {
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
        res = await fetch(url, { headers: { "user-agent": UA_API, accept: "application/json" } });
      } catch (e) {
        if (attempt < tries) { report.retry(source, `${host} unreachable (${e.cause?.code || e.message}), retried`); await sleep(10_000); continue; }
        throw new Error(`${host} unreachable after ${tries} attempts`);
      }
      if (res.ok) { report.ok(source); return res.json(); }
      if ((res.status === 429 || res.status >= 500) && attempt < tries) {
        const backoff = res.status === 429 ? 60_000 : 10_000;
        report.retry(source, `HTTP ${res.status} from ${host}${res.status === 429 ? " (rate limited)" : ""}, retried after ${backoff / 1000}s`);
        console.log(`  ${res.status} from ${host}, retrying in ${backoff / 1000}s (attempt ${attempt}/${tries})`);
        await sleep(backoff);
        continue;
      }
      throw new Error(`${host} answered HTTP ${res.status} for ${new URL(url).pathname}`);
    }
  }

  return { getJson };
}
