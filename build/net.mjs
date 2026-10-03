// Network helpers for the daily job: paced JSON API calls with retries, and HTML page fetches.
// Every retry or failure is recorded in the run report.

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
export const UA_API = "Mozilla/5.0 (compatible; crypto-fundamentals daily build; +https://github.com/CryptoGeadas/crypto-fundamentals)";
// defillama.com pages sit behind Cloudflare, which challenges Node's fetch (TLS fingerprint) but
// serves curl with a browser user-agent. So pages are fetched with curl (preinstalled on runners).
const UA_PAGE = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";
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

  // Returns the page HTML, or throws. `quiet` failures are left to the caller to report.
  async function getPage(url, source, { tries = 3 } = {}) {
    for (let attempt = 1; attempt <= tries; attempt++) {
      try {
        const { stdout } = await run("curl", ["-sS", "--compressed", "-m", "60", "-A", UA_PAGE, "-H", "Accept: text/html", "-w", "\n%{http_code}", url],
          { maxBuffer: 64 * 1024 * 1024 });
        const cut = stdout.lastIndexOf("\n");
        const code = Number(stdout.slice(cut + 1));
        const body = stdout.slice(0, cut);
        if (code === 200 && body.includes("__NEXT_DATA__")) { report.ok(source); return body; }
        const why = code === 200 ? "page without data (likely a bot challenge)" : `HTTP ${code}`;
        if (attempt < tries) { await sleep(5_000 * attempt); continue; }
        throw new Error(`${new URL(url).host}${new URL(url).pathname}: ${why}`);
      } catch (e) {
        if (attempt < tries && !/HTTP|challenge/.test(e.message)) { await sleep(5_000 * attempt); continue; }
        throw e;
      }
    }
  }

  return { getJson, getPage };
}
